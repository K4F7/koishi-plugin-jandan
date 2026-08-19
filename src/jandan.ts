import { h, HTTP } from 'koishi'

export type ListKind = 'daily' | '4hr' | 'pic3days' | 'pic7days' | 'ooxx'

export const REFERER = 'https://jandan.net/top'

export const LIST_ENDPOINTS: Record<ListKind, string> = {
  daily: 'https://jandan.net/api/top/post/26402',
  ooxx: 'https://jandan.net/api/top/post/21183',
  '4hr': 'https://jandan.net/api/top/4hr',
  pic3days: 'https://jandan.net/api/top/pic3days',
  pic7days: 'https://jandan.net/api/top/pic7days',
}

export const LIST_LABELS: Record<ListKind, string> = {
  daily: '无聊图',
  ooxx: '随手拍',
  '4hr': '4小时',
  pic3days: '3日无聊图',
  pic7days: '7日无聊图',
}

const ALIASES: Record<string, ListKind> = {
  daily: 'daily',
  pic: 'daily',
  无聊图: 'daily',
  '4hr': '4hr',
  '4h': '4hr',
  '4小时': '4hr',
  pic3days: 'pic3days',
  '3d': 'pic3days',
  '3日': 'pic3days',
  pic7days: 'pic7days',
  '7d': 'pic7days',
  '7日': 'pic7days',
  ooxx: 'ooxx',
  随手拍: 'ooxx',
}

export interface JandanPost {
  id: number
  author: string
  content: string
}

export interface PreparedImage {
  data: Buffer
  mime: string
}

export interface PreparedPost {
  author: string
  images: PreparedImage[]
}

interface TopResponse {
  code: number
  msg: string
  data: JandanPost[] | null
}

export function rewriteImageUrl(url: string): string {
  return url
    .replace(/^http:\/\//i, 'https://')
    .replace(/\/mw600\//g, '/large/')
    .replace(/\/mw1024\//g, '/large/')
}

export function extractImageUrls(content: string): string[] {
  const urls: string[] = []
  const pattern = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi
  for (const match of content.matchAll(pattern)) {
    urls.push(rewriteImageUrl(match[1]))
  }
  return urls
}

export function isGifUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.gif')
  } catch {
    return /\.gif(?:$|[?#])/i.test(url)
  }
}

export function isGifBuffer(data: Uint8Array): boolean {
  return data.length >= 4
    && data[0] === 0x47
    && data[1] === 0x49
    && data[2] === 0x46
    && data[3] === 0x38
}

export function detectMime(data: Uint8Array): string {
  if (isGifBuffer(data)) return 'image/gif'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50) return 'image/png'
  if (data.length >= 12 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
    return 'image/webp'
  }
  return 'image/jpeg'
}

export function parseListNames(input: string): { lists: ListKind[]; unknown: string[] } {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  const lists: ListKind[] = []
  const unknown: string[] = []
  const seen = new Set<ListKind>()
  for (const token of tokens) {
    if (token.startsWith('-')) continue
    const kind = ALIASES[token] ?? ALIASES[token.toLowerCase()]
    if (!kind) {
      unknown.push(token)
      continue
    }
    if (seen.has(kind)) continue
    seen.add(kind)
    lists.push(kind)
  }
  return { lists, unknown }
}

const httpHeaders = { Referer: REFERER }

export async function fetchList(http: HTTP, kind: ListKind): Promise<JandanPost[]> {
  const body = await http.get<TopResponse>(LIST_ENDPOINTS[kind], { headers: httpHeaders })
  if (!body || body.code !== 0) {
    throw new Error(body?.msg || `failed to fetch ${kind}`)
  }
  return body.data ?? []
}

export async function downloadImage(http: HTTP, url: string, skipGif: boolean): Promise<PreparedImage | null> {
  if (skipGif && isGifUrl(url)) return null
  const data = Buffer.from(await http.get<ArrayBuffer>(url, {
    headers: httpHeaders,
    responseType: 'arraybuffer',
  }))
  if (skipGif && isGifBuffer(data)) return null
  return { data, mime: detectMime(data) }
}

export async function preparePosts(http: HTTP, posts: JandanPost[], skipGif: boolean): Promise<PreparedPost[]> {
  const prepared: PreparedPost[] = []
  for (const post of posts) {
    const images: PreparedImage[] = []
    for (const url of extractImageUrls(post.content ?? '')) {
      try {
        const image = await downloadImage(http, url, skipGif)
        if (image) images.push(image)
      } catch {
        // skip a single failed image
      }
    }
    if (images.length) prepared.push({ author: post.author || '匿名', images })
  }
  return prepared
}

export function packListForward(label: string, posts: PreparedPost[]) {
  const nodes = posts.map(post => h('message', [
    h('author', { name: post.author }),
    ...post.images.map(image => h.image(image.data, image.mime)),
  ]))
  return h('message', { forward: true }, [
    h('message', [h('author', { name: '煎蛋热榜' }), label]),
    ...nodes,
  ])
}

export function packNestedForward(lists: ReturnType<typeof packListForward>[]) {
  return h('message', { forward: true }, lists)
}

export function pickRandomImage(lists: PreparedPost[][]): PreparedImage | null {
  const images = lists.flatMap(posts => posts.flatMap(post => post.images))
  if (!images.length) return null
  return images[Math.floor(Math.random() * images.length)]
}

export async function buildPayload(http: HTTP, kinds: ListKind[], skipGif: boolean) {
  const prepared: { label: string; posts: PreparedPost[] }[] = []
  for (const kind of kinds) {
    const posts = await preparePosts(http, await fetchList(http, kind), skipGif)
    if (posts.length) prepared.push({ label: LIST_LABELS[kind], posts })
  }
  return prepared
}

export function composeForward(prepared: { label: string; posts: PreparedPost[] }[]) {
  const packed = prepared.map(item => packListForward(item.label, item.posts))
  if (packed.length === 1) return packed[0]
  return packNestedForward(packed)
}
