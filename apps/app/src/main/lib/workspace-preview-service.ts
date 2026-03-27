import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { AgentWorkspace } from '@proma/shared'
import { HttpError } from '../http/errors'
import { getWorkspaceFilesDir } from './config-paths'
import {
  injectPageBuilderPreviewBridge,
  shouldInjectPageBuilderPreviewBridge,
} from './page-builder-preview-bridge'

export interface WorkspacePreviewState {
  hasPreview: boolean
  entryUrl: string | null
  revision: string | null
}

function getWorkspacePreviewRoot(workspace: AgentWorkspace): string {
  return getWorkspaceFilesDir(workspace.slug)
}

function getWorkspacePreviewEntryPath(workspace: AgentWorkspace): string {
  return join(getWorkspacePreviewRoot(workspace), 'index.html')
}

function isWithinRoot(rootDir: string, targetPath: string): boolean {
  return targetPath === rootDir || targetPath.startsWith(`${rootDir}${sep}`)
}

function resolveWorkspacePreviewPath(workspace: AgentWorkspace, requestPath: string): string {
  const rootDir = resolve(getWorkspacePreviewRoot(workspace))
  const normalizedPath = requestPath.replace(/^\/+/, '')
  const resolvedPath = resolve(rootDir, normalizedPath || 'index.html')

  if (!isWithinRoot(rootDir, resolvedPath)) {
    throw new HttpError(403, '非法路径')
  }

  return resolvedPath
}

function collectRevisionEntries(dir: string, rootDir: string, entries: string[]): void {
  const children = readdirSync(dir, { withFileTypes: true })
  for (const child of children) {
    const fullPath = join(dir, child.name)

    if (child.isDirectory()) {
      collectRevisionEntries(fullPath, rootDir, entries)
      continue
    }

    if (!child.isFile()) continue

    const stat = statSync(fullPath)
    const relativePath = fullPath.slice(rootDir.length + 1)
    entries.push(`${relativePath}:${stat.size}:${stat.mtimeMs}`)
  }
}

export function getWorkspacePreviewState(workspace: AgentWorkspace): WorkspacePreviewState {
  const entryPath = getWorkspacePreviewEntryPath(workspace)
  if (!existsSync(entryPath)) {
    return {
      hasPreview: false,
      entryUrl: null,
      revision: null,
    }
  }

  const rootDir = resolve(getWorkspacePreviewRoot(workspace))
  const revisionEntries: string[] = []
  collectRevisionEntries(rootDir, rootDir, revisionEntries)
  revisionEntries.sort((left, right) => left.localeCompare(right))

  return {
    hasPreview: true,
    entryUrl: `/api/workspaces/${encodeURIComponent(workspace.id)}/preview/`,
    revision: createHash('sha1').update(revisionEntries.join('\n')).digest('hex'),
  }
}

export function createWorkspacePreviewResponse(
  workspace: AgentWorkspace,
  requestPath: string,
): Response {
  const resolvedPath = resolveWorkspacePreviewPath(workspace, requestPath)
  const isEntryRequest = requestPath === '' || requestPath === '/' || requestPath === 'index.html'

  if (!existsSync(resolvedPath)) {
    throw new HttpError(404, isEntryRequest ? '预览入口不存在' : '预览文件不存在')
  }

  if (shouldInjectPageBuilderPreviewBridge(workspace, resolvedPath)) {
    return new Response(
      injectPageBuilderPreviewBridge(readFileSync(resolvedPath, 'utf-8')),
      {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/html; charset=utf-8',
        },
      },
    )
  }

  return new Response(Bun.file(resolvedPath), {
    headers: {
      'cache-control': 'no-store',
    },
  })
}
