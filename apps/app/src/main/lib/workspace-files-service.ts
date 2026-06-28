import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { AgentWorkspace } from '@ai-page-builder/shared'
import {
  scanCmsRenderingManifest,
  type CmsRenderingManifest,
} from '@ai-page-builder/page-builder-cms-rendering'
import {
  getWorkspaceCmsRenderingManifestPath,
  getWorkspaceFilesDir,
} from './config-paths'
import {
  getWorkspacePreviewState,
  type WorkspacePreviewState,
} from './workspace-preview-service'
import { HttpError } from '../http/errors'

/** 超过该大小拒绝在编辑器中加载（防止 Monaco 卡死） */
const MAX_READABLE_FILE_SIZE_BYTES = 10 * 1024 * 1024
/** 超过该大小在响应中标记警告（前端提示大文件） */
const WARN_FILE_SIZE_BYTES = 5 * 1024 * 1024
/** 二进制探测采样窗口 */
const BINARY_PROBE_BYTES = 8192

/** 工作区文件树中跳过的派生目录 */
const WORKSPACE_FILE_SKIP_DIRS = new Set(['.proma'])

export type WorkspaceFileType = 'file' | 'directory'

export interface WorkspaceFileEntry {
  /** 相对 `workspace-files/` 的 posix 路径 */
  path: string
  name: string
  type: WorkspaceFileType
  size: number
}

export interface WorkspaceFileTree {
  entries: WorkspaceFileEntry[]
}

export interface WorkspaceFileContent {
  path: string
  content: string
  size: number
  largeFileWarning: boolean
  version: string
}

export interface WorkspaceFileSaveResult {
  path: string
  changed: boolean
  version: string
  /** HTML 保存时会刷新 CMS rendering manifest；非 HTML 为 false */
  manifestUpdated: boolean
  previewState: WorkspacePreviewState
}

export interface WorkspaceFileSaveOptions {
  /** 客户端读取文件时获得的内容版本；不匹配说明文件已被 Agent 或其他流程改动 */
  baseVersion?: string
}

function toPosixPath(input: string): string {
  return input.split(sep).join('/')
}

function hashWorkspaceFileContent(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}

function normalizeWorkspaceFileRelativePath(relativePath: string): string {
  const normalized = (relativePath ?? '').replace(/^\/+/, '').trim()

  if (!normalized) {
    throw new HttpError(400, '文件路径不能为空')
  }

  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new HttpError(403, '非法路径')
  }

  if (segments.some((segment) => segment === '.proma')) {
    throw new HttpError(403, '派生元数据目录不可编辑')
  }

  return segments.join('/')
}

/**
 * 解析工作区文件相对路径为绝对路径，禁止穿越 `workspace-files/` 边界。
 *
 * 返回的路径保证严格位于 `workspace-files/` 之下（不含根目录本身）。
 */
export function resolveWorkspaceFilePath(workspace: AgentWorkspace, relativePath: string): string {
  const rootDir = resolve(getWorkspaceFilesDir(workspace.slug))
  const normalized = normalizeWorkspaceFileRelativePath(relativePath)

  const resolvedPath = resolve(rootDir, normalized)

  if (!resolvedPath.startsWith(`${rootDir}${sep}`)) {
    throw new HttpError(403, '非法路径')
  }

  return resolvedPath
}

function collectFileEntries(dir: string, rootDir: string, entries: WorkspaceFileEntry[]): void {
  const children = readdirSync(dir, { withFileTypes: true })
  for (const child of children) {
    if (child.isDirectory()) {
      if (WORKSPACE_FILE_SKIP_DIRS.has(child.name)) {
        continue
      }
      const fullPath = join(dir, child.name)
      entries.push({
        path: toPosixPath(fullPath.slice(rootDir.length + 1)),
        name: child.name,
        type: 'directory',
        size: 0,
      })
      collectFileEntries(fullPath, rootDir, entries)
      continue
    }

    if (!child.isFile()) {
      continue
    }

    const fullPath = join(dir, child.name)
    let size = 0
    try {
      size = statSync(fullPath).size
    } catch {
      size = 0
    }
    entries.push({
      path: toPosixPath(fullPath.slice(rootDir.length + 1)),
      name: child.name,
      type: 'file',
      size,
    })
  }
}

export function listWorkspaceFiles(workspace: AgentWorkspace): WorkspaceFileTree {
  const rootDir = resolve(getWorkspaceFilesDir(workspace.slug))
  if (!existsSync(rootDir)) {
    return { entries: [] }
  }

  const entries: WorkspaceFileEntry[] = []
  collectFileEntries(rootDir, rootDir, entries)
  return { entries }
}

function detectBinaryFile(filePath: string): boolean {
  let fd: number | undefined
  try {
    fd = openSync(filePath, 'r')
    const buffer = Buffer.alloc(BINARY_PROBE_BYTES)
    const bytesRead = readSync(fd, buffer, 0, BINARY_PROBE_BYTES, 0)
    for (let index = 0; index < bytesRead; index += 1) {
      const byte = buffer[index]
      if (byte === 0) {
        return true
      }
    }
    return false
  } catch {
    return false
  } finally {
    if (fd !== undefined) {
      closeSync(fd)
    }
  }
}

export function readWorkspaceFile(workspace: AgentWorkspace, relativePath: string): WorkspaceFileContent {
  const filePath = resolveWorkspaceFilePath(workspace, relativePath)
  if (!existsSync(filePath)) {
    throw new HttpError(404, '文件不存在')
  }

  const stat = statSync(filePath)
  if (!stat.isFile()) {
    throw new HttpError(400, '该路径不是文件')
  }

  if (stat.size > MAX_READABLE_FILE_SIZE_BYTES) {
    throw new HttpError(413, '文件过大，暂不支持在编辑器中加载')
  }

  if (detectBinaryFile(filePath)) {
    throw new HttpError(422, '该文件为二进制文件，无法在编辑器中编辑')
  }

  const content = readFileSync(filePath, 'utf-8')
  return {
    path: toPosixPath(relativePath),
    content,
    size: stat.size,
    largeFileWarning: stat.size > WARN_FILE_SIZE_BYTES,
    version: hashWorkspaceFileContent(content),
  }
}

function refreshCmsRenderingManifest(
  workspace: AgentWorkspace,
  relativePath: string,
  content: string,
): void {
  const htmlPath = toPosixPath(relativePath)
  const manifest: CmsRenderingManifest = scanCmsRenderingManifest(content, {
    htmlPath,
    generatedAt: new Date().toISOString(),
  })
  writeFileSync(getWorkspaceCmsRenderingManifestPath(workspace.slug), JSON.stringify(manifest, null, 2), 'utf-8')
}

export function saveWorkspaceFile(
  workspace: AgentWorkspace,
  relativePath: string,
  content: string,
  options: WorkspaceFileSaveOptions = {},
): WorkspaceFileSaveResult {
  const filePath = resolveWorkspaceFilePath(workspace, relativePath)
  if (!existsSync(filePath)) {
    throw new HttpError(404, '文件不存在')
  }
  if (!statSync(filePath).isFile()) {
    throw new HttpError(400, '该路径不是文件')
  }

  const previousContent = readFileSync(filePath, 'utf-8')
  const previousVersion = hashWorkspaceFileContent(previousContent)
  if (options.baseVersion && options.baseVersion !== previousVersion) {
    throw new HttpError(409, '文件已被其他流程修改，请重新打开后再保存')
  }

  const changed = previousContent !== content
  if (changed) {
    writeFileSync(filePath, content, 'utf-8')
  }
  const nextVersion = changed ? hashWorkspaceFileContent(content) : previousVersion

  let manifestUpdated = false
  if (/\.html?$/i.test(filePath)) {
    refreshCmsRenderingManifest(workspace, relativePath, content)
    manifestUpdated = true
  }

  return {
    path: toPosixPath(relativePath),
    changed,
    version: nextVersion,
    manifestUpdated,
    previewState: getWorkspacePreviewState(workspace),
  }
}
