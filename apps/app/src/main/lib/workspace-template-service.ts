import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WorkspaceMcpConfig } from '@ai-page-builder/shared'
import { getAgentWorkspacePath } from './config-paths'

export type WorkspaceTemplateName = 'page-builder'

const TEMPLATE_FILE_NAMES: Record<WorkspaceTemplateName, { claude: string; mcp: string }> = {
  'page-builder': {
    claude: 'page-builder-workspace-claude.md',
    mcp: 'page-builder-workspace-mcp.json',
  },
}

function resolveBundledWorkspaceTemplatesDir(): string {
  const configuredDir = process.env.PROMA_WORKSPACE_TEMPLATES_DIR?.trim()
  return configuredDir
    ? configuredDir
    : fileURLToPath(new URL('../../../resources/templates', import.meta.url))
}

function resolveWorkspaceTemplateSourcePath(
  template: WorkspaceTemplateName,
  resource: keyof (typeof TEMPLATE_FILE_NAMES)[WorkspaceTemplateName],
): string {
  return join(resolveBundledWorkspaceTemplatesDir(), TEMPLATE_FILE_NAMES[template][resource])
}

function readWorkspaceTemplate(template: WorkspaceTemplateName): string {
  const sourcePath = resolveWorkspaceTemplateSourcePath(template, 'claude')
  if (!existsSync(sourcePath)) {
    throw new Error(`工作区模板不存在: ${template}`)
  }

  return readFileSync(sourcePath, 'utf-8')
}

export function readWorkspaceTemplateMcpConfig(template: WorkspaceTemplateName): WorkspaceMcpConfig {
  const sourcePath = resolveWorkspaceTemplateSourcePath(template, 'mcp')
  if (!existsSync(sourcePath)) {
    throw new Error(`工作区 MCP 模板不存在: ${template}`)
  }

  const parsed = JSON.parse(readFileSync(sourcePath, 'utf-8')) as Partial<WorkspaceMcpConfig>
  return { servers: parsed.servers ?? {} }
}

function getWorkspaceClaudeMdPath(workspaceSlug: string): string {
  return join(getAgentWorkspacePath(workspaceSlug), 'CLAUDE.md')
}

export function initializeWorkspaceTemplate(
  workspaceSlug: string,
  template: WorkspaceTemplateName,
): void {
  const claudeMdPath = getWorkspaceClaudeMdPath(workspaceSlug)
  if (existsSync(claudeMdPath)) {
    return
  }

  writeFileSync(claudeMdPath, readWorkspaceTemplate(template), 'utf-8')
}
