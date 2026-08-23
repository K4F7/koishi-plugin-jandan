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
  url: string
  data: Buffer
  mime: string
}

export interface PreparedPost {
  author: string
  images: PreparedImage[]
}

export interface PreparedList {
  label: string
  posts: PreparedPost[]
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

export const DOWNLOAD_CONCURRENCY = 4
export const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024

export interface PrepareOptions {
  skipGif?: boolean
  concurrency?: number
  maxBytes?: number
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const ret: R[] = new Array(items.length)
  let next = 0
  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < items.length) {
      const index = next++
      ret[index] = await fn(items[index], index)
    }
  }))
  return ret
}

export async function downloadImage(http: HTTP, url: string, options: PrepareOptions = {}): Promise<PreparedImage | null> {
  const skipGif = options.skipGif ?? true
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES
  if (skipGif && isGifUrl(url)) return null
  const data = Buffer.from(await http.get<ArrayBuffer>(url, {
    headers: httpHeaders,
    responseType: 'arraybuffer',
  }))
  if (skipGif && isGifBuffer(data)) return null
  if (maxBytes > 0 && data.length > maxBytes) return null
  return { url, data, mime: detectMime(data) }
}

export async function preparePosts(
  http: HTTP,
  posts: JandanPost[],
  options: PrepareOptions = {},
): Promise<PreparedPost[]> {
  const skipGif = options.skipGif ?? true
  const concurrency = options.concurrency ?? DOWNLOAD_CONCURRENCY
  const tasks: { postIndex: number; url: string }[] = []
  for (let i = 0; i < posts.length; i++) {
    for (const url of extractImageUrls(posts[i].content ?? '')) {
      if (skipGif && isGifUrl(url)) continue
      tasks.push({ postIndex: i, url })
    }
  }

  const results = await mapLimit(tasks, concurrency, async (task) => {
    try {
      return await downloadImage(http, task.url, options)
    } catch {
      return null
    }
  })

  const byPost = new Map<number, PreparedImage[]>()
  for (let i = 0; i < results.length; i++) {
    const image = results[i]
    if (!image) continue
    const { postIndex } = tasks[i]
    const images = byPost.get(postIndex) ?? []
    images.push(image)
    byPost.set(postIndex, images)
  }

  const prepared: PreparedPost[] = []
  for (let i = 0; i < posts.length; i++) {
    const images = byPost.get(i)
    if (images?.length) prepared.push({ author: posts[i].author || '匿名', images })
  }
  return prepared
}

export const IMAGES_PER_NODE = 20

export function flattenImages(posts: PreparedPost[]) {
  return posts.flatMap(post => post.images)
}

export function packImageNodes(posts: PreparedPost[]) {
  const images = flattenImages(posts)
  const nodes: ReturnType<typeof h>[] = []
  for (let i = 0; i < images.length; i += IMAGES_PER_NODE) {
    const chunk = images.slice(i, i + IMAGES_PER_NODE)
    nodes.push(h('message', chunk.map(image => h.image(image.data, image.mime))))
  }
  return nodes
}

export function packPostImageNodes(posts: PreparedPost[]) {
  return posts
    .filter(post => post.images.length)
    .map(post => h('message', post.images.map(image => h.image(image.data, image.mime))))
}

export function packListForward(label: string, posts: PreparedPost[]) {
  return h('message', { forward: true }, [
    h('message', [h('author', { name: '煎蛋热榜' }), label]),
    ...packImageNodes(posts),
  ])
}

export function composeForwardEach(prepared: PreparedList[]) {
  const label = prepared.map(item => item.label).join(' ')
  const posts = prepared.flatMap(item => item.posts)
  return h('message', { forward: true }, [
    h('message', [h('author', { name: '煎蛋热榜' }), label]),
    ...packPostImageNodes(posts),
  ])
}

export function composeForwardFromUrls(label: string, urls: string[]) {
  return h('message', { forward: true }, [
    h('message', [h('author', { name: '煎蛋热榜' }), label]),
    ...urls.map(url => h('message', [h.image(url)])),
  ])
}

export function extractForwardImageSrcs(payload: unknown): string[] {
  const urls: string[] = []
  const seen = new Set<unknown>()
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    const rec = value as Record<string, unknown>
    const data = rec.data
    if ((rec.type === 'image' || rec.type === 'img') && data && typeof data === 'object') {
      const fields = data as Record<string, unknown>
      const src = [fields.url, fields.file, fields.path].find((item): item is string => (
        typeof item === 'string'
        && item.length > 0
        && !item.startsWith('data:')
        && !item.startsWith('base64://')
      ))
      if (src) urls.push(src)
    }
    visit(rec.messages)
    visit(rec.message)
    visit(rec.content)
    visit(rec.data)
  }
  visit(payload)
  return urls
}

export function composeForward(prepared: PreparedList[]) {
  const label = prepared.map(item => item.label).join(' ')
  const posts = prepared.flatMap(item => item.posts)
  return packListForward(label, posts)
}

export function pickRandomImage(lists: PreparedPost[][]): PreparedImage | null {
  const images = lists.flatMap(posts => posts.flatMap(post => post.images))
  if (!images.length) return null
  return images[Math.floor(Math.random() * images.length)]
}

export function pickRandomPost(posts: PreparedPost[]): PreparedPost | null {
  const candidates = posts.filter(post => post.images.length)
  if (!candidates.length) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}

export async function buildPayload(http: HTTP, kinds: ListKind[], options: PrepareOptions = {}) {
  const prepared: PreparedList[] = []
  for (const kind of kinds) {
    const posts = await preparePosts(http, await fetchList(http, kind), options)
    if (posts.length) prepared.push({ label: LIST_LABELS[kind], posts })
  }
  return prepared
}
