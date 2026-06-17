import { afterEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { unzipSync, zipSync } from 'fflate'
import { createAgentSession } from '../../lib/agent-session-manager'
import { getAgentWorkspacesDir } from '../../lib/config-paths'
import { createAgentWorkspace } from '../../lib/workspace-service'
import { createHttpApp } from '../app'

const originalFetch = globalThis.fetch
const originalCmsEnv = {
  PROMA_CMS_BASE_URL: process.env.PROMA_CMS_BASE_URL,
  PROMA_CMS_USERNAME: process.env.PROMA_CMS_USERNAME,
  PROMA_CMS_PASSWORD: process.env.PROMA_CMS_PASSWORD,
} as const
const originalPageBuilderEnv = {
  AI_PAGE_BUILDER_BASE_PATH: process.env.AI_PAGE_BUILDER_BASE_PATH,
  AI_PAGE_BUILDER_INTEGRATION_MODE: process.env.AI_PAGE_BUILDER_INTEGRATION_MODE,
  AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS: process.env.AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS,
  AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB: process.env.AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB,
  AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB: process.env.AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB,
  NODE_ENV: process.env.NODE_ENV,
} as const

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
  globalThis.fetch = originalFetch
  mock.restore()
  restoreCmsEnv()
  restorePageBuilderEnv()
})

function createApp() {
  return createHttpApp({
    distDir: process.cwd(),
    isDev: true,
  })
}

function setCmsEnv() {
  process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
  process.env.PROMA_CMS_USERNAME = 'test-user'
  process.env.PROMA_CMS_PASSWORD = 'test-pass'
}

function restoreCmsEnv() {
  restoreEnvVar('PROMA_CMS_BASE_URL', originalCmsEnv.PROMA_CMS_BASE_URL)
  restoreEnvVar('PROMA_CMS_USERNAME', originalCmsEnv.PROMA_CMS_USERNAME)
  restoreEnvVar('PROMA_CMS_PASSWORD', originalCmsEnv.PROMA_CMS_PASSWORD)
}

function restorePageBuilderEnv() {
  restoreEnvVar('AI_PAGE_BUILDER_BASE_PATH', originalPageBuilderEnv.AI_PAGE_BUILDER_BASE_PATH)
  restoreEnvVar('AI_PAGE_BUILDER_INTEGRATION_MODE', originalPageBuilderEnv.AI_PAGE_BUILDER_INTEGRATION_MODE)
  restoreEnvVar(
    'AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS',
    originalPageBuilderEnv.AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS,
  )
  restoreEnvVar(
    'AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB',
    originalPageBuilderEnv.AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB,
  )
  restoreEnvVar(
    'AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB',
    originalPageBuilderEnv.AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB,
  )
  restoreEnvVar('NODE_ENV', originalPageBuilderEnv.NODE_ENV)
}

function restoreEnvVar(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

function createTokenResponse() {
  return new Response(JSON.stringify({
    status: 1,
    message: '操作成功!',
    access_token: 'Bearer slim-token',
    expires_in: 18_000,
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function createUserTemplate(
  id: string,
  options: {
    name?: string
    description?: string
    tags?: string[]
    category?: string
    html?: string
    css?: string
    manifestOverrides?: Record<string, unknown>
  } = {},
) {
  const templateDir = join(homedir(), '.proma', 'page-builder-templates', id)
  const workspaceFilesDir = join(templateDir, 'workspace-files')
  mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
  writeFileSync(join(workspaceFilesDir, 'index.html'), options.html ?? '<!doctype html><h1>Template</h1>', 'utf-8')
  writeFileSync(join(workspaceFilesDir, 'assets', 'site.css'), options.css ?? 'body { color: red; }', 'utf-8')

  const manifest = {
    version: 1,
    id,
    name: options.name ?? '新闻专题模板',
    description: options.description ?? '适合新闻专题。',
    tags: options.tags ?? ['新闻', '专题'],
    category: options.category ?? 'special-page',
    sourceKind: 'saved-project',
    entry: 'workspace-files/index.html',
    createdAt: '2026-06-14T10:00:00.000Z',
    sourceProject: {
      workspaceId: 'workspace-source',
      workspaceName: '来源项目',
      sourceMode: 'standalone',
      exportedAt: '2026-06-14T10:00:00.000Z',
    },
    ...options.manifestOverrides,
  }
  writeFileSync(join(templateDir, 'template.json'), JSON.stringify(manifest, null, 2), 'utf-8')

  return { templateDir, workspaceFilesDir }
}

function createZipFile(entries: Record<string, string | Uint8Array>, fileName = 'imported-template.zip'): File {
  const encodedEntries: Record<string, Uint8Array> = {}
  const encoder = new TextEncoder()
  for (const [entryName, content] of Object.entries(entries)) {
    encodedEntries[entryName] = typeof content === 'string'
      ? encoder.encode(content)
      : content
  }

  const zipBytes = zipSync(encodedEntries)
  const zipBody = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(zipBody).set(zipBytes)
  return new File([zipBody], fileName, { type: 'application/zip' })
}

async function importTemplateZip(
  app: ReturnType<typeof createApp>,
  file: File,
): Promise<Response> {
  const formData = new FormData()
  formData.set('file', file)
  return await app.fetch(new Request('http://localhost/api/page-builder/templates/import', {
    method: 'POST',
    body: formData,
  }))
}

describe('page-builder routes', () => {
  test('GET /api/page-builder/templates returns valid user templates and skips invalid manifests without thumbnail fields', async () => {
    process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
    const app = createApp()
    createUserTemplate('tpl_saved_202606141000', {
      manifestOverrides: {
        thumbnail: 'thumbnail.png',
        thumbnailUrl: '/thumbnail.png',
      },
    })
    createUserTemplate('tpl_invalid_mismatch', {
      manifestOverrides: {
        id: 'different-id',
      },
    })
    const escapingEntry = createUserTemplate('tpl_invalid_entry_symlink')
    unlinkSync(join(escapingEntry.workspaceFilesDir, 'index.html'))
    symlinkSync(join(escapingEntry.templateDir, 'template.json'), join(escapingEntry.workspaceFilesDir, 'index.html'))

    const response = await app.fetch(new Request('http://localhost/api/page-builder/templates'))

    expect(response.status).toBe(200)
    const payload = await response.json() as { templates: Array<Record<string, unknown>> }
    expect(payload.templates).toHaveLength(1)
    expect(payload.templates[0]).toEqual(expect.objectContaining({
      id: 'tpl_saved_202606141000',
      name: '新闻专题模板',
      description: '适合新闻专题。',
      tags: ['新闻', '专题'],
      category: 'special-page',
      sourceKind: 'saved-project',
      createdAt: '2026-06-14T10:00:00.000Z',
      previewUrl: '/pagebuilder/api/page-builder/templates/tpl_saved_202606141000/preview/',
      deletable: true,
    }))
    expect(payload.templates[0]).not.toHaveProperty('thumbnail')
    expect(payload.templates[0]).not.toHaveProperty('thumbnailUrl')
  })

  test('GET /api/page-builder/templates/:templateId returns template detail without thumbnail fields', async () => {
    const app = createApp()
    createUserTemplate('tpl_detail_202606141000', {
      manifestOverrides: {
        thumbnail: 'thumbnail.png',
        thumbnailUrl: '/thumbnail.png',
      },
    })

    const response = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_detail_202606141000'))

    expect(response.status).toBe(200)
    const payload = await response.json() as Record<string, unknown>
    expect(payload).toEqual(expect.objectContaining({
      id: 'tpl_detail_202606141000',
      name: '新闻专题模板',
      entry: 'workspace-files/index.html',
      previewUrl: '/api/page-builder/templates/tpl_detail_202606141000/preview/',
      deletable: true,
    }))
    expect(payload).not.toHaveProperty('thumbnail')
    expect(payload).not.toHaveProperty('thumbnailUrl')

    const missingResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/not-found'))
    expect(missingResponse.status).toBe(404)
  })

  test('PATCH /api/page-builder/templates/:templateId updates only the template name', async () => {
    const app = createApp()
    const { templateDir } = createUserTemplate('tpl_rename_202606141000', {
      name: '旧模板名称',
      description: '保留描述',
      tags: ['保留标签'],
    })

    const response = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_rename_202606141000', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        name: '  新模板名称  ',
      }),
    }))

    expect(response.status).toBe(200)
    const payload = await response.json() as Record<string, unknown>
    expect(payload).toEqual({
      template: expect.objectContaining({
        id: 'tpl_rename_202606141000',
        name: '新模板名称',
        description: '保留描述',
        tags: ['保留标签'],
        previewUrl: '/api/page-builder/templates/tpl_rename_202606141000/preview/',
      }),
    })

    const manifest = JSON.parse(readFileSync(join(templateDir, 'template.json'), 'utf-8')) as Record<string, unknown>
    expect(manifest.name).toBe('新模板名称')
    expect(manifest.description).toBe('保留描述')
    expect(manifest.tags).toEqual(['保留标签'])

    const invalidResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_rename_202606141000', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        name: '   ',
      }),
    }))
    expect(invalidResponse.status).toBe(400)

    const missingResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/not-found', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        name: '新模板名称',
      }),
    }))
    expect(missingResponse.status).toBe(404)
  })

  test('template preview serves readonly html and assets without injecting builder or cms runtime', async () => {
    const app = createApp()
    createUserTemplate('tpl_preview_202606141000', {
      html: '<!doctype html><html><head><link rel="stylesheet" href="./assets/site.css"></head><body><h1>Preview Template</h1></body></html>',
    })

    const previewResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_preview_202606141000/preview/'))

    expect(previewResponse.status).toBe(200)
    expect(previewResponse.headers.get('content-type')).toContain('text/html')
    expect(previewResponse.headers.get('cache-control')).toBe('no-store')
    expect(previewResponse.headers.get('content-security-policy')).toContain('sandbox allow-scripts allow-forms allow-popups')
    expect(previewResponse.headers.get('content-security-policy')).toContain('allow-same-origin')
    const html = await previewResponse.text()
    expect(html).toContain('<h1>Preview Template</h1>')
    expect(html).not.toContain('preview-bridge.js')
    expect(html).not.toContain('cms-rendering-preview.js')
    expect(html).not.toContain('cms-rendering-vue.js')

    const assetResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_preview_202606141000/preview/assets/site.css'))
    expect(assetResponse.status).toBe(200)
    expect(assetResponse.headers.get('cache-control')).toBe('no-store')
    expect(await assetResponse.text()).toContain('color: red')

    const missingResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_preview_202606141000/preview/missing.css'))
    expect(missingResponse.status).toBe(404)

    const traversalResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_preview_202606141000/preview/%2e%2e%2ftemplate.json'))
    expect(traversalResponse.status).toBe(403)
  })

  test('template download returns a reusable zip with only manifest and workspace files', async () => {
    const app = createApp()
    const { templateDir } = createUserTemplate('tpl_download_202606141000', {
      name: '可下载模板',
      html: '<!doctype html><html><body><h1>Download Template</h1></body></html>',
      css: 'body { color: #2563eb; }',
    })
    mkdirSync(join(templateDir, 'reports'), { recursive: true })
    mkdirSync(join(templateDir, 'source'), { recursive: true })
    writeFileSync(join(templateDir, 'reports', 'template-validation-report.json'), '{"ok":true}', 'utf-8')
    writeFileSync(join(templateDir, 'source', 'source-project.json'), '{"workspaceId":"secret"}', 'utf-8')

    const response = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_download_202606141000/download'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-disposition')).toContain('attachment;')
    expect(response.headers.get('content-disposition')).toContain('filename="tpl_download_202606141000.zip"')
    const zipBytes = new Uint8Array(await response.arrayBuffer())
    const entries = unzipSync(zipBytes)
    expect(Object.keys(entries).sort()).toEqual([
      'template.json',
      'workspace-files/assets/site.css',
      'workspace-files/index.html',
    ])
    const decoder = new TextDecoder()
    const manifest = JSON.parse(decoder.decode(entries['template.json'])) as Record<string, unknown>
    expect(manifest).toEqual(expect.objectContaining({
      version: 1,
      id: 'tpl_download_202606141000',
      name: '可下载模板',
      entry: 'workspace-files/index.html',
    }))
    expect(manifest).not.toHaveProperty('sourceProject')
    expect(decoder.decode(entries['workspace-files/index.html'])).toContain('Download Template')
    expect(decoder.decode(entries['workspace-files/assets/site.css'])).toContain('#2563eb')

    const importedResponse = await importTemplateZip(app, new File([zipBytes], 'downloaded-template.zip', {
      type: 'application/zip',
    }))
    expect(importedResponse.status).toBe(201)
    expect(await importedResponse.json()).toEqual({
      template: expect.objectContaining({
        id: expect.stringMatching(/^tpl_imported_[0-9]{14}_[A-Za-z0-9_-]+$/),
        name: '可下载模板',
      }),
    })
  })

  test('template download rejects symlinks escaping workspace files', async () => {
    const app = createApp()
    const { templateDir, workspaceFilesDir } = createUserTemplate('tpl_download_symlink_202606141000')
    symlinkSync(join(templateDir, 'template.json'), join(workspaceFilesDir, 'assets', 'escape.json'))

    const response = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_download_symlink_202606141000/download'))

    expect(response.status).toBe(403)
  })

  test('POST /api/page-builder/templates/import imports a static zip with root index into the template registry', async () => {
    process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
    const app = createApp()
    const zipFile = createZipFile({
      'template.json': JSON.stringify({
        version: 1,
        id: 'external-id-is-ignored',
        name: '外部平台模板',
      }),
      'index.html': '<!doctype html><html><head><script src="./assets/site.js"></script><script src="https://cdn.example.com/runtime.js"></script></head><body><h1>Imported Root Template</h1></body></html>',
      'assets/site.css': 'body { color: #123456; }',
      'assets/site.js': 'window.externalTemplateLoaded = true;',
      '__MACOSX/._ignored': 'ignored',
      '.DS_Store': 'ignored',
    }, 'fallback-name.zip')

    const response = await importTemplateZip(app, zipFile)

    expect(response.status).toBe(201)
    const payload = await response.json() as { template: { id: string; name: string; previewUrl: string } }
    expect(payload.template).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^tpl_imported_[0-9]{14}_[A-Za-z0-9_-]+$/),
      name: '外部平台模板',
      previewUrl: `/pagebuilder/api/page-builder/templates/${payload.template.id}/preview/`,
    }))
    expect(payload.template.id).not.toBe('external-id-is-ignored')
    expect(payload.template).not.toHaveProperty('thumbnail')
    expect(payload.template).not.toHaveProperty('thumbnailUrl')

    const templateDir = join(homedir(), '.proma', 'page-builder-templates', payload.template.id)
    const html = readFileSync(join(templateDir, 'workspace-files', 'index.html'), 'utf-8')
    expect(html).toContain('Imported Root Template')
    expect(html).toContain('https://cdn.example.com/runtime.js')
    expect(readFileSync(join(templateDir, 'workspace-files', 'assets', 'site.css'), 'utf-8')).toContain('#123456')
    expect(readFileSync(join(templateDir, 'workspace-files', 'assets', 'site.js'), 'utf-8')).toContain('externalTemplateLoaded')
    expect(existsSync(join(templateDir, 'workspace-files', '__MACOSX'))).toBe(false)
    expect(existsSync(join(templateDir, 'workspace-files', '.DS_Store'))).toBe(false)
    const report = JSON.parse(readFileSync(join(templateDir, 'reports', 'template-import-report.json'), 'utf-8')) as Record<string, unknown>
    expect(report).toEqual(expect.objectContaining({
      version: 1,
      sourceFileName: 'fallback-name.zip',
      entryRoot: '',
      entryFile: 'index.html',
    }))

    const listResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates'))
    expect(await listResponse.json()).toEqual({
      templates: [expect.objectContaining({
        id: payload.template.id,
        name: '外部平台模板',
      })],
    })
  })

  test('POST /api/page-builder/templates/import recognizes common index layouts and falls back to the uploaded file name', async () => {
    const app = createApp()
    const singleRootResponse = await importTemplateZip(app, createZipFile({
      'dist/index.html': '<h1>Single Root</h1>',
      'dist/assets/site.css': 'body { color: green; }',
    }, 'single-root.zip'))
    const workspaceFilesResponse = await importTemplateZip(app, createZipFile({
      'workspace-files/index.html': '<h1>Workspace Files</h1>',
      'workspace-files/assets/site.css': 'body { color: blue; }',
    }, 'workspace-package.zip'))
    const uniqueNestedResponse = await importTemplateZip(app, createZipFile({
      'archive/public/pages/index.html': '<h1>Unique Nested</h1>',
      'archive/public/pages/assets/site.css': 'body { color: purple; }',
      'archive/public/readme.txt': 'no entry here',
    }, 'unique-nested-template.zip'))

    expect(singleRootResponse.status).toBe(201)
    expect(workspaceFilesResponse.status).toBe(201)
    expect(uniqueNestedResponse.status).toBe(201)
    const singleRoot = await singleRootResponse.json() as { template: { id: string; name: string } }
    const workspaceFiles = await workspaceFilesResponse.json() as { template: { id: string; name: string } }
    const uniqueNested = await uniqueNestedResponse.json() as { template: { id: string; name: string } }

    expect(singleRoot.template.name).toBe('single-root')
    expect(workspaceFiles.template.name).toBe('workspace-package')
    expect(uniqueNested.template.name).toBe('unique-nested-template')
    expect(readFileSync(join(homedir(), '.proma', 'page-builder-templates', singleRoot.template.id, 'workspace-files', 'index.html'), 'utf-8')).toContain('Single Root')
    expect(readFileSync(join(homedir(), '.proma', 'page-builder-templates', workspaceFiles.template.id, 'workspace-files', 'index.html'), 'utf-8')).toContain('Workspace Files')
    expect(readFileSync(join(homedir(), '.proma', 'page-builder-templates', uniqueNested.template.id, 'workspace-files', 'index.html'), 'utf-8')).toContain('Unique Nested')
  })

  test('POST /api/page-builder/templates/import rejects missing files, missing index, ambiguous index, unsafe paths, and size limits', async () => {
    const app = createApp()
    const missingFileResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/import', {
      method: 'POST',
      body: new FormData(),
    }))
    expect(missingFileResponse.status).toBe(400)

    const noIndexResponse = await importTemplateZip(app, createZipFile({
      'assets/site.css': 'body {}',
    }))
    expect(noIndexResponse.status).toBe(400)
    expect(await noIndexResponse.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('index.html'),
    }))

    const ambiguousResponse = await importTemplateZip(app, createZipFile({
      'a/index.html': '<h1>A</h1>',
      'b/index.html': '<h1>B</h1>',
    }))
    expect(ambiguousResponse.status).toBe(400)
    expect(await ambiguousResponse.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('无法自动判断模板入口'),
    }))

    const unsafeResponse = await importTemplateZip(app, createZipFile({
      'index.html': '<h1>Unsafe</h1>',
      '../escape.txt': 'escape',
    }))
    expect(unsafeResponse.status).toBe(403)

    process.env.AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB = '0.000001'
    const zipTooLargeResponse = await importTemplateZip(app, createZipFile({
      'index.html': '<h1>Too Large</h1>',
    }))
    expect(zipTooLargeResponse.status).toBe(413)
    delete process.env.AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB

    process.env.AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB = '0.000001'
    const uncompressedTooLargeResponse = await importTemplateZip(app, createZipFile({
      'index.html': '<h1>Too Large After Inflate</h1>',
    }))
    expect(uncompressedTooLargeResponse.status).toBe(413)

    const templatesRoot = join(homedir(), '.proma', 'page-builder-templates')
    expect(existsSync(templatesRoot) ? readdirSync(templatesRoot).filter((entry) => !entry.startsWith('.')) : []).toEqual([])
  })

  test('template library APIs are available in cms integration production mode', async () => {
    process.env.AI_PAGE_BUILDER_INTEGRATION_MODE = 'cms'
    process.env.NODE_ENV = 'production'
    const app = createApp()

    const importResponse = await importTemplateZip(app, createZipFile({
      'index.html': '<h1>CMS Import Allowed</h1>',
    }, 'cms-import.zip'))
    expect(importResponse.status).toBe(201)
    const payload = await importResponse.json() as { template: { id: string; name: string } }
    expect(payload.template.name).toBe('cms-import')

    const listResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates'))
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual({
      templates: [expect.objectContaining({
        id: payload.template.id,
      })],
    })

    const detailResponse = await app.fetch(new Request(`http://localhost/api/page-builder/templates/${payload.template.id}`))
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toEqual(expect.objectContaining({
      id: payload.template.id,
      name: 'cms-import',
    }))

    const previewResponse = await app.fetch(new Request(`http://localhost/api/page-builder/templates/${payload.template.id}/preview/`))
    expect(previewResponse.status).toBe(200)
    expect(await previewResponse.text()).toContain('CMS Import Allowed')

    const downloadResponse = await app.fetch(new Request(`http://localhost/api/page-builder/templates/${payload.template.id}/download`))
    expect(downloadResponse.status).toBe(200)

    const renameResponse = await app.fetch(new Request(`http://localhost/api/page-builder/templates/${payload.template.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'CMS 模板已重命名',
      }),
    }))
    expect(renameResponse.status).toBe(200)
    expect(await renameResponse.json()).toEqual({
      template: expect.objectContaining({
        id: payload.template.id,
        name: 'CMS 模板已重命名',
      }),
    })

    expect(readFileSync(join(homedir(), '.proma', 'page-builder-templates', payload.template.id, 'workspace-files', 'index.html'), 'utf-8')).toContain('CMS Import Allowed')

    const deleteResponse = await app.fetch(new Request(`http://localhost/api/page-builder/templates/${payload.template.id}`, {
      method: 'DELETE',
    }))
    expect(deleteResponse.status).toBe(204)
  })

  test('template preview rejects symlinks escaping workspace files', async () => {
    const app = createApp()
    const { templateDir, workspaceFilesDir } = createUserTemplate('tpl_symlink_202606141000')
    symlinkSync(join(templateDir, 'template.json'), join(workspaceFilesDir, 'assets', 'escape.json'))

    const response = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_symlink_202606141000/preview/assets/escape.json'))

    expect(response.status).toBe(403)
  })

  test('DELETE /api/page-builder/templates/:templateId deletes only the user template directory', async () => {
    const app = createApp()
    const { templateDir } = createUserTemplate('tpl_delete_202606141000')
    const workspace = createAgentWorkspace('Template Consumer', { template: 'page-builder' })
    const workspaceFile = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files', 'index.html')
    writeFileSync(workspaceFile, '<h1>Workspace</h1>', 'utf-8')

    const deleteResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_delete_202606141000', {
      method: 'DELETE',
    }))

    expect(deleteResponse.status).toBe(204)
    expect(existsSync(templateDir)).toBe(false)
    expect(existsSync(workspaceFile)).toBe(true)

    const listResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates'))
    expect(await listResponse.json()).toEqual({ templates: [] })

    const missingDeleteResponse = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_delete_202606141000', {
      method: 'DELETE',
    }))
    expect(missingDeleteResponse.status).toBe(404)
  })

  test('template registry APIs do not require dev standalone bypass in cms integration production mode', async () => {
    createUserTemplate('tpl_cms_bypass_202606141000')

    process.env.AI_PAGE_BUILDER_INTEGRATION_MODE = 'cms'
    process.env.NODE_ENV = 'production'
    const productionApp = createApp()

    const allowedResponse = await productionApp.fetch(new Request('http://localhost/api/page-builder/templates'))
    expect(allowedResponse.status).toBe(200)
    expect(await allowedResponse.json()).toEqual({
      templates: [expect.objectContaining({
        id: 'tpl_cms_bypass_202606141000',
      })],
    })
  })

  test('POST /api/page-builder/templates/:templateId/use creates a project, session, and preview state', async () => {
    process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
    const app = createApp()
    createUserTemplate('tpl_use_202606151000', {
      name: '首页活动模板',
      html: '<!doctype html><html><head><link rel="stylesheet" href="./assets/site.css"></head><body><h1>Use Template Project</h1></body></html>',
      css: 'body { color: #0f766e; }',
    })

    const response = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_use_202606151000/use', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectName: '自定义首页活动项目',
      }),
    }))

    expect(response.status).toBe(201)
    const payload = await response.json() as {
      workspace: { id: string; name: string; slug: string; template?: string }
      session: { id: string; workspaceId?: string }
      previewState: {
        hasPreview: boolean
        entryUrl: string | null
        hasCmsRendering: boolean
        requiresSameOrigin: boolean
      }
    }
    expect(payload.workspace).toEqual(expect.objectContaining({
      name: '自定义首页活动项目',
      template: 'page-builder',
    }))
    expect(payload.session.workspaceId).toBe(payload.workspace.id)
    expect(payload.previewState).toEqual(expect.objectContaining({
      hasPreview: true,
      entryUrl: `/pagebuilder/api/workspaces/${payload.workspace.id}/preview/`,
      hasCmsRendering: false,
      requiresSameOrigin: false,
    }))

    const workspaceFilesDir = join(getAgentWorkspacesDir(), payload.workspace.slug, 'workspace-files')
    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toContain('Use Template Project')
    expect(readFileSync(join(workspaceFilesDir, 'assets', 'site.css'), 'utf-8')).toContain('#0f766e')
    expect(existsSync(join(getAgentWorkspacesDir(), payload.workspace.slug, 'template.json'))).toBe(false)
  })

  test('POST /api/page-builder/templates/:templateId/use rejects an empty project name', async () => {
    const app = createApp()
    createUserTemplate('tpl_use_empty_name_202606151000', {
      name: '首页活动模板',
    })

    const response = await app.fetch(new Request('http://localhost/api/page-builder/templates/tpl_use_empty_name_202606151000/use', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectName: '   ',
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(expect.objectContaining({
      error: '项目名称不能为空',
    }))
  })

  test('POST /api/page-builder/templates/:templateId/use is available in cms integration production mode', async () => {
    createUserTemplate('tpl_use_cms_bypass_202606151000')

    process.env.AI_PAGE_BUILDER_INTEGRATION_MODE = 'cms'
    process.env.NODE_ENV = 'production'
    const productionApp = createApp()

    const allowedResponse = await productionApp.fetch(new Request('http://localhost/api/page-builder/templates/tpl_use_cms_bypass_202606151000/use', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectName: 'CMS 模式模板项目',
      }),
    }))
    expect(allowedResponse.status).toBe(201)
    expect(await allowedResponse.json()).toEqual(expect.objectContaining({
      workspace: expect.objectContaining({
        name: 'CMS 模式模板项目',
        template: 'page-builder',
      }),
      previewState: expect.objectContaining({
        hasPreview: true,
      }),
    }))
  })

  test('GET /api/page-builder/projects returns page-builder project summaries', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('History Project', { template: 'page-builder' })
    createAgentSession('History Session', undefined, workspace.id)

    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), '<h1>Preview</h1>', 'utf-8')

    const response = await app.fetch(new Request('http://localhost/api/page-builder/projects'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      workspaceId: workspace.id,
      workspaceName: 'History Project',
      previewUrl: `/api/workspaces/${workspace.id}/preview/`,
    })]))
  })

  test('DELETE /api/page-builder/projects/:workspaceId deletes the whole page-builder project', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Disposable Project', { template: 'page-builder' })
    createAgentSession('Draft', undefined, workspace.id)
    const workspaceRoot = join(homedir(), '.proma', 'agent-workspaces', workspace.slug)
    writeFileSync(join(workspaceRoot, 'workspace-files', 'index.html'), '<h1>Preview</h1>', 'utf-8')

    const response = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(204)
    const listResponse = await app.fetch(new Request('http://localhost/api/page-builder/projects'))
    expect(await listResponse.json()).toEqual([])
  })

  test('edit-lock routes acquire, renew, validate, and release project edit locks', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Lockable Project', { template: 'page-builder' })

    const acquireResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))

    expect(acquireResponse.status).toBe(201)
    const lease = await acquireResponse.json() as {
      workspaceId: string
      lockId: string
      holderId: string
      expiresAt: number
      heartbeatIntervalMs: number
    }
    expect(lease.workspaceId).toBe(workspace.id)
    expect(lease.holderId).toBe('holder-1')
    expect(lease.heartbeatIntervalMs).toBe(15_000)

    const renewResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock/${lease.lockId}/renew`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))

    expect(renewResponse.status).toBe(200)
    const renewedLease = await renewResponse.json() as { holderId: string; expiresAt: number }
    expect(renewedLease.holderId).toBe('holder-1')
    expect(renewedLease.expiresAt).toBeGreaterThanOrEqual(lease.expiresAt)

    const mismatchedRenewResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock/${lease.lockId}/renew`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-2',
      }),
    }))

    expect(mismatchedRenewResponse.status).toBe(409)

    const statusResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock/${lease.lockId}`))

    expect(statusResponse.status).toBe(200)
    expect(await statusResponse.json()).toEqual(expect.objectContaining({
      valid: true,
      lease: expect.objectContaining({
        lockId: lease.lockId,
        holderId: 'holder-1',
      }),
    }))

    const releaseResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock/${lease.lockId}/release`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))

    expect(releaseResponse.status).toBe(204)
  })

  test('edit-lock acquire rejects a second editor and project summaries expose locked edit state', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Locked History Project', { template: 'page-builder' })

    const firstAcquire = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))
    expect(firstAcquire.status).toBe(201)

    const secondAcquire = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-2',
      }),
    }))

    expect(secondAcquire.status).toBe(409)
    expect(await secondAcquire.json()).toEqual(expect.objectContaining({
      error: '该项目当前有其他编辑会话正在进行，请稍后再试',
      editState: expect.objectContaining({
        status: 'locked',
        reason: 'editor',
      }),
    }))

    const projectsResponse = await app.fetch(new Request('http://localhost/api/page-builder/projects'))

    expect(projectsResponse.status).toBe(200)
    expect(await projectsResponse.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      workspaceId: workspace.id,
      editState: expect.objectContaining({
        status: 'locked',
        reason: 'editor',
      }),
    })]))
  })

  test('DELETE /api/page-builder/projects/:workspaceId rejects locked projects', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Locked Delete Project', { template: 'page-builder' })

    const acquireResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))
    expect(acquireResponse.status).toBe(201)

    const deleteResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}`, {
      method: 'DELETE',
    }))

    expect(deleteResponse.status).toBe(409)
    expect(await deleteResponse.json()).toEqual({
      error: '该项目当前有其他编辑会话正在进行，请稍后再试',
    })
  })

  test('GET /api/page-builder/cms/catalogs returns normalized catalog data', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({
          username: 'test-user',
          password: 'test-pass',
        })
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogsTree?siteID=14&contentType=Image&keyword=%E9%A6%96%E9%A1%B5') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              ID: 100,
              parentID: 0,
              name: '首页',
              children: [
                {
                  ID: 101,
                  parentID: 100,
                  name: 'Banner',
                },
              ],
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 100,
              parentID: 0,
              path: 'home/',
              listLink: 'https://site14.example.com/home/list.shtml',
              name: '首页',
              logoFile: 'upload/resources/image/home.png',
              contentType: '',
              contentTypeName: '文章',
              childCount: 1,
              total: 12,
              siteID: 14,
            },
            {
              id: 101,
              parentID: 100,
              path: 'home/banner/',
              link: 'https://site14.example.com/home/banner/',
              name: 'Banner',
              logoFile: '/upload/resources/image/banner.png',
              contentType: 'Image',
              contentTypeName: '图片',
              hasChild: false,
              total: 3,
              siteID: 14,
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 14,
              name: '新闻站',
              url: 'https://site14.example.com/',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs?siteId=14&contentType=Image&searchKeyword=%E9%A6%96%E9%A1%B5'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      items: [
        {
          id: '100',
          name: '首页',
          parentId: null,
          path: 'https://site14.example.com/home/list.shtml',
          contentType: '',
          contentTypeName: '文章',
          logoUrl: 'https://site14.example.com/upload/resources/image/home.png',
          hasChild: true,
          total: 12,
          children: [],
        },
        {
          id: '101',
          name: 'Banner',
          parentId: '100',
          path: 'https://site14.example.com/home/banner/',
          contentType: 'Image',
          contentTypeName: '图片',
          logoUrl: 'https://site14.example.com/upload/resources/image/banner.png',
          hasChild: false,
          total: 3,
          children: [],
        },
      ],
      tree: [
        {
          id: '100',
          name: '首页',
          parentId: null,
          path: 'https://site14.example.com/home/list.shtml',
          contentType: '',
          contentTypeName: '文章',
          logoUrl: 'https://site14.example.com/upload/resources/image/home.png',
          hasChild: true,
          total: 12,
          children: [
            {
              id: '101',
              name: 'Banner',
              parentId: '100',
              path: 'https://site14.example.com/home/banner/',
              contentType: 'Image',
              contentTypeName: '图片',
              logoUrl: 'https://site14.example.com/upload/resources/image/banner.png',
              hasChild: false,
              total: 3,
              children: [],
            },
          ],
        },
      ],
    })
  })

  test('GET /api/page-builder/cms/catalogs supports ordered fixed ids without loading the full catalog tree', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&id=102&level=CurrentAndChild') {
        return new Response(JSON.stringify({
          status: 1,
          data: {
            id: 102,
            parentID: 0,
            path: 'brand/',
            name: '品牌素材',
            contentType: 'Image',
            contentTypeName: '图片',
            hasChild: false,
            total: 2,
          },
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&id=999&level=CurrentAndChild') {
        return new Response(JSON.stringify({
          status: 1,
          data: [],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&id=101&level=CurrentAndChild') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 101,
              parentID: 0,
              path: 'news/',
              name: '新闻中心',
              contentType: 'Article',
              contentTypeName: '文章',
              hasChild: false,
              total: 8,
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs?siteId=14&ids=102,999,101'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [
        {
          id: '102',
          name: '品牌素材',
          parentId: null,
          path: 'brand/',
          contentType: 'Image',
          contentTypeName: '图片',
          hasChild: false,
          total: 2,
          children: [],
        },
        {
          id: '101',
          name: '新闻中心',
          parentId: null,
          path: 'news/',
          contentType: 'Article',
          contentTypeName: '文章',
          hasChild: false,
          total: 8,
          children: [],
        },
      ],
      tree: [
        {
          id: '102',
          name: '品牌素材',
          parentId: null,
          path: 'brand/',
          contentType: 'Image',
          contentTypeName: '图片',
          hasChild: false,
          total: 2,
          children: [],
        },
        {
          id: '101',
          name: '新闻中心',
          parentId: null,
          path: 'news/',
          contentType: 'Article',
          contentTypeName: '文章',
          hasChild: false,
          total: 8,
          children: [],
        },
      ],
    })
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/catalogsTree'))).toBe(false)
  })

  test('GET /api/page-builder/cms/contents returns normalized content summaries', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs/101/contents?siteID=14&pageIndex=1&pageSize=10&loadextend=true') {
        return new Response(JSON.stringify({
          status: 1,
          data: {
            pageIndex: 1,
            pageSize: 10,
            total: 1,
            data: [
              {
                id: 501,
                catalogID: 101,
                title: '首页轮播图',
                summary: '三张首页图片',
                logoFile: 'preview/news/upload/resources/image/banner-list-logo.jpg',
                link: 'https://demo.zving.com/home/banner/501.html',
                publishUrl: 'https://legacy.example.com/home/banner/501.html',
                addTime: '2025-04-11 17:48:06',
              },
            ],
          },
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 14,
              name: '新闻站',
              url: 'https://site14.example.com/',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/contents?siteId=14&catalogId=101&pageIndex=1&pageSize=10'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      pageIndex: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      items: [
        {
          id: '501',
          catalogId: '101',
          title: '首页轮播图',
          summary: '三张首页图片',
          listLogoUrl: 'https://site14.example.com/preview/news/upload/resources/image/banner-list-logo.jpg',
          addedAt: '2025-04-11 17:48',
          publishUrl: 'https://demo.zving.com/home/banner/501.html',
        },
      ],
    })
  })

  test('GET /api/page-builder/cms/contents supports single-catalog fixed ids and drops invalid items', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs/101/contents?siteID=14&pageIndex=0&pageSize=100&loadextend=true') {
        return new Response(JSON.stringify({
          status: 1,
          data: {
            data: [
              {
                id: 501,
                catalogID: 101,
                title: '首页轮播图',
                summary: '三张首页图片',
                logoFile: 'preview/news/upload/resources/image/banner-list-logo.jpg',
                publishUrl: 'https://demo.zving.com/home/banner/501.html',
                addTime: '2025-04-11 17:48:06',
              },
              {
                id: 502,
                catalogID: 101,
                title: '品牌素材包',
                summary: '包含视频、音频和附件',
                url: 'https://demo.zving.com/home/banner/502.html',
                publishDate: '2025-04-12 10:08:00',
              },
            ],
            pageIndex: 0,
            pageSize: 100,
            total: 2,
          },
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 14,
              name: '新闻站',
              url: 'https://site14.example.com/',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/contents?siteId=14&catalogId=101&ids=502,999,501'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      pageIndex: 0,
      pageSize: 2,
      total: 2,
      totalPages: 1,
      items: [
        {
          id: '502',
          catalogId: '101',
          title: '品牌素材包',
          summary: '包含视频、音频和附件',
          addedAt: '2025-04-12 10:08',
          publishUrl: 'https://demo.zving.com/home/banner/502.html',
        },
        {
          id: '501',
          catalogId: '101',
          title: '首页轮播图',
          summary: '三张首页图片',
          listLogoUrl: 'https://site14.example.com/preview/news/upload/resources/image/banner-list-logo.jpg',
          addedAt: '2025-04-11 17:48',
          publishUrl: 'https://demo.zving.com/home/banner/501.html',
        },
      ],
    })
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/catalogs/101/contents'))).toHaveLength(1)
  })

  test('GET /api/page-builder/cms/catalogs/:catalogId returns normalized catalog detail', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 17765,
              innerCode: '002676000004',
              status: 20,
              name: '文章',
              alias: 'lbt_wz',
              contentType: 'Article',
              info: '栏目描述',
              logoFile: 'assets/images/addpicture.png',
              siteID: 14,
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 14,
              name: '新闻站',
              url: 'https://site14.example.com/',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs/17765?siteId=14'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      id: '17765',
      innerCode: '002676000004',
      statusCode: 20,
      statusLabel: '启用',
      name: '文章',
      alias: 'lbt_wz',
      contentType: 'Article',
      contentTypeName: '文章',
      description: '栏目描述',
      logoUrl: 'https://site14.example.com/assets/images/addpicture.png',
    })
  })

  test('GET /api/page-builder/cms/sites returns normalized site summaries', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(url).toBe('https://demo.zving.com/manager/api/sites')
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      return new Response(JSON.stringify({
        status: 1,
        data: [
          {
            id: 1,
            name: '主站',
            url: 'https://demo.zving.com',
            parentID: 0,
            branchInnerCode: '0001',
          },
          {
            id: 14,
            name: '新闻站',
            url: 'https://news.demo.zving.com',
            parentID: 1,
            branchInnerCode: '000114',
          },
        ],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/sites'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual([
      {
        id: '1',
        name: '主站',
        url: 'https://demo.zving.com',
        parentId: null,
        branchInnerCode: '0001',
      },
      {
        id: '14',
        name: '新闻站',
        url: 'https://news.demo.zving.com',
        parentId: '1',
        branchInnerCode: '000114',
      },
    ])
  })

  test('GET /api/page-builder/cms/catalogs defaults siteId to 1 when it is omitted', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(url).toBe('https://demo.zving.com/manager/api/catalogsTree?siteID=1')

      return new Response(JSON.stringify({
        status: 1,
        data: [],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [],
      tree: [],
    })
  })

  test('GET /api/page-builder/cms/assets proxies cms logo images without auth headers', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://demo.zving.com/manager/preview/news/upload/resources/image/banner-list-logo.jpg',
      )
      expect(init?.headers).toBeUndefined()

      return new Response('binary-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request(
      'http://localhost/api/page-builder/cms/assets?url=https%3A%2F%2Fdemo.zving.com%2Fmanager%2Fpreview%2Fnews%2Fupload%2Fresources%2Fimage%2Fbanner-list-logo.jpg',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe('binary-image')
  })

  test('GET /api/page-builder/cms/assets proxies same-origin root cms assets', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://demo.zving.com/assets/images/addpicture.png')
      expect(init?.headers).toBeUndefined()

      return new Response('root-binary-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request(
      'http://localhost/api/page-builder/cms/assets?url=https%3A%2F%2Fdemo.zving.com%2Fassets%2Fimages%2Faddpicture.png',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe('root-binary-image')
  })

  test('GET /api/page-builder/cms/catalogs returns 503 when cms host config is missing', async () => {
    delete process.env.PROMA_CMS_BASE_URL
    delete process.env.PROMA_CMS_USERNAME
    delete process.env.PROMA_CMS_PASSWORD

    const app = createApp()
    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs'))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'CMS 浏览暂不可用，请先完成宿主 CMS 配置',
    })
  })

  test('GET /api/page-builder/cms/contents returns 502 when the cms upstream fails', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      return new Response(JSON.stringify({
        status: 0,
        message: '上游接口不可用',
      }), {
        status: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/contents?catalogId=101'))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'CMS 请求失败：上游接口不可用',
    })
  })
})
