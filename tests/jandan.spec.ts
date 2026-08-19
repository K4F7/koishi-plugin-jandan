import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  detectMime,
  extractImageUrls,
  isGifBuffer,
  isGifUrl,
  parseListNames,
  rewriteImageUrl,
} from '../src/jandan'

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
