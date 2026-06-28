import { Hono } from 'hono'
import type { AgentWorkspace } from '@ai-page-builder/shared'
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '../../lib/workspace-files-service'
import { HttpError } from '../errors'
import { json, readJsonBody } from '../responses'
import { assertPageBuilderEditLockForWorkspace } from '../page-builder-edit-lock-auth'
import type { HttpAppEnv } from '../types'

/**
 * 从请求 URL 中提取 `/api/workspaces/:workspaceId/files/` 之后的相对路径。
 *
 * 用于 `GET/PUT /files/*`，得到相对 `workspace-files/` 的 posix 路径。
 */
function getWorkspaceFilesRequestPath(requestUrl: string, workspaceId: string): string {
  const pathname = new URL(requestUrl).pathname
  const prefix = `/api/workspaces/${encodeURIComponent(workspaceId)}/files`
  const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ''
  const encodedPath = suffix.replace(/^\/+/, '')
  try {
    return encodedPath
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/')
  } catch {
    throw new HttpError(400, '文件路径编码无效')
  }
}

function assertWorkspaceIsPageBuilder(workspace: AgentWorkspace): void {
  if (workspace.template !== 'page-builder') {
    throw new HttpError(400, '仅支持 PageBuilder 工作区编辑文件')
  }
}

/**
 * 将工作区文件相关路由注册到 workspaceRoutes 上。
 *
 * 路由路径以 `/:workspaceId/files` 开头，复用 workspaceRoutes 上已注册的
 * `workspaceMiddleware`（注入 `c.var.workspace`）。只有保存已有文件是写操作，
 * 经 `assertPageBuilderEditLockForWorkspace` 校验编辑锁；只读操作（list / read）不要求锁。
 */
export function registerWorkspaceFilesRoutes(routes: Hono<HttpAppEnv>): void {
  routes.get('/:workspaceId/files', (c) => {
    assertWorkspaceIsPageBuilder(c.var.workspace)
    return json(listWorkspaceFiles(c.var.workspace))
  })

  routes.get('/:workspaceId/files/*', (c) => {
    assertWorkspaceIsPageBuilder(c.var.workspace)
    const relativePath = getWorkspaceFilesRequestPath(c.req.raw.url, c.var.workspace.id)
    return json(readWorkspaceFile(c.var.workspace, relativePath))
  })

  routes.put('/:workspaceId/files/*', async (c) => {
    assertWorkspaceIsPageBuilder(c.var.workspace)
    assertPageBuilderEditLockForWorkspace(c.var.workspace, c.req.raw)
    const relativePath = getWorkspaceFilesRequestPath(c.req.raw.url, c.var.workspace.id)
    const body = await readJsonBody<{ content?: unknown; baseVersion?: unknown }>(c.req.raw)
    if (typeof body.content !== 'string') {
      throw new HttpError(400, 'content 必须是字符串')
    }
    const options = typeof body.baseVersion === 'string'
      ? { baseVersion: body.baseVersion }
      : undefined
    return json(saveWorkspaceFile(c.var.workspace, relativePath, body.content, options))
  })
}
