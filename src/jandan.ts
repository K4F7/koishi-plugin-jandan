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
export const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const WEBP_QUALITY = 80 as const

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

interface WasmCodec {
  init(): Promise<{
    load?(buffer: Uint8Array): { width: number; height: number; buffer: Uint8Array }
    decode?(buffer: Uint8Array): { width: number; height: number; framebuffer: Uint8Array }
  }>
}

let encodeChain: Promise<unknown> = Promise.resolve()

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = encodeChain.then(fn, fn)
  encodeChain = next.then(() => undefined, () => undefined)
  return next
}

async function decodeRgba(data: Buffer, mime: string): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (mime === 'image/jpeg') {
    const jpeg = require('imagescript/wasm/node/jpeg.js') as WasmCodec
    const frame = (await jpeg.init()).load!(bytes)
    return {
      width: frame.width,
      height: frame.height,
      data: new Uint8ClampedArray(frame.buffer.buffer, frame.buffer.byteOffset, frame.buffer.byteLength),
    }
  }
  if (mime === 'image/png') {
    const png = require('imagescript/wasm/node/png.js') as WasmCodec
    const frame = (await png.init()).decode!(bytes)
    return {
      width: frame.width,
      height: frame.height,
      data: new Uint8ClampedArray(frame.framebuffer.buffer, frame.framebuffer.byteOffset, frame.framebuffer.byteLength),
    }
  }
  throw new Error(`unsupported mime ${mime}`)
}

export async function encodeWebp(data: Buffer, mime: string): Promise<{ data: Buffer; mime: string }> {
  if (mime === 'image/gif' || mime === 'image/webp') return { data, mime }
  return runExclusive(async () => {
    try {
      const image = await decodeRgba(data, mime)
      const webp = require('webp-wasm') as {
        encode(
          frame: { data: Uint8ClampedArray; width: number; height: number },
          opts?: { quality?: number; low_memory?: number },
        ): Promise<Buffer>
      }
      const out = await webp.encode(image, { quality: WEBP_QUALITY, low_memory: 1 })
      if (!out?.length || out.length >= data.length) return { data, mime }
      return { data: Buffer.from(out), mime: 'image/webp' }
    } catch {
      return { data, mime }
    }
  })
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
  const encoded = await encodeWebp(data, detectMime(data))
  if (maxBytes > 0 && encoded.data.length > maxBytes) return null
  return { url, ...encoded }
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

export function packImageNodes(posts: PreparedPost[]) {
  return posts.flatMap(post => post.images.map(image => h('message', [h.image(image.data, image.mime)])))
}

export function packListForward(label: string, posts: PreparedPost[]) {
  return h('message', { forward: true }, [
    h('message', [h('author', { name: '煎蛋热榜' }), label]),
    ...packImageNodes(posts),
  ])
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

export async function buildPayload(http: HTTP, kinds: ListKind[], options: PrepareOptions = {}) {
  const prepared: PreparedList[] = []
  for (const kind of kinds) {
    const posts = await preparePosts(http, await fetchList(http, kind), options)
    if (posts.length) prepared.push({ label: LIST_LABELS[kind], posts })
  }
  return prepared
}
