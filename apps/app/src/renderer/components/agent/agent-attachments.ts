import {
  AGENT_ATTACHMENT_MAX_FILES,
  AGENT_ATTACHMENT_MAX_FILE_SIZE_BYTES,
  AGENT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES,
} from '@ai-page-builder/shared'

export interface PendingAgentAttachment {
  id: string
  file: File
  previewUrl?: string
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`
  }

  return `${bytes}B`
}

function createPendingAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export function createPendingAgentAttachment(file: File): PendingAgentAttachment {
  return {
    id: createPendingAttachmentId(),
    file,
    previewUrl: isImageFile(file) ? URL.createObjectURL(file) : undefined,
  }
}

export function releasePendingAgentAttachment(attachment: PendingAgentAttachment): void {
  if (attachment.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(attachment.previewUrl)
  }
}

export function releasePendingAgentAttachments(attachments: ReadonlyArray<PendingAgentAttachment>): void {
  for (const attachment of attachments) {
    releasePendingAgentAttachment(attachment)
  }
}

export function mergePendingAgentAttachments(
  current: ReadonlyArray<PendingAgentAttachment>,
  files: ReadonlyArray<File>,
): {
  attachments: PendingAgentAttachment[]
  errors: string[]
} {
  const attachments = [...current]
  const errors: string[] = []
  let totalSize = attachments.reduce((sum, attachment) => sum + attachment.file.size, 0)

  for (const file of files) {
    if (attachments.length >= AGENT_ATTACHMENT_MAX_FILES) {
      errors.push(`单次最多上传 ${AGENT_ATTACHMENT_MAX_FILES} 个附件`)
      break
    }

    if (file.size > AGENT_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
      errors.push(`附件 ${file.name} 超过单文件大小限制 ${formatBytes(AGENT_ATTACHMENT_MAX_FILE_SIZE_BYTES)}`)
      continue
    }

    if (totalSize + file.size > AGENT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES) {
      errors.push(`本次附件总大小不能超过 ${formatBytes(AGENT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES)}`)
      break
    }

    attachments.push(createPendingAgentAttachment(file))
    totalSize += file.size
  }

  return { attachments, errors }
}
