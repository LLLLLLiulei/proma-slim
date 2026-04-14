import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createMockServerCmsClient } from '../runtime/server-cms-client'
import { toPositiveNumber } from '../runtime/view-models'
import { readDemoPage, listDemoPages } from '../shared/demo-pages'
import { exportOutputDir, previewBootstrapAssetPath } from '../shared/paths'
import { ensurePreviewBootstrapBundle } from './build-preview-bootstrap'
import { injectPreviewHtml } from './inject-preview-html'

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  })
}

function textResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function renderIndexPage(): string {
  const pages = listDemoPages()
  const items = pages
    .map((pageName) => {
      const exportPath = join(exportOutputDir, pageName)
      const exportLink = existsSync(exportPath)
        ? `<a href="/export/${pageName}">export</a>`
        : '<span class="muted">export unavailable</span>'

      return `<li>
        <strong>${pageName}</strong>
        <span class="links">
          <a href="/preview/${pageName}">preview</a>
          <a href="/author/${pageName}">author</a>
          <a href="/source/${pageName}">source</a>
          ${exportLink}
        </span>
      </li>`
    })
    .join('\n')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>CMS Vue Islands Demo</title>
      <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 40px; color: #1f2937; }
        ul { padding-left: 20px; }
        li { margin: 12px 0; }
        .links { margin-left: 12px; display: inline-flex; gap: 8px; }
        .muted { color: #6b7280; }
      </style>
    </head>
    <body>
      <h1>CMS Vue Islands Demo</h1>
      <p>Use preview to inspect CSR islands, author to view raw HTML, and export after running the export command.</p>
      <ul>${items}</ul>
    </body>
  </html>`
}

function getPageName(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) {
    return null
  }

  const pageName = basename(pathname.slice(prefix.length))
  if (!listDemoPages().includes(pageName)) {
    return null
  }

  return pageName
}

export function startPreviewServer(options?: { port?: number }) {
  const port = options?.port ?? 4311
  const cmsClient = createMockServerCmsClient()
  const demoPages = listDemoPages()
  const previewBootstrapBuild = ensurePreviewBootstrapBundle()

  return Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url)

      if (url.pathname === '/') {
        return htmlResponse(renderIndexPage())
      }

      if (url.pathname === '/assets/preview-bootstrap.js') {
        await previewBootstrapBuild

        return new Response(Bun.file(previewBootstrapAssetPath), {
          headers: {
            'content-type': 'text/javascript; charset=utf-8',
          },
        })
      }

      const previewPage = demoPages.includes(basename(url.pathname.slice('/preview/'.length)))
        ? basename(url.pathname.slice('/preview/'.length))
        : null
      if (previewPage) {
        const sourceHtml = readDemoPage(previewPage)
        return htmlResponse(injectPreviewHtml(sourceHtml, {
          pageName: previewPage,
          cmsApiBase: '/api/mock-cms',
          bootstrapAssetPath: '/assets/preview-bootstrap.js',
        }))
      }

      const authorPage = demoPages.includes(basename(url.pathname.slice('/author/'.length)))
        ? basename(url.pathname.slice('/author/'.length))
        : null
      if (authorPage) {
        return htmlResponse(readDemoPage(authorPage))
      }

      const sourcePage = demoPages.includes(basename(url.pathname.slice('/source/'.length)))
        ? basename(url.pathname.slice('/source/'.length))
        : null
      if (sourcePage) {
        return textResponse(readDemoPage(sourcePage))
      }

      const exportedPage = demoPages.includes(basename(url.pathname.slice('/export/'.length)))
        ? basename(url.pathname.slice('/export/'.length))
        : null
      if (exportedPage) {
        const exportedFilePath = join(exportOutputDir, exportedPage)
        if (!existsSync(exportedFilePath)) {
          return new Response('Export output not found. Run the export command first.', { status: 404 })
        }

        return htmlResponse(readFileSync(exportedFilePath, 'utf-8'))
      }

      if (url.pathname === '/api/mock-cms/catalogs') {
        return jsonResponse(await cmsClient.listCatalogs({
          level: url.searchParams.get('level') ?? undefined,
          parentId: url.searchParams.get('parentId') ?? undefined,
          contentType: url.searchParams.get('contentType') ?? undefined,
          searchKeyword: url.searchParams.get('searchKeyword') ?? undefined,
          take: toPositiveNumber(url.searchParams.get('take') ?? undefined),
        }))
      }

      if (url.pathname === '/api/mock-cms/contents') {
        const catalogId = url.searchParams.get('catalogId')
        if (!catalogId) {
          return new Response('Missing catalogId', { status: 400 })
        }

        return jsonResponse(await cmsClient.listContents({
          catalogId,
          contentSelectType: url.searchParams.get('contentSelectType') ?? undefined,
          keyword: url.searchParams.get('keyword') ?? undefined,
          title: url.searchParams.get('title') ?? undefined,
          pageIndex: toPositiveNumber(url.searchParams.get('pageIndex') ?? undefined),
          pageSize: toPositiveNumber(url.searchParams.get('pageSize') ?? undefined),
        }))
      }

      return new Response('Not Found', { status: 404 })
    },
  })
}
