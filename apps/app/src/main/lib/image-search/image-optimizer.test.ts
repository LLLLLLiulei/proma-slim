import { describe, expect, mock, test } from 'bun:test'
import { optimizeImageBuffer } from './image-optimizer'

function createBuffer(byteLength: number, header?: string): Buffer {
  const buffer = Buffer.alloc(byteLength, 1)
  if (header) buffer.write(header, 0, 'ascii')
  return buffer
}

function createAnimatedWebpBuffer(byteLength: number): Buffer {
  const buffer = Buffer.alloc(byteLength, 0)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(byteLength - 8, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8X', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  buffer[20] = 0x02
  return buffer
}

function createStaticWebpBuffer(byteLength: number): Buffer {
  const buffer = Buffer.alloc(byteLength, 0)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(byteLength - 8, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8 ', 12, 'ascii')
  return buffer
}

describe('optimizeImageBuffer', () => {
  test('skips images at or below the optimization threshold', async () => {
    const original = createBuffer(1024)
    const result = await optimizeImageBuffer({
      buffer: original,
      width: 800,
      height: 600,
      extension: '.png',
      contentType: 'image/png',
    }, {
      thresholdBytes: 1024,
      encodeWebp: mock(async () => {
        throw new Error('should not encode')
      }),
    })

    expect(result.buffer).toBe(original)
    expect(result.extension).toBe('.png')
    expect(result.contentType).toBe('image/png')
    expect(result.optimization).toMatchObject({
      status: 'skipped',
      reason: 'below_threshold',
      originalByteLength: 1024,
    })
  })

  test('optimizes oversized static images without changing dimensions', async () => {
    const original = createBuffer(4096)
    const smaller = createStaticWebpBuffer(2048)
    const encodeWebp = mock(async (_buffer: Buffer, quality: number) => ({
      buffer: quality === 82 ? createStaticWebpBuffer(3072) : smaller,
      width: 1600,
      height: 900,
      format: 'webp',
    }))

    const result = await optimizeImageBuffer({
      buffer: original,
      width: 1600,
      height: 900,
      extension: '.png',
      contentType: 'image/png',
    }, {
      thresholdBytes: 1024,
      qualities: [82, 70],
      encodeWebp,
    })

    expect(encodeWebp).toHaveBeenCalledTimes(2)
    expect(result.buffer).toBe(smaller)
    expect(result.extension).toBe('.webp')
    expect(result.contentType).toBe('image/webp')
    expect(result.width).toBe(1600)
    expect(result.height).toBe(900)
    expect(result.optimization).toMatchObject({
      status: 'optimized',
      originalByteLength: 4096,
      optimizedByteLength: 2048,
      outputFormat: 'webp',
      quality: 70,
    })
  })

  test('falls back when optimized candidates are larger or change dimensions', async () => {
    const original = createBuffer(2048)
    const encodeWebp = mock(async (_buffer: Buffer, quality: number) => ({
      buffer: createStaticWebpBuffer(quality === 82 ? 900 : 4096),
      width: quality === 82 ? 1599 : 1600,
      height: 900,
      format: 'webp',
    }))

    const result = await optimizeImageBuffer({
      buffer: original,
      width: 1600,
      height: 900,
      extension: '.jpg',
      contentType: 'image/jpeg',
    }, {
      thresholdBytes: 1024,
      qualities: [82, 70],
      encodeWebp,
    })

    expect(result.buffer).toBe(original)
    expect(result.extension).toBe('.jpg')
    expect(result.width).toBe(1600)
    expect(result.height).toBe(900)
    expect(result.optimization).toMatchObject({
      status: 'fallback',
      reason: 'no_smaller_candidate',
      originalByteLength: 2048,
    })
  })

  test('skips GIF and animated WebP images', async () => {
    const gif = createBuffer(2048, 'GIF89a')
    const animatedWebp = createAnimatedWebpBuffer(2048)
    const encodeWebp = mock(async () => {
      throw new Error('should not encode')
    })

    const gifResult = await optimizeImageBuffer({
      buffer: gif,
      width: 320,
      height: 240,
      extension: '.gif',
      contentType: 'image/gif',
    }, { thresholdBytes: 1024, encodeWebp })
    const webpResult = await optimizeImageBuffer({
      buffer: animatedWebp,
      width: 320,
      height: 240,
      extension: '.webp',
      contentType: 'image/webp',
    }, { thresholdBytes: 1024, encodeWebp })

    expect(encodeWebp).toHaveBeenCalledTimes(0)
    expect(gifResult.optimization).toMatchObject({ status: 'skipped', reason: 'gif' })
    expect(webpResult.optimization).toMatchObject({ status: 'skipped', reason: 'animated_image' })
  })

  test('falls back to the original image when encoding fails', async () => {
    const original = createBuffer(2048)
    const result = await optimizeImageBuffer({
      buffer: original,
      width: 1600,
      height: 900,
      extension: '.png',
      contentType: 'image/png',
    }, {
      thresholdBytes: 1024,
      encodeWebp: mock(async () => {
        throw new Error('encoder unavailable')
      }),
    })

    expect(result.buffer).toBe(original)
    expect(result.optimization).toMatchObject({
      status: 'failed',
      reason: 'encoder unavailable',
      originalByteLength: 2048,
    })
  })
})
