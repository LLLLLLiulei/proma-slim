import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getAgentWorkspacePath } from './config-paths'
import { initializeWorkspaceTemplate } from './workspace-template-service'

describe('workspace template service', () => {
  let configDir: string
  let templatesDir: string
  let originalTemplatesDir: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-workspace-template-config-'))
    templatesDir = mkdtempSync(join(tmpdir(), 'proma-workspace-template-source-'))
    originalTemplatesDir = process.env.PROMA_WORKSPACE_TEMPLATES_DIR
    process.env.PROMA_CONFIG_DIR = configDir
    process.env.PROMA_WORKSPACE_TEMPLATES_DIR = templatesDir
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    if (originalTemplatesDir === undefined) {
      delete process.env.PROMA_WORKSPACE_TEMPLATES_DIR
    } else {
      process.env.PROMA_WORKSPACE_TEMPLATES_DIR = originalTemplatesDir
    }
    rmSync(configDir, { recursive: true, force: true })
    rmSync(templatesDir, { recursive: true, force: true })
  })

  test('writes the page-builder CLAUDE.md from the external template file', () => {
    mkdirSync(templatesDir, { recursive: true })
    writeFileSync(
      join(templatesDir, 'page-builder-workspace-claude.md'),
      '# Workspace Template\n\nWrite output to workspace-files/index.html\n',
      'utf-8',
    )

    initializeWorkspaceTemplate('page-builder-workspace', 'page-builder')

    const claudeMdPath = join(getAgentWorkspacePath('page-builder-workspace'), 'CLAUDE.md')
    expect(existsSync(claudeMdPath)).toBe(true)
    expect(readFileSync(claudeMdPath, 'utf-8')).toBe('# Workspace Template\n\nWrite output to workspace-files/index.html\n')
  })

  test('keeps an existing root CLAUDE.md untouched', () => {
    mkdirSync(templatesDir, { recursive: true })
    writeFileSync(
      join(templatesDir, 'page-builder-workspace-claude.md'),
      '# New Template\n',
      'utf-8',
    )

    const workspaceRoot = getAgentWorkspacePath('existing-builder-workspace')
    const claudeMdPath = join(workspaceRoot, 'CLAUDE.md')
    writeFileSync(claudeMdPath, '# Existing Template\n', 'utf-8')

    initializeWorkspaceTemplate('existing-builder-workspace', 'page-builder')

    expect(readFileSync(claudeMdPath, 'utf-8')).toBe('# Existing Template\n')
  })

  test('keeps both developer templates while only using the English runtime source', () => {
    mkdirSync(templatesDir, { recursive: true })
    writeFileSync(
      join(templatesDir, 'page-builder-workspace-claude.md'),
      '# English Template\n',
      'utf-8',
    )
    writeFileSync(
      join(templatesDir, 'page-builder-workspace-claude.zh-CN.md'),
      '# 中文说明模板\n',
      'utf-8',
    )

    initializeWorkspaceTemplate('bilingual-builder-workspace', 'page-builder')

    const claudeMdPath = join(getAgentWorkspacePath('bilingual-builder-workspace'), 'CLAUDE.md')
    expect(existsSync(join(templatesDir, 'page-builder-workspace-claude.md'))).toBe(true)
    expect(existsSync(join(templatesDir, 'page-builder-workspace-claude.zh-CN.md'))).toBe(true)
    expect(readFileSync(claudeMdPath, 'utf-8')).toBe('# English Template\n')
  })
})
