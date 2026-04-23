import { afterEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAgentWorkspace } from './workspace-service'

const originalFetch = globalThis.fetch
const CMS_ENV_KEYS = [
  'PROMA_CMS_BASE_URL',
  'PROMA_CMS_SITE_ID',
  'PROMA_CMS_USERNAME',
  'PROMA_CMS_PASSWORD',
] as const

const originalCmsEnv = {
  PROMA_CMS_BASE_URL: process.env.PROMA_CMS_BASE_URL,
  PROMA_CMS_SITE_ID: process.env.PROMA_CMS_SITE_ID,
  PROMA_CMS_USERNAME: process.env.PROMA_CMS_USERNAME,
  PROMA_CMS_PASSWORD: process.env.PROMA_CMS_PASSWORD,
}

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
  globalThis.fetch = originalFetch
  mock.restore()

  for (const key of CMS_ENV_KEYS) {
    const value = originalCmsEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

async function waitForTerminalJob(
  service: {
    getJob: (workspaceId: string, jobId: string) => { status: string } | null
  },
  workspaceId: string,
  jobId: string,
): Promise<{
  status: string
  errorMessage?: string | null
  failure?: {
    code: string
    message: string
    component?: string
    props?: Record<string, string>
  } | null
}> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = service.getJob(workspaceId, jobId)
    if (job && (job.status === 'completed' || job.status === 'failed')) {
      return job as { status: string; errorMessage?: string | null }
    }

    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  throw new Error(`等待导出任务超时: ${jobId}`)
}

describe('page-builder static export service', () => {
  test('fetches remote resources without injecting timeout signals or manual redirect handling', async () => {
    const workspace = createAgentWorkspace('Static Export Direct Fetch', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="https://cdn.example.com/direct-fetch.png"></body></html>',
      'utf-8',
    )

    let requestInit: RequestInit | undefined
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init
      return new Response('ok', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const service = new PageBuilderStaticExportService({
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-direct-fetch',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestInit?.method).toBe('GET')
    expect(requestInit?.signal).toBeUndefined()
    expect(requestInit?.redirect).toBeUndefined()
  })

  test('localizes supported remote assets, uses the CMS gateway, and records warnings plus unsupported runtime dependencies', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const workspace = createAgentWorkspace('Static Export Success', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      `<!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="./assets/site.css">
          <link rel="stylesheet" href="https://cdn.example.com/theme.css">
        </head>
        <body>
          <img src="https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner.jpg" alt="banner">
          <div class="hero" style="background-image:url('https://cdn.example.com/bg.jpg')"></div>
          <a href="https://cdn.example.com/manual.pdf">下载手册</a>
          <script src="https://cdn.example.com/runtime.js"></script>
        </body>
      </html>`,
      'utf-8',
    )
    writeFileSync(
      join(workspaceFilesDir, 'assets', 'site.css'),
      'body { background-image: url("https://cdn.example.com/pattern.png"); } .logo { background-image: url("./logo.png"); }',
      'utf-8',
    )
    writeFileSync(join(workspaceFilesDir, 'assets', 'logo.png'), 'local-logo', 'utf-8')

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://cdn.example.com/theme.css') {
        return new Response(
          '@font-face { font-family: test; src: url("./font.woff2"); } .hero { background-image: url("https://cdn.example.com/hero-bg.jpg"); }',
          {
            status: 200,
            headers: {
              'content-type': 'text/css; charset=utf-8',
            },
          },
        )
      }

      if (url === 'https://cdn.example.com/font.woff2') {
        return new Response('font-data', {
          status: 200,
          headers: {
            'content-type': 'font/woff2',
          },
        })
      }

      if (url === 'https://cdn.example.com/hero-bg.jpg' || url === 'https://cdn.example.com/bg.jpg' || url === 'https://cdn.example.com/pattern.png') {
        return new Response(`asset:${url}`, {
          status: 200,
          headers: {
            'content-type': 'image/png',
          },
        })
      }

      if (url === 'https://cdn.example.com/manual.pdf') {
        return new Response('missing', { status: 404 })
      }

      throw new Error(`未预期的远程请求: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const fetchAsset = mock(async (assetUrl: string) => {
      expect(assetUrl).toBe('https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner.jpg')
      return new Response('cms-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const {
      getPageBuilderStaticExportReportPath,
      getPageBuilderStaticExportStagingDir,
    } = await import('./page-builder-static-export-paths')

    const service = new PageBuilderStaticExportService({
      cmsGatewayFactory: () => ({ fetchAsset }),
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-success',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')

    const report = JSON.parse(readFileSync(getPageBuilderStaticExportReportPath(createdJob.jobId), 'utf-8')) as {
      summary: {
        localizedResourceCount: number
        warningCount: number
        unsupportedRuntimeDependencyCount: number
        hasWarnings: boolean
      }
      warnings: Array<{ code: string; resourceUrl?: string }>
      unsupportedRuntimeDependencies: Array<{ tagName: string; url: string }>
    }
    const stagedHtml = readFileSync(join(getPageBuilderStaticExportStagingDir(createdJob.jobId), 'index.html'), 'utf-8')
    const stagedCss = readFileSync(join(getPageBuilderStaticExportStagingDir(createdJob.jobId), 'assets', 'site.css'), 'utf-8')

    expect(report.summary.localizedResourceCount).toBeGreaterThanOrEqual(5)
    expect(report.summary.warningCount).toBe(1)
    expect(report.summary.unsupportedRuntimeDependencyCount).toBe(1)
    expect(report.summary.hasWarnings).toBe(true)
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: 'attachment-download-failed',
      resourceUrl: 'https://cdn.example.com/manual.pdf',
    }))
    expect(report.unsupportedRuntimeDependencies).toContainEqual(expect.objectContaining({
      tagName: 'script',
      url: 'https://cdn.example.com/runtime.js',
    }))

    expect(stagedHtml).not.toContain('https://cdn.example.com/theme.css')
    expect(stagedHtml).not.toContain('https://cdn.example.com/bg.jpg')
    expect(stagedHtml).not.toContain('https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner.jpg')
    expect(stagedHtml).toContain('https://cdn.example.com/manual.pdf')
    expect(stagedHtml).toContain('https://cdn.example.com/runtime.js')
    expect(stagedCss).not.toContain('https://cdn.example.com/pattern.png')
    expect(stagedCss).toContain('./logo.png')
    expect(existsSync(join(getPageBuilderStaticExportStagingDir(createdJob.jobId), 'export-report.json'))).toBe(true)

    expect(fetchAsset).toHaveBeenCalledTimes(1)
  })

  test('localizes root-relative /assets cms resources through the cms gateway', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const workspace = createAgentWorkspace('Static Export CMS Root Assets', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="/assets/images/addpicture.png" alt="cms-root-asset"></body></html>',
      'utf-8',
    )

    const fetchAsset = mock(async (assetUrl: string) => {
      expect(assetUrl).toBe('https://demo.zving.com/assets/images/addpicture.png')
      return new Response('cms-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const {
      getPageBuilderStaticExportStagingDir,
    } = await import('./page-builder-static-export-paths')

    const service = new PageBuilderStaticExportService({
      cmsGatewayFactory: () => ({ fetchAsset }),
      fetchFn: mock(async () => {
        throw new Error('unexpected remote fetch')
      }) as unknown as typeof fetch,
      randomUUID: () => 'job-cms-root-assets',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')
    const stagedHtml = readFileSync(join(getPageBuilderStaticExportStagingDir(createdJob.jobId), 'index.html'), 'utf-8')
    expect(stagedHtml).not.toContain('/assets/images/addpicture.png')
    expect(fetchAsset).toHaveBeenCalledTimes(1)
  })

  test('skips cms remote assets when downloadCmsRemoteAssets is false and preserves cms source urls', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const workspace = createAgentWorkspace('Static Export Skip CMS Assets', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const proxyCmsUrl = 'https://demo.zving.com/upload/resources/image/proxy-banner.png'

    mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      `<!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="./assets/site.css">
          <link rel="stylesheet" href="https://demo.zving.com/assets/cms-theme.css">
        </head>
        <body>
          <img src="https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner.jpg" alt="cms-absolute">
          <img src="/assets/images/addpicture.png" alt="cms-root-relative">
          <img src="/api/page-builder/cms/assets?url=${encodeURIComponent(proxyCmsUrl)}" alt="cms-proxy">
          <img src="https://cdn.example.com/keep-me.png" alt="remote">
          <div class="hero" style="background-image:url('/upload/resources/image/inline.png')"></div>
          <a id="content-link" href="https://demo.zving.com/news/article-1.html">查看详情</a>
          <a id="attachment-link" href="https://demo.zving.com/upload/resources/file/manual.pdf">下载手册</a>
        </body>
      </html>`,
      'utf-8',
    )
    writeFileSync(
      join(workspaceFilesDir, 'assets', 'site.css'),
      'body { background-image: url("https://cdn.example.com/pattern.png"); } .hero { background-image: url("/upload/resources/image/inline-css.png"); }',
      'utf-8',
    )

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://cdn.example.com/keep-me.png' || url === 'https://cdn.example.com/pattern.png') {
        return new Response(`asset:${url}`, {
          status: 200,
          headers: {
            'content-type': 'image/png',
          },
        })
      }

      throw new Error(`未预期的远程请求: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const fetchAsset = mock(async () => {
      throw new Error('downloadCmsRemoteAssets=false 时不应通过 cms gateway 拉取资源')
    })

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const {
      getPageBuilderStaticExportReportPath,
      getPageBuilderStaticExportStagingDir,
    } = await import('./page-builder-static-export-paths')

    const service = new PageBuilderStaticExportService({
      cmsGatewayFactory: () => ({ fetchAsset }),
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-skip-cms-assets',
    })

    const createdJob = service.createJob(workspace, {
      downloadCmsRemoteAssets: false,
    })
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')

    const stagedHtml = readFileSync(join(getPageBuilderStaticExportStagingDir(createdJob.jobId), 'index.html'), 'utf-8')
    const stagedCss = readFileSync(join(getPageBuilderStaticExportStagingDir(createdJob.jobId), 'assets', 'site.css'), 'utf-8')
    const report = JSON.parse(readFileSync(getPageBuilderStaticExportReportPath(createdJob.jobId), 'utf-8')) as {
      summary: {
        localizedResourceCount: number
        warningCount: number
        hasWarnings: boolean
      }
      localizedResources: Array<{ resourceUrl: string; via: string }>
      retainedExternalLinks: Array<{ resourceUrl: string; reason: string }>
      warnings: Array<{ code: string; resourceUrl?: string }>
    }

    expect(stagedHtml).toContain('https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner.jpg')
    expect(stagedHtml).toContain('https://demo.zving.com/assets/images/addpicture.png')
    expect(stagedHtml).toContain(proxyCmsUrl)
    expect(stagedHtml).toContain('https://demo.zving.com/assets/cms-theme.css')
    expect(stagedHtml).toContain('https://demo.zving.com/upload/resources/file/manual.pdf')
    expect(stagedHtml).toContain('https://demo.zving.com/news/article-1.html')
    expect(stagedHtml).not.toContain('/api/page-builder/cms/assets?url=')
    expect(stagedHtml).not.toContain('https://cdn.example.com/keep-me.png')

    expect(stagedCss).toContain('https://demo.zving.com/manager/upload/resources/image/inline-css.png')
    expect(stagedCss).not.toContain('https://cdn.example.com/pattern.png')

    expect(report.summary.localizedResourceCount).toBe(2)
    expect(report.summary.warningCount).toBeGreaterThanOrEqual(1)
    expect(report.summary.hasWarnings).toBe(true)
    expect(report.localizedResources).not.toContainEqual(expect.objectContaining({
      resourceUrl: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner.jpg',
      via: 'cms',
    }))
    expect(report.retainedExternalLinks).toContainEqual({
      resourceUrl: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner.jpg',
      reason: 'cms-remote-asset-skipped',
    })
    expect(report.retainedExternalLinks).toContainEqual({
      resourceUrl: 'https://demo.zving.com/upload/resources/file/manual.pdf',
      reason: 'cms-remote-asset-skipped',
    })
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: 'cms-remote-asset-skipped',
      resourceUrl: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner.jpg',
    }))
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: 'cms-remote-asset-skipped',
      resourceUrl: 'https://demo.zving.com/upload/resources/file/manual.pdf',
    }))
    expect(report.warnings).not.toContainEqual(expect.objectContaining({
      resourceUrl: 'https://demo.zving.com/news/article-1.html',
    }))

    expect(fetchAsset).toHaveBeenCalledTimes(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('does not treat non-cms upload resources urls as cms assets when cms export is disabled', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const workspace = createAgentWorkspace('Static Export Non CMS Upload Resources', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const remoteLookalikeUrl = 'https://cdn.example.com/upload/resources/image/not-cms-banner.png'

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      `<!doctype html><html><body><img src="${remoteLookalikeUrl}" alt="remote-lookalike"></body></html>`,
      'utf-8',
    )

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === remoteLookalikeUrl) {
        return new Response(`asset:${url}`, {
          status: 200,
          headers: {
            'content-type': 'image/png',
          },
        })
      }

      throw new Error(`未预期的远程请求: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const fetchAsset = mock(async () => {
      throw new Error('非 CMS 远程资源不应通过 cms gateway 拉取')
    })

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const {
      getPageBuilderStaticExportReportPath,
      getPageBuilderStaticExportStagingDir,
    } = await import('./page-builder-static-export-paths')

    const service = new PageBuilderStaticExportService({
      cmsGatewayFactory: () => ({ fetchAsset }),
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-non-cms-upload-resources',
    })

    const createdJob = service.createJob(workspace, {
      downloadCmsRemoteAssets: false,
    })
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')

    const stagedHtml = readFileSync(join(getPageBuilderStaticExportStagingDir(createdJob.jobId), 'index.html'), 'utf-8')
    const report = JSON.parse(readFileSync(getPageBuilderStaticExportReportPath(createdJob.jobId), 'utf-8')) as {
      localizedResources: Array<{ resourceUrl: string; via: string }>
      retainedExternalLinks: Array<{ resourceUrl: string; reason: string }>
      warnings: Array<{ code: string; resourceUrl?: string }>
    }

    expect(stagedHtml).not.toContain(remoteLookalikeUrl)
    expect(report.localizedResources).toContainEqual(expect.objectContaining({
      resourceUrl: remoteLookalikeUrl,
      via: 'remote',
    }))
    expect(report.retainedExternalLinks).not.toContainEqual(expect.objectContaining({
      resourceUrl: remoteLookalikeUrl,
      reason: 'cms-remote-asset-skipped',
    }))
    expect(report.warnings).not.toContainEqual(expect.objectContaining({
      code: 'cms-remote-asset-skipped',
      resourceUrl: remoteLookalikeUrl,
    }))

    expect(fetchAsset).toHaveBeenCalledTimes(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('renders CMS islands before resource localization so SSR-generated cms image urls are exported', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://cms.example.com/manager/'
    process.env.PROMA_CMS_SITE_ID = '14'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const workspace = createAgentWorkspace('Static Export CMS Islands', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      `<!doctype html>
      <html>
        <body>
          <section>
            <cms-content site-id="14" catalog-id="news" page-index="0" page-size="1">
              <template v-slot:default="{ items }">
                <article>
                  <img :src="items[0]?.listLogoUrl" alt="banner">
                  <h2>{{ items[0]?.title }}</h2>
                </article>
              </template>
            </cms-content>
          </section>
        </body>
      </html>`,
      'utf-8',
    )

    const fetchAsset = mock(async (assetUrl: string) => {
      expect(assetUrl).toBe('https://cms.example.com/upload/resources/image/banner.jpg')
      return new Response('cms-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const {
      getPageBuilderStaticExportReportPath,
      getPageBuilderStaticExportStagingDir,
    } = await import('./page-builder-static-export-paths')

    const service = new PageBuilderStaticExportService({
      cmsGatewayFactory: () => ({
        fetchAsset,
      }),
      cmsQueryAdapterFactory: () => ({
        async listCatalogs() {
          return {
            items: [],
            tree: [],
          }
        },
        async listContents(query) {
          expect(query).toMatchObject({
            siteId: '14',
            catalogId: 'news',
            pageIndex: 0,
            pageSize: 1,
          })
          return {
            pageIndex: 0,
            pageSize: 1,
            total: 1,
            totalPages: 1,
            items: [
              {
                id: 'content-1',
                catalogId: 'news',
                title: 'Launch Update',
                summary: 'Quarterly launch update',
                publishUrl: 'https://example.com/news/launch-update',
                listLogoUrl: 'https://cms.example.com/upload/resources/image/banner.jpg',
              },
            ],
          }
        },
      }),
      randomUUID: () => 'job-cms-islands-success',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')

    const stagedHtml = readFileSync(join(getPageBuilderStaticExportStagingDir(createdJob.jobId), 'index.html'), 'utf-8')
    const report = JSON.parse(readFileSync(getPageBuilderStaticExportReportPath(createdJob.jobId), 'utf-8')) as {
      localizedResources: Array<{ resourceUrl: string; via: string }>
    }

    expect(stagedHtml).toContain('Launch Update')
    expect(stagedHtml).not.toContain('<cms-content')
    expect(stagedHtml).not.toContain('https://cms.example.com/upload/resources/image/banner.jpg')
    expect(report.localizedResources).toContainEqual(expect.objectContaining({
      resourceUrl: 'https://cms.example.com/upload/resources/image/banner.jpg',
      via: 'cms',
    }))
    expect(fetchAsset).toHaveBeenCalledTimes(1)
  })

  test('renders fixed-id CMS islands in order and falls back to empty when all ids are invalid', async () => {
    const workspace = createAgentWorkspace('Static Export CMS Fixed Ids', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      `<!doctype html>
      <html>
        <body>
          <section id="ordered">
            <cms-content site-id="14" catalog-id="news" ids="content-2,content-1">
              <template v-slot:default="{ items }">
                <ul>
                  <li v-for="item in items" :key="item.id">{{ item.title }}</li>
                </ul>
              </template>
              <template v-slot:empty>
                <p>ordered-empty</p>
              </template>
            </cms-content>
          </section>
          <section id="empty">
            <cms-content site-id="14" catalog-id="news" ids="missing-1,missing-2">
              <template v-slot:default="{ items }">
                <ul>
                  <li v-for="item in items" :key="item.id">{{ item.title }}</li>
                </ul>
              </template>
              <template v-slot:empty>
                <p>all-invalid-empty</p>
              </template>
            </cms-content>
          </section>
        </body>
      </html>`,
      'utf-8',
    )

    const contentQueries: Array<Record<string, unknown>> = []

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const {
      getPageBuilderStaticExportStagingDir,
    } = await import('./page-builder-static-export-paths')

    const service = new PageBuilderStaticExportService({
      cmsGatewayFactory: () => ({
        async fetchAsset() {
          throw new Error('fetchAsset should not be called for fixed-id text-only export')
        },
      }),
      cmsQueryAdapterFactory: () => ({
        async listCatalogs() {
          return {
            items: [],
            tree: [],
          }
        },
        async listContents(query) {
          contentQueries.push(query as Record<string, unknown>)
          if (query.ids?.includes('missing-1')) {
            return {
              pageIndex: 0,
              pageSize: 0,
              total: 0,
              totalPages: 1,
              items: [],
            }
          }

          return {
            pageIndex: 0,
            pageSize: 2,
            total: 2,
            totalPages: 1,
            items: [
              {
                id: 'content-2',
                catalogId: 'news',
                title: '第二条',
                summary: '第二条摘要',
                publishUrl: 'https://example.com/news/2',
              },
              {
                id: 'content-1',
                catalogId: 'news',
                title: '第一条',
                summary: '第一条摘要',
                publishUrl: 'https://example.com/news/1',
              },
            ],
          }
        },
      }),
      randomUUID: () => 'job-cms-fixed-ids-success',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')

    const stagedHtml = readFileSync(join(getPageBuilderStaticExportStagingDir(createdJob.jobId), 'index.html'), 'utf-8')

    expect(stagedHtml).toContain('第二条')
    expect(stagedHtml).toContain('第一条')
    expect(stagedHtml.indexOf('第二条')).toBeLessThan(stagedHtml.indexOf('第一条'))
    expect(stagedHtml).toContain('all-invalid-empty')
    expect(stagedHtml).not.toContain('<cms-content')
    expect(contentQueries).toEqual([
      { siteId: '14', catalogId: 'news', ids: ['content-2', 'content-1'] },
      { siteId: '14', catalogId: 'news', ids: ['missing-1', 'missing-2'] },
    ])
  })

  test('fails export with a structured CMS island failure when island prefetch fails', async () => {
    const workspace = createAgentWorkspace('Static Export CMS Islands Failure', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      `<!doctype html>
      <html>
        <body>
          <cms-content catalog-id="broken" page-size="1">
            <template v-slot:default="{ items }">
              <article>{{ items[0]?.title }}</article>
            </template>
          </cms-content>
        </body>
      </html>`,
      'utf-8',
    )

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const {
      getPageBuilderStaticExportReportPath,
    } = await import('./page-builder-static-export-paths')

    const service = new PageBuilderStaticExportService({
      cmsGatewayFactory: () => ({
        async fetchAsset() {
          throw new Error('fetchAsset should not be called')
        },
      }),
      cmsQueryAdapterFactory: () => ({
        async listCatalogs() {
          return {
            items: [],
            tree: [],
          }
        },
        async listContents() {
          throw new Error('upstream unavailable')
        },
      }),
      randomUUID: () => 'job-cms-islands-failure',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('failed')
    expect(finishedJob.errorMessage).toContain('upstream unavailable')
    expect(finishedJob.failure).toEqual(expect.objectContaining({
      code: 'cms-island-prefetch-failed',
      component: 'cms-content',
      props: {
        catalogId: 'broken',
        pageSize: '1',
      },
      message: 'upstream unavailable',
    }))

    const report = JSON.parse(readFileSync(getPageBuilderStaticExportReportPath(createdJob.jobId), 'utf-8')) as {
      failures: Array<{
        code: string
        message: string
        component?: string
        props?: Record<string, string>
      }>
      summary: {
        failureCount: number
      }
    }

    expect(report.summary.failureCount).toBe(1)
    expect(report.failures).toHaveLength(1)
    expect(report.failures).toContainEqual(expect.objectContaining({
      code: 'cms-island-prefetch-failed',
      component: 'cms-content',
      props: {
        catalogId: 'broken',
        pageSize: '1',
      },
      message: 'upstream unavailable',
    }))
  })

  test('uses the workspace name and export timestamp for the downloaded archive file name', async () => {
    const {
      buildPageBuilderStaticExportDownloadFileName,
    } = await import('./page-builder-static-export-service')

    expect(
      buildPageBuilderStaticExportDownloadFileName('Landing Page Export', new Date(2026, 3, 7, 15, 30, 45).getTime()),
    ).toBe('Landing Page Export-20260407153045.zip')
  })

  test('fails the job when a critical rendering resource cannot be localized', async () => {
    const workspace = createAgentWorkspace('Static Export Failure', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="https://cdn.example.com/hero.png"></body></html>',
      'utf-8',
    )

    const fetchMock = mock(async () => new Response('not-found', { status: 404 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const service = new PageBuilderStaticExportService({
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-critical-failure',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('failed')
    expect(finishedJob.errorMessage).toContain('hero.png')
  })

  test('allows remote resources whose combined size exceeds the previous total budget', async () => {
    const workspace = createAgentWorkspace('Static Export Large Total Budget', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const resourceUrls = Array.from({ length: 5 }, (_, index) => `https://cdn.example.com/large-${index + 1}.png`)

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      `<!doctype html><html><body>${resourceUrls.map((url) => `<img src="${url}">`).join('')}</body></html>`,
      'utf-8',
    )

    const largeAsset = new Uint8Array(13 * 1024 * 1024)
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!resourceUrls.includes(url)) {
        throw new Error(`未预期的远程请求: ${url}`)
      }

      return new Response(largeAsset, {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const service = new PageBuilderStaticExportService({
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-large-total-budget',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledTimes(resourceUrls.length)
  })

  test('allows a single remote resource larger than the previous per-file limit', async () => {
    const workspace = createAgentWorkspace('Static Export Large Single Resource', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="https://cdn.example.com/oversized.png"></body></html>',
      'utf-8',
    )

    const largeAsset = new Uint8Array(17 * 1024 * 1024)
    const fetchMock = mock(async () => {
      return new Response(largeAsset, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(largeAsset.byteLength),
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const service = new PageBuilderStaticExportService({
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-large-single-resource',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('fails immediately on a remote fetch error without automatic retries', async () => {
    const workspace = createAgentWorkspace('Static Export No Retry Failure', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="https://cdn.example.com/no-retry.png"></body></html>',
      'utf-8',
    )

    const fetchMock = mock(async () => {
      throw new Error('network down')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const service = new PageBuilderStaticExportService({
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-no-retry-failure',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('failed')
    expect(finishedJob.errorMessage).toContain('network down')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('allows more remote resources than the previous count limit', async () => {
    const workspace = createAgentWorkspace('Static Export Many Resources', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const resourceUrls = Array.from({ length: 129 }, (_, index) => `https://cdn.example.com/many-${index + 1}.png`)

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      `<!doctype html><html><body>${resourceUrls.map((url) => `<img src="${url}">`).join('')}</body></html>`,
      'utf-8',
    )

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!resourceUrls.includes(url)) {
        throw new Error(`未预期的远程请求: ${url}`)
      }

      return new Response('ok', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const service = new PageBuilderStaticExportService({
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-many-resources',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledTimes(resourceUrls.length)
  })

  test('allows private-network targets when the fetch succeeds', async () => {
    const workspace = createAgentWorkspace('Static Export Private Target', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="http://127.0.0.1/internal.png"><img src="http://192.168.1.2/banner.png"></body></html>',
      'utf-8',
    )

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url !== 'http://127.0.0.1/internal.png' && url !== 'http://192.168.1.2/banner.png') {
        throw new Error(`未预期的远程请求: ${url}`)
      }

      return new Response('ok', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const service = new PageBuilderStaticExportService({
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-private-target',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
