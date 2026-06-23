import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CmsIntegrationError } from './cms-integration-errors'
import { createCmsProjectBindingStore } from './cms-project-binding-store'

describe('cms project binding store', () => {
  let configDir: string
  let projectsPath: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-cms-binding-'))
    projectsPath = join(configDir, 'integrations', 'cms', 'projects.json')
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  test('creates a binding with a stable external project id and validation timestamp', async () => {
    const store = createCmsProjectBindingStore({ projectsPath, now: () => 1234 })

    const result = await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-1',
      projectName: 'CMS Topic',
      siteId: '14',
      cmsUser: { userName: 'cms-user', realName: 'CMS User' },
    }, async () => ({ workspaceId: 'workspace-1', primarySessionId: 'session-1' }))

    expect(result.created).toBe(true)
    expect(result.binding).toMatchObject({
      externalRecordId: 'cms-topic-1',
      projectName: 'CMS Topic',
      siteId: '14',
      workspaceId: 'workspace-1',
      primarySessionId: 'session-1',
      cmsUserName: 'cms-user',
      cmsRealName: 'CMS User',
      createdAt: 1234,
      updatedAt: 1234,
      lastValidatedAt: 1234,
    })
    expect(result.binding.projectId).toStartWith('pbp_')
    expect(result.binding.projectId).not.toBe('workspace-1')
    expect(result.binding.projectId).not.toBe('session-1')
    expect(readFileSync(projectsPath, 'utf-8')).not.toContain('JSESSIONID')
  })

  test('persists optional sourceTemplateId and keeps old bindings compatible', async () => {
    mkdirSync(join(configDir, 'integrations', 'cms'), { recursive: true })
    writeFileSync(projectsPath, JSON.stringify({
      version: 1,
      projects: [{
        projectId: 'pbp_old',
        workspaceId: 'workspace-old',
        primarySessionId: 'session-old',
        projectName: 'Old CMS Topic',
        siteId: '14',
        externalRecordId: 'cms-topic-old',
        createdAt: 1000,
        updatedAt: 1000,
        lastValidatedAt: 1000,
      }],
    }), 'utf-8')
    const store = createCmsProjectBindingStore({ projectsPath, now: () => 1234 })

    const result = await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-template',
      projectName: 'CMS Template Topic',
      siteId: '14',
      sourceTemplateId: 'tpl_news',
      cmsUser: {},
    }, async () => ({ workspaceId: 'workspace-1', primarySessionId: 'session-1' }))

    expect(result.binding.sourceTemplateId).toBe('tpl_news')
    const projects = store.readAll()
    expect(projects.find((project) => project.projectId === 'pbp_old')?.sourceTemplateId).toBeUndefined()
    expect(projects.find((project) => project.externalRecordId === 'cms-topic-template')?.sourceTemplateId).toBe('tpl_news')
    expect(JSON.parse(readFileSync(projectsPath, 'utf-8')).projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ externalRecordId: 'cms-topic-template', sourceTemplateId: 'tpl_news' }),
    ]))
  })

  test('does not reuse workspace or session ids even when project id factory collides', async () => {
    const store = createCmsProjectBindingStore({
      projectsPath,
      now: () => 1234,
      projectIdFactory: () => 'workspace-1',
    })

    const result = await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-1',
      projectName: 'CMS Topic',
      siteId: '14',
      cmsUser: {},
    }, async () => ({ workspaceId: 'workspace-1', primarySessionId: 'session-1' }))

    expect(result.binding.projectId).toStartWith('pbp_')
    expect(result.binding.projectId).not.toBe('workspace-1')
    expect(result.binding.projectId).not.toBe('session-1')
  })

  test('returns the same project for idempotent retries without creating new internals', async () => {
    const store = createCmsProjectBindingStore({ projectsPath, now: () => 1000 })
    let createCount = 0

    const first = await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-1',
      projectName: 'CMS Topic',
      siteId: '14',
      cmsUser: { userName: 'cms-user' },
    }, async () => {
      createCount += 1
      return { workspaceId: 'workspace-1', primarySessionId: 'session-1' }
    })

    const second = await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-1',
      projectName: 'Renamed Topic',
      siteId: '14',
      cmsUser: { userName: 'cms-user-2' },
    }, async () => {
      createCount += 1
      return { workspaceId: 'workspace-2', primarySessionId: 'session-2' }
    }, () => true)

    expect(createCount).toBe(1)
    expect(second.created).toBe(false)
    expect(second.binding.projectId).toBe(first.binding.projectId)
    expect(second.binding.workspaceId).toBe('workspace-1')
  })

  test('rejects site conflicts and missing internal resources', async () => {
    const store = createCmsProjectBindingStore({ projectsPath, now: () => 1000 })
    await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-1',
      projectName: 'CMS Topic',
      siteId: '14',
      cmsUser: {},
    }, async () => ({ workspaceId: 'workspace-1', primarySessionId: 'session-1' }))

    await expect(store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-1',
      projectName: 'CMS Topic',
      siteId: '15',
      cmsUser: {},
    }, async () => ({ workspaceId: 'workspace-2', primarySessionId: 'session-2' }))).rejects.toMatchObject({
      code: 'project_conflict',
      status: 409,
    })

    await expect(store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-1',
      projectName: 'CMS Topic',
      siteId: '14',
      cmsUser: {},
    }, async () => ({ workspaceId: 'workspace-2', primarySessionId: 'session-2' }), () => false)).rejects.toBeInstanceOf(CmsIntegrationError)
  })

  test('applies sourceTemplateId idempotency and conflict rules', async () => {
    const store = createCmsProjectBindingStore({ projectsPath, now: () => 1000 })
    let createCount = 0
    const first = await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-template',
      projectName: 'CMS Topic',
      siteId: '14',
      sourceTemplateId: 'tpl_a',
      cmsUser: {},
    }, async () => {
      createCount += 1
      return { workspaceId: 'workspace-1', primarySessionId: 'session-1' }
    })

    const sameTemplate = await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-template',
      projectName: 'CMS Topic retry',
      siteId: '14',
      sourceTemplateId: 'tpl_a',
      cmsUser: {},
    }, async () => {
      createCount += 1
      return { workspaceId: 'workspace-2', primarySessionId: 'session-2' }
    })
    const oldClient = await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-template',
      projectName: 'CMS Topic old client retry',
      siteId: '14',
      cmsUser: {},
    }, async () => {
      createCount += 1
      return { workspaceId: 'workspace-3', primarySessionId: 'session-3' }
    })

    expect(createCount).toBe(1)
    expect(sameTemplate).toMatchObject({ created: false })
    expect(sameTemplate.binding.projectId).toBe(first.binding.projectId)
    expect(oldClient).toMatchObject({ created: false })
    expect(oldClient.binding.projectId).toBe(first.binding.projectId)

    await expect(store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-template',
      projectName: 'CMS Topic conflict',
      siteId: '14',
      sourceTemplateId: 'tpl_b',
      cmsUser: {},
    }, async () => ({ workspaceId: 'workspace-4', primarySessionId: 'session-4' }))).rejects.toMatchObject({
      code: 'project_conflict',
      status: 409,
    })

    await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-empty',
      projectName: 'CMS Empty Topic',
      siteId: '14',
      cmsUser: {},
    }, async () => ({ workspaceId: 'workspace-empty', primarySessionId: 'session-empty' }))
    await expect(store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-empty',
      projectName: 'CMS Empty Topic template retry',
      siteId: '14',
      sourceTemplateId: 'tpl_a',
      cmsUser: {},
    }, async () => ({ workspaceId: 'workspace-5', primarySessionId: 'session-5' }))).rejects.toMatchObject({
      code: 'project_conflict',
      status: 409,
    })
  })

  test('serializes concurrent creates for the same externalRecordId', async () => {
    const store = createCmsProjectBindingStore({ projectsPath, now: () => 1000 })
    let createCount = 0

    const requests = await Promise.all(Array.from({ length: 8 }, async () => store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-1',
      projectName: 'CMS Topic',
      siteId: '14',
      cmsUser: {},
    }, async () => {
      createCount += 1
      await new Promise((resolve) => setTimeout(resolve, 1))
      return { workspaceId: 'workspace-1', primarySessionId: 'session-1' }
    }, () => true)))

    expect(createCount).toBe(1)
    expect(new Set(requests.map((result) => result.binding.projectId)).size).toBe(1)
    expect(JSON.parse(readFileSync(projectsPath, 'utf-8'))).toMatchObject({ version: 1 })
  })

  test('recovers from a malformed binding file on next write', async () => {
    mkdirSync(join(configDir, 'integrations', 'cms'), { recursive: true })
    writeFileSync(projectsPath, '{broken', 'utf-8')
    const store = createCmsProjectBindingStore({ projectsPath, now: () => 1000 })

    const result = await store.createOrGetByExternalRecord({
      externalRecordId: 'cms-topic-1',
      projectName: 'CMS Topic',
      siteId: '14',
      cmsUser: {},
    }, async () => ({ workspaceId: 'workspace-1', primarySessionId: 'session-1' }))

    expect(result.created).toBe(true)
    expect(existsSync(projectsPath)).toBe(true)
    expect(JSON.parse(readFileSync(projectsPath, 'utf-8')).projects).toHaveLength(1)
  })
})
