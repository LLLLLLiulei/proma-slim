import { afterEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAgentWorkspace } from './workspace-service'

const originalFetch = globalThis.fetch

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
  globalThis.fetch = originalFetch
  mock.restore()
})

async function waitForTerminalJob(
  service: {
    getJob: (workspaceId: string, jobId: string) => { status: string } | null
  },
  workspaceId: string,
  jobId: string,
): Promise<{ status: string; errorMessage?: string | null }> {
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
  test('retries remote resources up to three times before succeeding', async () => {
    const workspace = createAgentWorkspace('Static Export Retry Success', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="https://cdn.example.com/retry-success.png"></body></html>',
      'utf-8',
    )

    let attempts = 0
    const fetchMock = mock(async () => {
      attempts += 1
      if (attempts <= 3) {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        throw error
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
      randomUUID: () => 'job-retry-success',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  test('localizes supported remote assets, uses the CMS gateway, and records warnings plus unsupported runtime dependencies', async () => {
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

  test('surfaces a Chinese timeout error after exhausting three retries for a remote resource', async () => {
    const workspace = createAgentWorkspace('Static Export Timeout Failure', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="https://cdn.example.com/timeout.png"></body></html>',
      'utf-8',
    )

    const fetchMock = mock(async () => {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      throw error
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const {
      PageBuilderStaticExportService,
    } = await import('./page-builder-static-export-service')
    const service = new PageBuilderStaticExportService({
      fetchFn: fetchMock as unknown as typeof fetch,
      randomUUID: () => 'job-timeout-failure',
    })

    const createdJob = service.createJob(workspace)
    const finishedJob = await waitForTerminalJob(service, workspace.id, createdJob.jobId)

    expect(finishedJob.status).toBe('failed')
    expect(finishedJob.errorMessage).toContain('远程资源下载超时')
    expect(finishedJob.errorMessage).toContain('单次超时 30 秒')
    expect(finishedJob.errorMessage).toContain('已重试3次')
    expect(finishedJob.errorMessage).toContain('https://cdn.example.com/timeout.png')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  test('rejects high-risk private-network targets before performing the fetch', async () => {
    const workspace = createAgentWorkspace('Static Export Private Target', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="http://127.0.0.1/internal.png"></body></html>',
      'utf-8',
    )

    const fetchMock = mock(async () => new Response('should-not-run', { status: 200 }))
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

    expect(finishedJob.status).toBe('failed')
    expect(finishedJob.errorMessage).toContain('高风险')
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })
})
