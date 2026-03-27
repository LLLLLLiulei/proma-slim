import { afterEach, describe, expect, test } from 'bun:test'
import {
  mergePendingAgentAttachments,
  releasePendingAgentAttachments,
} from './agent-attachments'

describe('agent attachment helpers', () => {
  afterEach(() => {
    releasePendingAgentAttachments([])
  })

  test('accepts valid pending attachments and creates image preview urls', () => {
    const image = new File(['image'], 'reference.png', { type: 'image/png' })
    const doc = new File(['doc'], 'brief.pdf', { type: 'application/pdf' })

    const result = mergePendingAgentAttachments([], [image, doc])

    expect(result.errors).toEqual([])
    expect(result.attachments).toHaveLength(2)
    expect(result.attachments[0]?.previewUrl?.startsWith('blob:')).toBe(true)
    expect(result.attachments[1]?.previewUrl).toBeUndefined()

    releasePendingAgentAttachments(result.attachments)
  })

  test('rejects files that exceed the single-file limit', () => {
    const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' })

    const result = mergePendingAgentAttachments([], [oversized])

    expect(result.attachments).toHaveLength(0)
    expect(result.errors).toEqual(['附件 huge.png 超过单文件大小限制 20.0MB'])
  })
})
