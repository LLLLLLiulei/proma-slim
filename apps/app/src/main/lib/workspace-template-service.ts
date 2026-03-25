import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAgentWorkspacePath } from './config-paths'

export type WorkspaceTemplateName = 'page-builder'

const TEMPLATE_FILE_NAMES: Record<WorkspaceTemplateName, string> = {
  'page-builder': 'page-builder-workspace-claude.md',
}

function resolveBundledWorkspaceTemplatesDir(): string {
  const configuredDir = process.env.PROMA_WORKSPACE_TEMPLATES_DIR?.trim()
  return configuredDir
    ? configuredDir
    : fileURLToPath(new URL('../../../resources/templates', import.meta.url))
}

function resolveWorkspaceTemplateSourcePath(template: WorkspaceTemplateName): string {
  return join(resolveBundledWorkspaceTemplatesDir(), TEMPLATE_FILE_NAMES[template])
}

function readWorkspaceTemplate(template: WorkspaceTemplateName): string {
  const sourcePath = resolveWorkspaceTemplateSourcePath(template)
  if (!existsSync(sourcePath)) {
    throw new Error(`工作区模板不存在: ${template}`)
  }

  return readFileSync(sourcePath, 'utf-8')
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
