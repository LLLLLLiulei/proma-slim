import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { listAgentSessions } from './agent-session-manager'
import { getAgentWorkspacesDir } from './config-paths'
import { createAgentWorkspace, listAgentWorkspaces } from './workspace-service'
import { pageBuilderTemplateService } from './page-builder-template-service'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

function createUserTemplate(
  id: string,
  options: {
    name?: string
    html?: string
    css?: string
    sourceMode?: 'standalone' | 'cms-integrated'
  } = {},
) {
  const templateDir = join(homedir(), '.proma', 'page-builder-templates', id)
  const workspaceFilesDir = join(templateDir, 'workspace-files')
  mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
  writeFileSync(
    join(workspaceFilesDir, 'index.html'),
    options.html ?? '<!doctype html><html><head><link rel="stylesheet" href="./assets/site.css"></head><body><h1>Template Use</h1></body></html>',
    'utf-8',
  )
  writeFileSync(join(workspaceFilesDir, 'assets', 'site.css'), options.css ?? 'body { color: #047857; }', 'utf-8')
  mkdirSync(join(templateDir, 'reports'), { recursive: true })
  mkdirSync(join(templateDir, 'source'), { recursive: true })
  writeFileSync(join(templateDir, 'reports', 'static-export-report.json'), '{"ok":true}', 'utf-8')
  writeFileSync(join(templateDir, 'source', 'source-project.json'), '{"workspaceId":"source-workspace"}', 'utf-8')
  writeFileSync(join(templateDir, 'template.json'), JSON.stringify({
    version: 1,
    id,
    name: options.name ?? '服务层模板',
    sourceKind: 'saved-project',
    entry: 'workspace-files/index.html',
    createdAt: '2026-06-15T09:00:00.000Z',
    sourceProject: {
      sourceMode: options.sourceMode ?? 'standalone',
      exportedAt: '2026-06-15T09:00:00.000Z',
    },
  }, null, 2), 'utf-8')

  return { templateDir, workspaceFilesDir }
}

describe('PageBuilderTemplateService saveWorkspaceAsTemplate', () => {
  test('saves a standalone workspace as a registry-visible user template', async () => {
    const workspace = createAgentWorkspace('Service Template Source', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="./assets/site.css"></head><body><h1>Service Template</h1></body></html>',
      'utf-8',
    )
    writeFileSync(join(workspaceFilesDir, 'assets', 'site.css'), 'body { color: teal; }', 'utf-8')

    const result = await pageBuilderTemplateService.saveWorkspaceAsTemplate(workspace, {
      name: 'Service Saved Template',
      tags: ['服务', ' ', '模板'],
    }, {
      sourceMode: 'standalone',
    })

    expect(result.template).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^tpl_saved_[0-9]{14}_[A-Za-z0-9_-]+$/),
      name: 'Service Saved Template',
      tags: ['服务', '模板'],
      sourceKind: 'saved-project',
      deletable: true,
    }))
    const templateDir = join(homedir(), '.proma', 'page-builder-templates', result.template.id)
    expect(readFileSync(join(templateDir, 'workspace-files', 'index.html'), 'utf-8')).toContain('Service Template')
    expect(readFileSync(join(templateDir, 'reports', 'static-export-report.json'), 'utf-8')).toContain('localizedResourceCount')
    expect(readFileSync(join(templateDir, 'reports', 'template-validation-report.json'), 'utf-8')).toContain('"ok": true')
    expect(existsSync(join(templateDir, 'workspace-files', 'export-report.json'))).toBe(false)

    expect(pageBuilderTemplateService.listTemplates()).toEqual({
      templates: [expect.objectContaining({
        id: result.template.id,
        name: 'Service Saved Template',
      })],
    })
  })
})

describe('PageBuilderTemplateService instantiateTemplateProject', () => {
  test('creates a page-builder workspace and first session from a user template', async () => {
    createUserTemplate('tpl_service_use_202606150900', {
      name: '服务层复用模板',
      html: '<!doctype html><html><head><link rel="stylesheet" href="./assets/site.css"></head><body><h1>Template Instance</h1></body></html>',
    })

    const result = await pageBuilderTemplateService.instantiateTemplateProject('tpl_service_use_202606150900', {
      projectName: '服务层自定义项目',
    })

    expect(result.workspace).toEqual(expect.objectContaining({
      name: '服务层自定义项目',
      template: 'page-builder',
    }))
    expect(result.session.workspaceId).toBe(result.workspace.id)
    expect(result.previewState).toEqual(expect.objectContaining({
      hasPreview: true,
      entryUrl: `/api/workspaces/${result.workspace.id}/preview/`,
      hasCmsRendering: false,
      requiresSameOrigin: false,
    }))

    const workspaceRoot = join(getAgentWorkspacesDir(), result.workspace.slug)
    const workspaceFilesDir = join(workspaceRoot, 'workspace-files')
    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toContain('Template Instance')
    expect(readFileSync(join(workspaceFilesDir, 'assets', 'site.css'), 'utf-8')).toContain('#047857')
    expect(existsSync(join(workspaceRoot, 'template.json'))).toBe(false)
    expect(existsSync(join(workspaceRoot, 'reports'))).toBe(false)
    expect(existsSync(join(workspaceRoot, 'source'))).toBe(false)
  })

  test('uses cms-integrated saved templates as static snapshots without inheriting cms metadata', async () => {
    const { workspaceFilesDir } = createUserTemplate('tpl_cms_snapshot_202606150900', {
      name: 'CMS 固化模板',
      sourceMode: 'cms-integrated',
    })
    mkdirSync(join(workspaceFilesDir, '.proma'), { recursive: true })
    writeFileSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'), '{"regions":[]}', 'utf-8')

    const result = await pageBuilderTemplateService.instantiateTemplateProject('tpl_cms_snapshot_202606150900', {
      projectName: 'CMS 固化模板项目',
    })

    const workspaceRoot = join(getAgentWorkspacesDir(), result.workspace.slug)
    expect(readFileSync(join(workspaceRoot, 'workspace-files', 'index.html'), 'utf-8')).toContain('Template Use')
    expect(existsSync(join(workspaceRoot, 'workspace-files', '.proma', 'cms-rendering-manifest.json'))).toBe(false)
    expect(result.previewState.hasCmsRendering).toBe(false)
    expect(result.previewState.requiresSameOrigin).toBe(false)
  })

  test('rejects blank project names before creating a project', async () => {
    createUserTemplate('tpl_blank_project_name_202606150900', {
      name: '空名称模板',
    })

    expect(() => pageBuilderTemplateService.instantiateTemplateProject('tpl_blank_project_name_202606150900', {
      projectName: '   ',
    })).toThrow('项目名称不能为空')

    expect(listAgentWorkspaces().some((workspace) => workspace.name === '空名称模板')).toBe(false)
    expect(readdirSync(getAgentWorkspacesDir()).filter((entry) => entry !== 'default')).toEqual([])
  })

  test('rejects unsafe template symlinks and rolls back the created project', async () => {
    const { templateDir, workspaceFilesDir } = createUserTemplate('tpl_symlink_use_202606150900', {
      name: '危险模板',
    })
    symlinkSync(join(templateDir, 'template.json'), join(workspaceFilesDir, 'assets', 'escape.json'))

    expect(() => pageBuilderTemplateService.instantiateTemplateProject('tpl_symlink_use_202606150900', {
      projectName: '危险模板项目',
    }))
      .toThrow('模板包含不支持的文件类型')

    expect(listAgentWorkspaces().some((workspace) => workspace.name === '危险模板项目')).toBe(false)
    expect(listAgentSessions().some((session) => session.title === '新 Agent 会话')).toBe(false)
    expect(readdirSync(getAgentWorkspacesDir()).filter((entry) => entry !== 'default')).toEqual([])
  })

  test('rolls back the workspace when creating the first session fails', async () => {
    createUserTemplate('tpl_session_failure_202606150900', {
      name: '会话失败模板',
    })
    const sessionsIndexPath = join(homedir(), '.proma', 'agent-sessions.json')
    rmSync(sessionsIndexPath, { force: true, recursive: true })
    mkdirSync(sessionsIndexPath, { recursive: true })

    const originalError = console.error
    const originalWarn = console.warn
    console.error = () => {}
    console.warn = () => {}
    try {
      expect(() => pageBuilderTemplateService.instantiateTemplateProject('tpl_session_failure_202606150900', {
        projectName: '会话失败模板项目',
      }))
        .toThrow('创建模板项目失败')

      expect(listAgentWorkspaces().some((workspace) => workspace.name === '会话失败模板项目')).toBe(false)
      expect(readdirSync(getAgentWorkspacesDir()).filter((entry) => entry !== 'default')).toEqual([])
    } finally {
      console.error = originalError
      console.warn = originalWarn
      rmSync(sessionsIndexPath, { recursive: true, force: true })
    }
  })
})
