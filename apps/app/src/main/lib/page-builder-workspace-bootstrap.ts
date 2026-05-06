import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { McpServerEntry, WorkspaceMcpConfig } from '@ai-page-builder/shared'
import { getWorkspaceMcpPath } from './config-paths'
import { initializeWorkspaceTemplate, readWorkspaceTemplateMcpConfig } from './workspace-template-service'

function readWorkspaceMcpConfig(workspaceSlug: string): WorkspaceMcpConfig {
  const mcpPath = getWorkspaceMcpPath(workspaceSlug)
  if (!existsSync(mcpPath)) {
    return { servers: {} }
  }

  try {
    const parsed = JSON.parse(readFileSync(mcpPath, 'utf-8')) as Partial<WorkspaceMcpConfig>
    return { servers: parsed.servers ?? {} }
  } catch (error) {
    console.error('[Page Builder] 读取工作区 MCP 配置失败:', error)
    return { servers: {} }
  }
}

function cloneMcpServerEntry(entry: McpServerEntry): McpServerEntry {
  return {
    ...entry,
    ...(entry.args ? { args: [...entry.args] } : {}),
    ...(entry.env ? { env: { ...entry.env } } : {}),
    ...(entry.headers ? { headers: { ...entry.headers } } : {}),
    ...(entry.lastTestResult ? { lastTestResult: { ...entry.lastTestResult } } : {}),
  }
}

export function initializePageBuilderWorkspace(workspaceSlug: string): void {
  initializeWorkspaceTemplate(workspaceSlug, 'page-builder')

  const existingConfig = readWorkspaceMcpConfig(workspaceSlug)
  const defaultConfig = readWorkspaceTemplateMcpConfig('page-builder')
  const isMissingDefaultServer = Object.keys(defaultConfig.servers).some((name) => !(name in existingConfig.servers))
  const mergedConfig: WorkspaceMcpConfig = {
    servers: {
      ...Object.fromEntries(
        Object.entries(defaultConfig.servers).map(([name, entry]) => [name, cloneMcpServerEntry(entry)]),
      ),
      ...existingConfig.servers,
    },
  }

  if (isMissingDefaultServer) {
    writeFileSync(getWorkspaceMcpPath(workspaceSlug), JSON.stringify(mergedConfig, null, 2), 'utf-8')
  }
}
