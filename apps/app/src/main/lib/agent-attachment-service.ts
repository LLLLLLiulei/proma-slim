import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import type { FileAttachment } from '@proma/shared'
import {
  AGENT_ATTACHMENT_MAX_FILES,
  AGENT_ATTACHMENT_MAX_FILE_SIZE_BYTES,
  AGENT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES,
} from '@proma/shared'
import { HttpError } from '../http/errors'
import { getAgentSessionMessages, getAgentSessionMeta } from './agent-session-manager'
import {
  getAgentSessionAttachmentsDir,
  resolveAgentSessionAttachmentPath,
} from './config-paths'
import { ensureDefaultWorkspace, getAgentWorkspace } from './workspace-service'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`
  }

  return `${bytes}B`
}

function resolveAttachmentWorkspace(sessionId: string, requestedWorkspaceId?: string) {
  const sessionMeta = getAgentSessionMeta(sessionId)
  const sessionWorkspaceId = sessionMeta?.workspaceId

  if (requestedWorkspaceId && sessionWorkspaceId && requestedWorkspaceId !== sessionWorkspaceId) {
    throw new HttpError(400, '当前会话与请求工作区不一致')
  }

  const fallbackWorkspace = ensureDefaultWorkspace()
  const resolvedWorkspaceId = sessionWorkspaceId ?? requestedWorkspaceId ?? fallbackWorkspace.id
  return getAgentWorkspace(resolvedWorkspaceId) ?? fallbackWorkspace
}

export function validateAgentAttachments(
  files: ReadonlyArray<Pick<File, 'name' | 'size'>>,
): void {
  if (files.length > AGENT_ATTACHMENT_MAX_FILES) {
    throw new HttpError(400, `单次最多上传 ${AGENT_ATTACHMENT_MAX_FILES} 个附件`)
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  if (totalSize > AGENT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES) {
    throw new HttpError(
      400,
      `本次附件总大小不能超过 ${formatBytes(AGENT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES)}`,
    )
  }

  for (const file of files) {
    if (file.size > AGENT_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
      throw new HttpError(
        400,
        `附件 ${file.name} 超过单文件大小限制 ${formatBytes(AGENT_ATTACHMENT_MAX_FILE_SIZE_BYTES)}`,
      )
    }
  }
}

export async function saveAgentSessionAttachments(input: {
  sessionId: string
  workspaceId?: string
  files: File[]
}): Promise<FileAttachment[]> {
  const { sessionId, workspaceId, files } = input
  if (files.length === 0) {
    return []
  }

  validateAgentAttachments(files)

  const workspace = resolveAttachmentWorkspace(sessionId, workspaceId)
  getAgentSessionAttachmentsDir(workspace.slug, sessionId)
  const attachments: FileAttachment[] = []

  for (const file of files) {
    const extension = extname(file.name)
    const attachmentId = randomUUID()
    const storedFilename = `${attachmentId}${extension}`
    const localPath = `attachments/${storedFilename}`
    const absolutePath = resolveAgentSessionAttachmentPath(workspace.slug, sessionId, localPath)
    const bytes = new Uint8Array(await file.arrayBuffer())

    writeFileSync(absolutePath, bytes)

    attachments.push({
      id: attachmentId,
      filename: file.name,
      mediaType: file.type || 'application/octet-stream',
      localPath,
      size: bytes.byteLength,
    })
  }

  return attachments
}

export function deleteAgentSessionAttachments(input: {
  sessionId: string
  workspaceId?: string
  attachments: ReadonlyArray<Pick<FileAttachment, 'localPath'>>
}): void {
  const { sessionId, workspaceId, attachments } = input
  if (attachments.length === 0) {
    return
  }

  const workspace = resolveAttachmentWorkspace(sessionId, workspaceId)

  for (const attachment of attachments) {
    try {
      const absolutePath = resolveAgentSessionAttachmentPath(workspace.slug, sessionId, attachment.localPath)
      if (existsSync(absolutePath)) {
        unlinkSync(absolutePath)
      }
    } catch (error) {
      console.warn('[附件服务] 删除附件失败:', error)
    }
  }
}

export function getAgentSessionAttachmentContent(sessionId: string, attachmentId: string): {
  attachment: FileAttachment
  body: Uint8Array
} {
  const workspace = resolveAttachmentWorkspace(sessionId)
  const attachment = getAgentSessionMessages(sessionId)
    .flatMap((message) => message.attachments ?? [])
    .find((entry) => entry.id === attachmentId)

  if (!attachment) {
    throw new HttpError(404, `附件不存在: ${attachmentId}`)
  }

  const absolutePath = resolveAgentSessionAttachmentPath(workspace.slug, sessionId, attachment.localPath)
  if (!existsSync(absolutePath)) {
    throw new HttpError(404, `附件文件不存在: ${attachmentId}`)
  }

  return {
    attachment,
    body: readFileSync(absolutePath),
  }
}
