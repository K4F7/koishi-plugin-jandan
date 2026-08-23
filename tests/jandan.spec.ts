import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAdapterTimeout, withResponseTimeout } from '../src/index'
import {
  IMAGES_PER_NODE,
  composeForward,
  composeForwardEach,
  composeForwardFromUrls,
  detectMime,
  extractForwardImageSrcs,
  extractImageUrls,
  isGifBuffer,
  isGifUrl,
  mapLimit,
  packListForward,
  parseListNames,
  pickRandomPost,
  preparePosts,
  rewriteImageUrl,
  type JandanPost,
  type PreparedPost,
} from '../src/jandan'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])

function fakePosts(count: number, imagesPerPost = 1): PreparedPost[] {
  return Array.from({ length: count }, (_, i) => ({
    author: `u${i}`,
    images: Array.from({ length: imagesPerPost }, (_, j) => ({
      url: `https://img.example.com/${i}-${j}.jpg`,
      data: JPEG,
      mime: 'image/jpeg',
    })),
  }))
}

describe('rewriteImageUrl', () => {
  it('rewrites mw600 and mw1024 to large and upgrades http', () => {
    assert.equal(
      rewriteImageUrl('http://img.toto.im/mw600/foo.jpg'),
      'https://img.toto.im/large/foo.jpg',
    )
    assert.equal(
      rewriteImageUrl('https://img.wangmoyu.com/mw1024/bar.png'),
      'https://img.wangmoyu.com/large/bar.png',
    )
  })
})

describe('extractImageUrls', () => {
  it('reads img src from content and rewrites size path', () => {
    const content = 'text\n<img src="https://img.toto.im/mw600/a.jpg" />\n<img src="https://img.wangmoyu.com/mw1024/b.png" />'
    assert.deepEqual(extractImageUrls(content), [
      'https://img.toto.im/large/a.jpg',
      'https://img.wangmoyu.com/large/b.png',
    ])
  })
})

describe('gif detection', () => {
  it('treats .gif urls as gif', () => {
    assert.equal(isGifUrl('https://img.toto.im/large/foo.gif'), true)
    assert.equal(isGifUrl('https://img.toto.im/large/foo.jpg'), false)
  })

  it('detects GIF8 magic bytes', () => {
    const gif = Buffer.from('GIF89a....')
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    assert.equal(isGifBuffer(gif), true)
    assert.equal(isGifBuffer(jpeg), false)
    assert.equal(detectMime(gif), 'image/gif')
    assert.equal(detectMime(jpeg), 'image/jpeg')
  })
})

describe('parseListNames', () => {
  it('maps chinese and english aliases and keeps order without duplicates', () => {
    assert.deepEqual(parseListNames('无聊图 随手拍 4小时'), {
      lists: ['daily', 'ooxx', '4hr'],
      unknown: [],
    })
    assert.deepEqual(parseListNames('pic ooxx pic'), {
      lists: ['daily', 'ooxx'],
      unknown: [],
    })
  })

  it('reports unknown tokens', () => {
    assert.deepEqual(parseListNames('zoo 3日'), {
      lists: ['pic3days'],
      unknown: ['zoo'],
    })
  })

  it('ignores dashed flags mixed into the name text', () => {
    assert.deepEqual(parseListNames('无聊图 -r'), {
      lists: ['daily'],
      unknown: [],
    })
  })
})

describe('packListForward', () => {
  it('keeps a title node then image-only nodes', () => {
    const el = packListForward('无聊图', fakePosts(1, 2))
    assert.equal(el.attrs.forward, true)
    const title = el.children[0].children.find(child => child.type === 'text')
    assert.equal(title?.attrs.content, '无聊图')
    const rest = el.children.slice(1)
    assert.equal(rest.length, 1)
    assert.equal(rest[0].children.length, 2)
    for (const node of rest) {
      assert.equal(node.children.every(child => child.type === 'img'), true)
      assert.equal(node.children.some(child => child.type === 'author' || child.type === 'text'), false)
    }
    const src = String(rest[0].children[0].attrs.src)
    assert.equal(src.startsWith('data:image/jpeg;base64,'), true)
    assert.equal(src.includes('img.example.com'), false)
  })

  it('packs images into nodes of IMAGES_PER_NODE', () => {
    const el = packListForward('4小时', fakePosts(IMAGES_PER_NODE + 1))
    const rest = el.children.slice(1)
    assert.equal(rest.length, 2)
    assert.equal(rest[0].children.length, IMAGES_PER_NODE)
    assert.equal(rest[1].children.length, 1)
  })
})

describe('composeForward', () => {
  it('returns one flat forward for a single list', () => {
    const packed = composeForward([{ label: '无聊图', posts: fakePosts(3) }])
    assert.equal(packed.attrs.forward, true)
    assert.equal(packed.children.some(child => child.attrs.forward), false)
    assert.equal(packed.children.length, 2)
    assert.equal(packed.children[1].children.length, 3)
  })

  it('uses one title node then flattens all images', () => {
    const packed = composeForward([
      { label: '无聊图', posts: fakePosts(2) },
      { label: '随手拍', posts: fakePosts(1) },
    ])
    assert.equal(packed.attrs.forward, true)
    const labels = packed.children
      .map(child => child.children.find(node => node.type === 'text')?.attrs.content)
      .filter(Boolean)
    assert.deepEqual(labels, ['无聊图 随手拍'])
    assert.equal(packed.children.length, 2)
    assert.equal(packed.children.slice(1).every(node => node.children.every(child => child.type === 'img')), true)
    assert.equal(packed.children[1].children.length, 3)
  })

  it('keeps 21 images in a single forward', () => {
    const packed = composeForward([{ label: '4小时', posts: fakePosts(21) }])
    assert.equal(packed.attrs.forward, true)
    assert.equal(packed.children.some(child => child.attrs.forward), false)
    const imageCount = packed.children.slice(1).reduce((sum, node) => sum + node.children.length, 0)
    assert.equal(imageCount, 21)
  })
})

describe('composeForwardEach', () => {
  it('keeps a title then one node per post, packing that post\'s images together', () => {
    const packed = composeForwardEach([{
      label: '4小时',
      posts: [
        ...fakePosts(2, 1),
        ...fakePosts(1, 3),
      ],
    }])
    assert.equal(packed.attrs.forward, true)
    assert.equal(packed.children.length, 4)
    assert.deepEqual(
      packed.children.slice(1).map(node => node.children.length),
      [1, 1, 3],
    )
    assert.equal(packed.children.slice(1).every(node => node.children.every(child => child.type === 'img')), true)
  })
})

describe('composeForwardFromUrls', () => {
  it('builds one forward of a title plus one url image per node', () => {
    const packed = composeForwardFromUrls('7日无聊图', [
      'https://gchat.qpic.cn/a.jpg',
      'https://gchat.qpic.cn/b.jpg',
    ])
    assert.equal(packed.attrs.forward, true)
    assert.equal(packed.children[0].children.find(child => child.type === 'text')?.attrs.content, '7日无聊图')
    assert.deepEqual(
      packed.children.slice(1).map(node => node.children[0].attrs.src),
      ['https://gchat.qpic.cn/a.jpg', 'https://gchat.qpic.cn/b.jpg'],
    )
  })
})

describe('extractForwardImageSrcs', () => {
  it('reads image url/file from nested forward nodes and skips base64', () => {
    const srcs = extractForwardImageSrcs({
      messages: [
        { type: 'node', data: { content: [{ type: 'text', data: { text: '7日无聊图' } }] } },
        {
          type: 'node',
          data: {
            message: [
              { type: 'image', data: { url: 'https://gchat.qpic.cn/a.jpg', file: 'a.jpg' } },
              { type: 'image', data: { file: 'base64://UklGR' } },
              { type: 'image', data: { file: 'b.jpg' } },
            ],
          },
        },
      ],
    })
    assert.deepEqual(srcs, ['https://gchat.qpic.cn/a.jpg', 'b.jpg'])
  })
})

describe('mapLimit', () => {
  it('preserves order and caps concurrency', async () => {
    let running = 0
    let max = 0
    const result = await mapLimit([1, 2, 3, 4, 5], 2, async (value) => {
      running++
      max = Math.max(max, running)
      await new Promise(resolve => setTimeout(resolve, 20))
      running--
      return value * 2
    })
    assert.deepEqual(result, [2, 4, 6, 8, 10])
    assert.equal(max, 2)
  })
})

describe('preparePosts', () => {
  it('skips gif urls, downloads stills concurrently, and drops gif magic', async () => {
    const calls: string[] = []
    const http = {
      get: async (url: string) => {
        calls.push(url)
        if (url.includes('disguised')) return GIF.buffer.slice(GIF.byteOffset, GIF.byteOffset + GIF.byteLength)
        if (url.includes('fail')) throw new Error('boom')
        return JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.byteLength)
      },
    }
    const posts: JandanPost[] = [
      { id: 1, author: 'a', content: '<img src="https://img.toto.im/large/a.jpg" /><img src="https://img.toto.im/large/b.gif" />' },
      { id: 2, author: 'b', content: '<img src="https://img.toto.im/large/disguised" />' },
      { id: 3, author: 'c', content: '<img src="https://img.toto.im/large/fail.jpg" />' },
    ]
    const prepared = await preparePosts(http as never, posts, { skipGif: true, concurrency: 2 })
    assert.deepEqual(calls.sort(), [
      'https://img.toto.im/large/a.jpg',
      'https://img.toto.im/large/disguised',
      'https://img.toto.im/large/fail.jpg',
    ])
    assert.equal(prepared.length, 1)
    assert.equal(prepared[0].author, 'a')
    assert.equal(prepared[0].images.length, 1)
    assert.equal(prepared[0].images[0].url, 'https://img.toto.im/large/a.jpg')
    assert.equal(prepared[0].images[0].mime, 'image/jpeg')
    assert.equal(prepared[0].images[0].data.equals(JPEG), true)
  })

  it('keeps small gifs when skipGif is off and drops images over maxBytes', async () => {
    function bytesOf(kind: 'jpeg' | 'gif', size: number) {
      const buf = Buffer.alloc(size, 0)
      if (kind === 'gif') {
        buf[0] = 0x47
        buf[1] = 0x49
        buf[2] = 0x46
        buf[3] = 0x38
      } else {
        buf[0] = 0xff
        buf[1] = 0xd8
        buf[2] = 0xff
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    }
    const http = {
      get: async (url: string) => {
        if (url.includes('small.gif')) return bytesOf('gif', 64)
        if (url.includes('huge.gif')) return bytesOf('gif', 256)
        if (url.includes('huge.jpg')) return bytesOf('jpeg', 256)
        return bytesOf('jpeg', 32)
      },
    }
    const posts: JandanPost[] = [{
      id: 1,
      author: 'a',
      content: [
        '<img src="https://img.toto.im/large/ok.jpg" />',
        '<img src="https://img.toto.im/large/small.gif" />',
        '<img src="https://img.toto.im/large/huge.gif" />',
        '<img src="https://img.toto.im/large/huge.jpg" />',
      ].join(''),
    }]
    const prepared = await preparePosts(http as never, posts, { skipGif: false, maxBytes: 128 })
    assert.equal(prepared.length, 1)
    assert.deepEqual(prepared[0].images.map(image => image.url), [
      'https://img.toto.im/large/ok.jpg',
      'https://img.toto.im/large/small.gif',
    ])
    assert.equal(prepared[0].images[1].mime, 'image/gif')
  })
})

describe('pickRandomPost', () => {
  it('returns null for an empty list', () => {
    assert.equal(pickRandomPost([]), null)
  })

  it('returns the only post', () => {
    const posts = fakePosts(1, 2)
    assert.equal(pickRandomPost(posts), posts[0])
  })

  it('always returns one of the given posts', () => {
    const posts = fakePosts(5, 2)
    for (let i = 0; i < 20; i++) {
      const picked = pickRandomPost(posts)
      assert.ok(picked && posts.includes(picked))
    }
  })

  it('skips posts that have no images', () => {
    const empty: PreparedPost = { author: 'nobody', images: [] }
    assert.equal(pickRandomPost([empty]), null)
    const posts = [...fakePosts(1), empty]
    assert.equal(pickRandomPost(posts), posts[0])
  })
})

describe('isAdapterTimeout', () => {
  it('matches OneBot send_group_forward_msg timeout', () => {
    assert.equal(
      isAdapterTimeout(new Error('Timeout with request send_group_forward_msg, args: {"group_id":1}')),
      true,
    )
    assert.equal(isAdapterTimeout(new Error('network down')), false)
    assert.equal(isAdapterTimeout('Timeout with request send_msg'), true)
  })
})

describe('withResponseTimeout', () => {
  it('raises responseTimeout for the call and restores it after', async () => {
    const bot = { config: { responseTimeout: 60_000 } }
    const seen: number[] = []
    const result = await withResponseTimeout(bot, 600_000, async () => {
      seen.push(bot.config.responseTimeout)
      return 'ok'
    })
    assert.equal(result, 'ok')
    assert.deepEqual(seen, [600_000])
    assert.equal(bot.config.responseTimeout, 60_000)
  })

  it('restores responseTimeout when the call throws', async () => {
    const bot = { config: { responseTimeout: 60_000 } }
    await assert.rejects(
      () => withResponseTimeout(bot, 600_000, async () => {
        throw new Error('boom')
      }),
      /boom/,
    )
    assert.equal(bot.config.responseTimeout, 60_000)
  })

  it('skips bots without responseTimeout', async () => {
    const bot = { config: {} as { responseTimeout?: number } }
    await withResponseTimeout(bot, 600_000, async () => {
      assert.equal(bot.config.responseTimeout, undefined)
    })
  })
})
