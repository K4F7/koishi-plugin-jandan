import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  composeForward,
  detectMime,
  extractImageUrls,
  isGifBuffer,
  isGifUrl,
  packListForward,
  parseListNames,
  rewriteImageUrl,
  type PreparedPost,
} from '../src/jandan'

function fakePosts(count: number, imagesPerPost = 1): PreparedPost[] {
  return Array.from({ length: count }, (_, i) => ({
    author: `u${i}`,
    images: Array.from({ length: imagesPerPost }, (_, j) => ({
      url: `https://img.example.com/${i}-${j}.jpg`,
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
    assert.equal(rest.length, 2)
    for (const node of rest) {
      assert.equal(node.children.every(child => child.type === 'img'), true)
      assert.equal(node.children.some(child => child.type === 'author' || child.type === 'text'), false)
    }
    assert.equal(rest[0].children[0].attrs.src, 'https://img.example.com/0-0.jpg')
    assert.equal(String(rest[0].children[0].attrs.src).includes('base64'), false)
  })
})

describe('composeForward', () => {
  it('returns one flat forward for a single list', () => {
    const packed = composeForward([{ label: '无聊图', posts: fakePosts(3) }])
    assert.equal(packed.attrs.forward, true)
    assert.equal(packed.children.some(child => child.attrs.forward), false)
    assert.equal(packed.children.length, 4)
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
    assert.equal(packed.children.length, 4)
    assert.equal(packed.children.slice(1).every(node => node.children.every(child => child.type === 'img')), true)
  })
})
