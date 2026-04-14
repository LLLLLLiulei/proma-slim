import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'

describe('cms rendering preview bootstrap', () => {
  test('unwraps cms islands so list semantics are preserved in preview DOM', () => {
    const packageDir = new URL('../../', import.meta.url)
    const bootstrapModuleUrl = new URL('./cms-rendering-preview-bootstrap.ts', import.meta.url).href
    const script = `
      import { parseHTML } from 'linkedom'

      const { document, window } = parseHTML(\`<!doctype html>
        <html>
          <body>
            <ul id="nav">
              <cms-catalog level="root">
                <template v-slot:default="{ items }">
                  <li v-for="item in items" :key="item.id" class="nav-item">{{ item.name }}</li>
                </template>
              </cms-catalog>
            </ul>
          </body>
        </html>\`)

      Object.assign(globalThis, {
        window,
        document,
        Node: window.Node,
        Element: window.Element,
        HTMLElement: window.HTMLElement,
        SVGElement: window.SVGElement,
        MutationObserver: window.MutationObserver,
        CustomEvent: window.CustomEvent,
        Event: window.Event,
        navigator: window.navigator,
        fetch: async (input) => {
          const url = new URL(String(input), 'https://example.com')
          if (url.pathname !== '/api/page-builder/cms/catalogs') {
            return new Response('not found', { status: 404 })
          }

          return new Response(JSON.stringify({
            items: [
              {
                id: 'catalog-1',
                name: '栏目 1',
                parentId: null,
                path: '/catalog-1',
                contentType: 'Article',
                contentTypeName: '文章',
                hasChild: false,
                total: 1,
                children: [],
              },
              {
                id: 'catalog-2',
                name: '栏目 2',
                parentId: null,
                path: '/catalog-2',
                contentType: 'Article',
                contentTypeName: '文章',
                hasChild: false,
                total: 1,
                children: [],
              },
            ],
            tree: [
              {
                id: 'catalog-1',
                name: '栏目 1',
                parentId: null,
                path: '/catalog-1',
                contentType: 'Article',
                contentTypeName: '文章',
                hasChild: false,
                total: 1,
                children: [],
              },
              {
                id: 'catalog-2',
                name: '栏目 2',
                parentId: null,
                path: '/catalog-2',
                contentType: 'Article',
                contentTypeName: '文章',
                hasChild: false,
                total: 1,
                children: [],
              },
            ],
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        },
      })

      window.__PROMA_CMS_RENDERING_PREVIEW__ = {
        workspaceId: 'workspace-1',
        cmsProxyBase: '/api/page-builder/cms',
        vueAssetUrl: '/api/page-builder/cms-rendering-vue.js',
        bootstrapAssetUrl: '/api/page-builder/cms-rendering-preview.js',
        hasCmsRendering: true,
      }

      await import(${JSON.stringify(bootstrapModuleUrl)})

      await new Promise((resolve) => {
        if (window.__PROMA_CMS_RENDERING_PREVIEW_READY__) {
          setTimeout(resolve, 0)
          return
        }

        document.addEventListener('proma:cms-rendering-ready', () => {
          setTimeout(resolve, 0)
        }, { once: true })
      })

      const list = document.querySelector('#nav')
      const islandRoots = Array.from(list?.children ?? []).map((child) => ({
        tagName: child.tagName.toLowerCase(),
        text: child.textContent?.trim() ?? null,
        islandId: child.getAttribute('data-proma-cms-island-id'),
        component: child.getAttribute('data-proma-cms-island-component'),
        sourceSelector: child.getAttribute('data-proma-cms-island-source-selector'),
        parentBlockSelector: child.getAttribute('data-proma-cms-island-parent-block-selector'),
        editBoundary: child.getAttribute('data-proma-cms-island-edit-boundary'),
      }))
      console.log(JSON.stringify({
        outerHTML: list?.outerHTML ?? null,
        firstChildTag: list?.firstElementChild?.tagName.toLowerCase() ?? null,
        hasWrapper: Boolean(list?.querySelector('[data-proma-cms-rendering-island]')),
        hasCmsHost: Boolean(list?.querySelector('cms-catalog, cms-content')),
        islandRoots,
      }))
    `

    const stdout = execFileSync(process.execPath, ['--eval', script], {
      cwd: packageDir,
      encoding: 'utf-8',
    }).trim()

    const result = JSON.parse(stdout) as {
      outerHTML: string | null
      firstChildTag: string | null
      hasWrapper: boolean
      hasCmsHost: boolean
      islandRoots: Array<{
        tagName: string
        text: string | null
        islandId: string | null
        component: string | null
        sourceSelector: string | null
        parentBlockSelector: string | null
        editBoundary: string | null
      }>
    }

    expect(result.hasWrapper).toBe(false)
    expect(result.hasCmsHost).toBe(false)
    expect(result.firstChildTag).toBe('li')
    expect(result.outerHTML).toContain('class="nav-item">栏目 1</li>')
    expect(result.outerHTML).toContain('class="nav-item">栏目 2</li>')
    expect(result.islandRoots).toEqual([
      {
        tagName: 'li',
        text: '栏目 1',
        islandId: expect.any(String),
        component: 'cms-catalog',
        sourceSelector: 'body > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
        parentBlockSelector: 'body > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
        editBoundary: 'source-atomic',
      },
      {
        tagName: 'li',
        text: '栏目 2',
        islandId: expect.any(String),
        component: 'cms-catalog',
        sourceSelector: 'body > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
        parentBlockSelector: 'body > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
        editBoundary: 'source-atomic',
      },
    ])
    expect(result.islandRoots[0]?.islandId).toBe(result.islandRoots[1]?.islandId)
  })
})
