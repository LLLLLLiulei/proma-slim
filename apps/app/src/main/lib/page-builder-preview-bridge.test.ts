import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseHTML } from 'linkedom'
import {
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@proma/shared'
import { resolveOverlayBorder } from './page-builder-preview-bridge/overlays'
import { shouldSyncFromMutations } from './page-builder-preview-bridge/shared'

async function importPreviewBridgeModule() {
  const url = new URL(`./page-builder-preview-bridge.ts?test=${Date.now()}-${Math.random()}`, import.meta.url)
  return import(url.href)
}

afterEach(() => {
  delete process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH
  delete process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_ENTRY_PATH
  delete process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE_ROOT
})

function setupPreviewBridgeDom(
  html: string,
  options?: {
    cmsRendering?: boolean
    cmsRenderingReady?: boolean
    readyState?: 'loading' | 'complete'
  },
) {
  const { document, window } = parseHTML(html)
  const parentMessages: unknown[] = []
  const parentWindow = {
    postMessage(message: unknown) {
      parentMessages.push(message)
    },
  }

  Object.assign(globalThis, {
    window,
    document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    MutationObserver: undefined,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
  })

  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: parentWindow,
  })
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1440,
  })
  Object.defineProperty(window, 'MutationObserver', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(window, 'setInterval', {
    configurable: true,
    value: () => 1,
  })
  Object.defineProperty(window, 'clearInterval', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(window, 'getSelection', {
    configurable: true,
    value: () => ({
      removeAllRanges() {},
      addRange() {},
    }),
  })
  Object.defineProperty(document, 'createRange', {
    configurable: true,
    value: () => ({
      selectNodeContents() {},
      collapse() {},
    }),
  })
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: options?.readyState ?? 'complete',
  })

  if (options?.cmsRendering) {
    Object.defineProperty(window, '__PROMA_CMS_RENDERING_PREVIEW__', {
      configurable: true,
      value: {
        hasCmsRendering: true,
      },
    })
  }

  if (typeof options?.cmsRenderingReady === 'boolean') {
    Object.defineProperty(window, '__PROMA_CMS_RENDERING_PREVIEW_READY__', {
      configurable: true,
      value: options.cmsRenderingReady,
    })
  }

  return {
    document,
    window,
    parentMessages,
    parentWindow,
  }
}

function dispatchSelectionMode(
  window: Window,
  parentWindow: unknown,
  options?: {
    enabled?: boolean
    locked?: boolean
    showCmsIslandOutlines?: boolean
  },
) {
  const selectionModeEvent = new (window as Window & typeof globalThis & { Event: typeof Event }).Event('message')
  Object.assign(selectionModeEvent, {
    source: parentWindow,
    data: {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: options?.enabled ?? true,
      locked: options?.locked ?? false,
      showCmsIslandOutlines: options?.showCmsIslandOutlines ?? false,
    },
  })
  window.dispatchEvent(selectionModeEvent)
}

function setElementRect(
  element: Element,
  rect: {
    top: number
    left: number
    right: number
    bottom: number
    width: number
    height: number
  },
) {
  ;(element as Element & { getBoundingClientRect(): DOMRect }).getBoundingClientRect = () => rect as DOMRect
}

test('page-builder preview bridge reads the latest script content and asset version without restarting', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'proma-preview-bridge-'))
  const bridgePath = join(tempDir, 'page-builder-preview-bridge.js')

  try {
    writeFileSync(bridgePath, 'console.info("bridge-version-a")', 'utf-8')
    process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH = bridgePath

    const module = await importPreviewBridgeModule()

    const firstScript = await module.readPageBuilderPreviewBridgeScript()
    const firstAssetUrl = module.getPageBuilderPreviewBridgeAssetUrl()

    writeFileSync(bridgePath, 'console.info("bridge-version-b")', 'utf-8')

    const secondScript = await module.readPageBuilderPreviewBridgeScript()
    const secondAssetUrl = module.getPageBuilderPreviewBridgeAssetUrl()

    expect(firstScript).toContain('bridge-version-a')
    expect(firstScript).not.toContain('bridge-version-b')
    expect(secondScript).toContain('bridge-version-b')
    expect(secondScript).not.toContain('bridge-version-a')
    expect(secondAssetUrl).not.toBe(firstAssetUrl)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('page-builder preview bridge builds a single asset from a modular source entry and tracks dependency changes', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'proma-preview-bridge-entry-'))
  const entryPath = join(tempDir, 'entry.ts')
  const sharedPath = join(tempDir, 'shared.ts')

  try {
    writeFileSync(sharedPath, 'export const bridgeVersion = "bridge-version-a"\n', 'utf-8')
    writeFileSync(
      entryPath,
      `
        import { bridgeVersion } from './shared'

        ;(() => {
          console.info(bridgeVersion)
          console.info('__PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE__')
          console.info('__PAGE_BUILDER_PREVIEW_PARENT_SOURCE__')
        })()
      `,
      'utf-8',
    )

    process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_ENTRY_PATH = entryPath
    process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE_ROOT = tempDir

    const module = await importPreviewBridgeModule()

    const firstScript = await module.readPageBuilderPreviewBridgeScript()
    const firstAssetUrl = module.getPageBuilderPreviewBridgeAssetUrl()

    writeFileSync(sharedPath, 'export const bridgeVersion = "bridge-version-b"\n', 'utf-8')

    const secondScript = await module.readPageBuilderPreviewBridgeScript()
    const secondAssetUrl = module.getPageBuilderPreviewBridgeAssetUrl()

    expect(firstScript).toContain('bridge-version-a')
    expect(firstScript).not.toContain('bridge-version-b')
    expect(firstScript).not.toContain("from './shared'")
    expect(firstScript).toContain('page-builder-preview-bridge')
    expect(firstScript).toContain('page-builder-preview-parent')
    expect(secondScript).toContain('bridge-version-b')
    expect(secondAssetUrl).not.toBe(firstAssetUrl)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('page-builder preview bridge filters mutation observer events triggered only by overlays', () => {
  const { document, window } = parseHTML('<!doctype html><html><body><div id="content"></div></body></html>')
  Object.assign(globalThis, {
    Element: window.Element,
  })

  const overlay = document.createElement('div')
  overlay.setAttribute('data-page-builder-preview-overlay', 'selected')
  const content = document.querySelector('#content') as Element

  expect(shouldSyncFromMutations([
    {
      type: 'childList',
      target: overlay,
      addedNodes: [overlay],
      removedNodes: [],
    } as unknown as MutationRecord,
  ])).toBe(false)

  expect(shouldSyncFromMutations([
    {
      type: 'childList',
      target: content,
      addedNodes: [content],
      removedNodes: [],
    } as unknown as MutationRecord,
  ])).toBe(true)
})

test('page-builder preview bridge uses solid borders for selected blocks and dashed borders otherwise', () => {
  expect(resolveOverlayBorder('selected', {
    key: 'block:#hero',
    targetSelection: {
      kind: 'block',
      selector: '#hero',
      parentBlockSelector: '#hero',
      editBoundary: 'block',
    },
    primaryElement: {} as Element,
    elements: [],
  })).toContain('solid')

  expect(resolveOverlayBorder('hover', null)).toContain('dashed')
  expect(resolveOverlayBorder('selected', {
    key: 'cms-island:catalog',
    islandId: 'catalog',
    targetSelection: {
      kind: 'cms-island',
      htmlPath: 'index.html',
      sourceSelector: '#catalog',
      parentBlockSelector: '#catalog-parent',
      component: 'cms-catalog',
      editBoundary: 'source-atomic',
    },
    primaryElement: {} as Element,
    elements: [],
  })).toContain('dashed')
})

test('page-builder preview bridge waits for cms rendering readiness before initializing on CMS pages', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window, parentMessages } = setupPreviewBridgeDom(
    '<!doctype html><html><body><section id="hero">Hello</section></body></html>',
    {
      cmsRendering: true,
      cmsRenderingReady: false,
    },
  )

  window.eval(script)

  expect(document.documentElement.hasAttribute('data-page-builder-preview-bridge')).toBe(false)
  expect(parentMessages).toHaveLength(0)

  document.dispatchEvent(new window.CustomEvent('proma:cms-rendering-ready'))

  expect(document.documentElement.getAttribute('data-page-builder-preview-bridge')).toBe('ready')
  expect(parentMessages.some((message) =>
    typeof message === 'object'
    && message !== null
    && (message as { type?: string }).type === 'ready'
  )).toBe(true)
})

test('page-builder preview bridge initializes immediately when CMS rendering was already marked ready', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window, parentMessages } = setupPreviewBridgeDom(
    '<!doctype html><html><body><section id="hero">Hello</section></body></html>',
    {
      cmsRendering: true,
      cmsRenderingReady: true,
    },
  )

  window.eval(script)

  expect(document.documentElement.getAttribute('data-page-builder-preview-bridge')).toBe('ready')
  expect(parentMessages.some((message) =>
    typeof message === 'object'
    && message !== null
    && (message as { type?: string }).type === 'ready'
  )).toBe(true)
})

test('page-builder preview bridge initializes immediately on non-CMS pages', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window } = setupPreviewBridgeDom(
    '<!doctype html><html><body><section id="hero">Hello</section></body></html>',
  )

  window.eval(script)

  expect(document.documentElement.getAttribute('data-page-builder-preview-bridge')).toBe('ready')
})

test('page-builder preview bridge ignores hover and selection while interaction is locked', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window, parentMessages, parentWindow } = setupPreviewBridgeDom(`
    <!doctype html>
    <html>
      <body>
        <section id="hero">Hello</section>
      </body>
    </html>
  `)

  const hero = document.querySelector('#hero') as Element
  setElementRect(hero, {
    top: 100,
    left: 50,
    right: 250,
    bottom: 180,
    width: 200,
    height: 80,
  })

  window.eval(script)
  parentMessages.length = 0

  dispatchSelectionMode(window, parentWindow, {
    enabled: true,
    locked: true,
  })
  parentMessages.length = 0

  hero.dispatchEvent(new window.Event('mousemove', {
    bubbles: true,
    cancelable: true,
  }))
  hero.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))

  expect(parentMessages).toHaveLength(0)
  expect((document.querySelector('[data-page-builder-preview-overlay="selected"]') as HTMLElement | null)?.style.display).toBe('none')
})

test('page-builder preview bridge posts inline text save requests for selected text hosts', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window, parentMessages, parentWindow } = setupPreviewBridgeDom(`
    <!doctype html>
    <html>
      <body>
        <h1 id="title">旧标题</h1>
      </body>
    </html>
  `)

  const title = document.querySelector('#title') as HTMLElement
  setElementRect(title, {
    top: 100,
    left: 40,
    right: 240,
    bottom: 150,
    width: 200,
    height: 50,
  })

  window.eval(script)
  parentMessages.length = 0

  dispatchSelectionMode(window, parentWindow)
  parentMessages.length = 0

  title.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))
  title.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))

  expect(title.getAttribute('contenteditable')).toBe('true')
  title.textContent = '新标题'
  title.dispatchEvent(new window.Event('blur', {
    bubbles: true,
    cancelable: true,
  }))

  const saveRequest = parentMessages.find((message) =>
    typeof message === 'object'
    && message !== null
    && (message as { type?: string }).type === 'inline-text-save-request'
  ) as {
    type: 'inline-text-save-request'
    selector: string
    previousText: string
    nextText: string
    textTargetDescriptor: {
      tagName: string
      childPath: number[]
    }
  } | undefined

  expect(saveRequest).toMatchObject({
    selector: '#title',
    previousText: '旧标题',
    nextText: '新标题',
    textTargetDescriptor: {
      tagName: 'h1',
      childPath: [],
    },
  })
  expect(title.getAttribute('data-page-builder-preview-inline-saving')).toBe('true')
})

test('page-builder preview bridge retargets nested block selections before inline editing', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window, parentMessages, parentWindow } = setupPreviewBridgeDom(`
    <!doctype html>
    <html>
      <body>
        <section id="hero">
          <div id="inner">Nested</div>
        </section>
      </body>
    </html>
  `)

  const hero = document.querySelector('#hero') as Element
  const inner = document.querySelector('#inner') as Element
  setElementRect(hero, {
    top: 80,
    left: 30,
    right: 330,
    bottom: 260,
    width: 300,
    height: 180,
  })
  setElementRect(inner, {
    top: 120,
    left: 60,
    right: 220,
    bottom: 180,
    width: 160,
    height: 60,
  })

  window.eval(script)
  parentMessages.length = 0

  dispatchSelectionMode(window, parentWindow)
  parentMessages.length = 0

  hero.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))
  inner.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))

  const selectedMessages = parentMessages.filter((message) =>
    typeof message === 'object'
    && message !== null
    && (message as { type?: string }).type === 'selected'
  ) as Array<{
    selector: string
    displayLabel?: string
  }>

  expect(selectedMessages.at(-1)).toMatchObject({
    selector: '#inner',
    displayLabel: 'Inner',
  })
})

test('page-builder preview bridge includes replace-image capability discovery in selected payloads', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window, parentMessages, parentWindow } = setupPreviewBridgeDom(`
    <!doctype html>
    <html>
      <body>
        <section id="hero">
          <img src="/hero.png" alt="hero">
        </section>
      </body>
    </html>
  `)

  const hero = document.querySelector('#hero') as Element
  setElementRect(hero, {
    top: 60,
    left: 20,
    right: 340,
    bottom: 280,
    width: 320,
    height: 220,
  })

  window.eval(script)
  parentMessages.length = 0

  dispatchSelectionMode(window, parentWindow)
  parentMessages.length = 0

  hero.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))

  const selectedMessage = parentMessages.find((message) =>
    typeof message === 'object'
    && message !== null
    && (message as { type?: string }).type === 'selected'
  ) as {
    capabilities?: {
      replaceImage?: {
        supported: boolean
        targetDescriptor: {
          tagName: string
          childPath: number[]
        }
      }
    }
  } | undefined

  expect(selectedMessage?.capabilities?.replaceImage).toMatchObject({
    supported: true,
    targetDescriptor: {
      tagName: 'img',
      childPath: [0],
    },
  })
})

test('page-builder preview bridge promotes cms-island descendants into one source-atomic grouped selection and blocks drill-down inline editing', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <section id="news" data-proma-block-id="pb_blk_news">
          <ul>
              <li
                data-proma-cms-island-id="cms-island-1"
                data-proma-cms-island-html-path="index.html"
                data-proma-cms-island-component="cms-catalog"
                data-proma-cms-island-source-selector="body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)"
                data-proma-cms-island-parent-block-selector="body > section:nth-of-type(1)"
                data-proma-cms-island-edit-boundary="source-atomic"
            >
              <a id="catalog-link-1">栏目一</a>
            </li>
              <li
                data-proma-cms-island-id="cms-island-1"
                data-proma-cms-island-html-path="index.html"
                data-proma-cms-island-component="cms-catalog"
                data-proma-cms-island-source-selector="body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)"
                data-proma-cms-island-parent-block-selector="body > section:nth-of-type(1)"
                data-proma-cms-island-edit-boundary="source-atomic"
            >
              <a id="catalog-link-2">栏目二</a>
            </li>
          </ul>
        </section>
      </body>
    </html>
  `)

  const parentMessages: unknown[] = []
  const parentWindow = {
    postMessage(message: unknown) {
      parentMessages.push(message)
    },
  }

  Object.assign(globalThis, {
    window,
    document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    MutationObserver: undefined,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
  })

  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: parentWindow,
  })
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1440,
  })
  Object.defineProperty(window, 'MutationObserver', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(window, 'setInterval', {
    configurable: true,
    value: () => 1,
  })
  Object.defineProperty(window, 'clearInterval', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: 'complete',
  })

  const rootA = document.querySelector('#catalog-link-1')?.parentElement
  const rootB = document.querySelector('#catalog-link-2')?.parentElement
  rootA!.getBoundingClientRect = () => ({
    top: 100,
    left: 50,
    right: 150,
    bottom: 140,
    width: 100,
    height: 40,
  } as DOMRect)
  rootB!.getBoundingClientRect = () => ({
    top: 160,
    left: 200,
    right: 320,
    bottom: 200,
    width: 120,
    height: 40,
  } as DOMRect)

  window.eval(script)
  parentMessages.length = 0

  const selectionModeEvent = new window.Event('message')
  Object.assign(selectionModeEvent, {
    source: parentWindow,
    data: {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: true,
      locked: false,
    },
  })
  window.dispatchEvent(selectionModeEvent)
  parentMessages.length = 0

  document.querySelector('#catalog-link-2')?.dispatchEvent(new window.Event('mousemove', {
    bubbles: true,
    cancelable: true,
  }))
  document.querySelector('#catalog-link-2')?.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))
  document.querySelector('#catalog-link-1')?.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))

  const selectedMessages = parentMessages.filter((message) =>
    typeof message === 'object'
    && message !== null
    && (message as { type?: string }).type === 'selected'
  ) as Array<{
    type: 'selected'
    selector: string
    displayLabel?: string
    targetSelection: {
      kind: string
      htmlPath?: string
      sourceSelector?: string
      parentBlockSelector: string
      component?: string
      editBoundary: string
    }
    rect: {
      top: number
      left: number
      right: number
      bottom: number
      width: number
      height: number
    }
  }>

  expect(selectedMessages.at(-1)).toMatchObject({
    selector: 'body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
    displayLabel: 'cms-catalog',
    targetSelection: {
      kind: 'cms-island',
      htmlPath: 'index.html',
      sourceSelector: 'body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
      parentBlockSelector: 'body > section:nth-of-type(1)',
      component: 'cms-catalog',
      editBoundary: 'source-atomic',
    },
    rect: {
      top: 100,
      left: 50,
      right: 320,
      bottom: 200,
      width: 270,
      height: 100,
    },
  })

  const selectedOverlay = document.querySelector('[data-page-builder-preview-overlay="selected"]') as HTMLElement | null
  const selectedLabel = document.querySelector('[data-page-builder-preview-overlay="selected-label"]') as HTMLElement | null

  expect(selectedOverlay?.style.border).toContain('dashed')
  expect(selectedOverlay?.style.width).toBe('270px')
  expect(selectedOverlay?.style.height).toBe('100px')
  expect(selectedLabel?.textContent).toBe('cms-catalog')
  expect(document.querySelector('[data-page-builder-preview-inline-editing="true"]')).toBeNull()

  rootA?.remove()
  rootB?.remove()
  parentMessages.length = 0
  window.dispatchEvent(new window.Event('scroll'))

  expect(parentMessages.at(-1)).toMatchObject({
    type: 'reset',
  })
})

test('page-builder preview bridge auto-highlights cms islands when selection mode is enabled', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <main>
          <section id="catalog-list">
            <ul>
              <li
                data-proma-cms-island-id="cms-island-catalog"
                data-proma-cms-island-html-path="index.html"
                data-proma-cms-island-component="cms-catalog"
                data-proma-cms-island-source-selector="body > main:nth-of-type(1) > cms-catalog:nth-of-type(1)"
                data-proma-cms-island-parent-block-selector="body > main:nth-of-type(1) > section:nth-of-type(1)"
                data-proma-cms-island-edit-boundary="source-atomic"
              >
                <a id="catalog-link-1">栏目一</a>
              </li>
              <li
                data-proma-cms-island-id="cms-island-catalog"
                data-proma-cms-island-html-path="index.html"
                data-proma-cms-island-component="cms-catalog"
                data-proma-cms-island-source-selector="body > main:nth-of-type(1) > cms-catalog:nth-of-type(1)"
                data-proma-cms-island-parent-block-selector="body > main:nth-of-type(1) > section:nth-of-type(1)"
                data-proma-cms-island-edit-boundary="source-atomic"
              >
                <a id="catalog-link-2">栏目二</a>
              </li>
            </ul>
          </section>
          <section id="content-list">
            <article
              data-proma-cms-island-id="cms-island-content"
              data-proma-cms-island-html-path="index.html"
              data-proma-cms-island-component="cms-content"
              data-proma-cms-island-source-selector="body > main:nth-of-type(1) > cms-content:nth-of-type(1)"
              data-proma-cms-island-parent-block-selector="body > main:nth-of-type(1) > section:nth-of-type(2)"
              data-proma-cms-island-edit-boundary="source-atomic"
            >
              <h2 id="content-title">内容标题</h2>
            </article>
          </section>
        </main>
      </body>
    </html>
  `)

  const parentWindow = {
    postMessage() {},
  }

  Object.assign(globalThis, {
    window,
    document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    MutationObserver: undefined,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
  })

  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: parentWindow,
  })
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1440,
  })
  Object.defineProperty(window, 'MutationObserver', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(window, 'setInterval', {
    configurable: true,
    value: () => 1,
  })
  Object.defineProperty(window, 'clearInterval', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: 'complete',
  })

  const catalogRootA = document.querySelector('#catalog-link-1')?.parentElement
  const catalogRootB = document.querySelector('#catalog-link-2')?.parentElement
  const contentRoot = document.querySelector('#content-title')?.parentElement
  catalogRootA!.getBoundingClientRect = () => ({
    top: 100,
    left: 50,
    right: 160,
    bottom: 140,
    width: 110,
    height: 40,
  } as DOMRect)
  catalogRootB!.getBoundingClientRect = () => ({
    top: 150,
    left: 220,
    right: 360,
    bottom: 200,
    width: 140,
    height: 50,
  } as DOMRect)
  contentRoot!.getBoundingClientRect = () => ({
    top: 260,
    left: 80,
    right: 480,
    bottom: 420,
    width: 400,
    height: 160,
  } as DOMRect)

  window.eval(script)

  const selectionModeEvent = new window.Event('message')
  Object.assign(selectionModeEvent, {
    source: parentWindow,
    data: {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: true,
      locked: false,
      showCmsIslandOutlines: true,
    },
  })
  window.dispatchEvent(selectionModeEvent)

  const passiveOverlays = Array.from(
    document.querySelectorAll('[data-page-builder-preview-overlay="cms-passive"]'),
  ) as HTMLElement[]
  const passiveLabels = Array.from(
    document.querySelectorAll('[data-page-builder-preview-overlay="cms-passive-label"]'),
  ) as HTMLElement[]

  expect(passiveOverlays).toHaveLength(2)
  expect(passiveLabels.map((label) => label.textContent)).toEqual(['cms-catalog', 'cms-content'])
  expect(passiveOverlays[0]?.style.display).toBe('block')
  expect(passiveOverlays[0]?.style.width).toBe('310px')
  expect(passiveOverlays[0]?.style.height).toBe('100px')
  expect(passiveOverlays[1]?.style.display).toBe('block')
  expect(passiveOverlays[1]?.style.width).toBe('400px')
  expect(passiveOverlays[1]?.style.height).toBe('160px')
})

test('page-builder preview bridge keeps cms island passive outlines disabled by default', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <main>
          <article
            data-proma-cms-island-id="cms-island-content"
            data-proma-cms-island-html-path="index.html"
            data-proma-cms-island-component="cms-content"
            data-proma-cms-island-source-selector="body > main:nth-of-type(1) > cms-content:nth-of-type(1)"
            data-proma-cms-island-parent-block-selector="body > main:nth-of-type(1)"
            data-proma-cms-island-edit-boundary="source-atomic"
          >
            <h2 id="content-title">内容标题</h2>
          </article>
        </main>
      </body>
    </html>
  `)

  const parentWindow = {
    postMessage() {},
  }

  Object.assign(globalThis, {
    window,
    document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    MutationObserver: undefined,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
  })

  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: parentWindow,
  })
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1440,
  })
  Object.defineProperty(window, 'MutationObserver', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(window, 'setInterval', {
    configurable: true,
    value: () => 1,
  })
  Object.defineProperty(window, 'clearInterval', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: 'complete',
  })

  const contentRoot = document.querySelector('#content-title')?.parentElement
  contentRoot!.getBoundingClientRect = () => ({
    top: 260,
    left: 80,
    right: 480,
    bottom: 420,
    width: 400,
    height: 160,
  } as DOMRect)

  window.eval(script)

  const selectionModeEvent = new window.Event('message')
  Object.assign(selectionModeEvent, {
    source: parentWindow,
    data: {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: true,
      locked: false,
    },
  })
  window.dispatchEvent(selectionModeEvent)

  expect(document.querySelectorAll('[data-page-builder-preview-overlay="cms-passive"]')).toHaveLength(0)
  expect(document.querySelectorAll('[data-page-builder-preview-overlay="cms-passive-label"]')).toHaveLength(0)
})

test('page-builder preview bridge selects cms islands by default while passive outlines remain disabled', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <section>
          <ul>
            <li
              data-proma-cms-island-id="cms-island-1"
              data-proma-cms-island-html-path="index.html"
              data-proma-cms-island-component="cms-catalog"
              data-proma-cms-island-source-selector="body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)"
              data-proma-cms-island-parent-block-selector="body > section:nth-of-type(1)"
              data-proma-cms-island-edit-boundary="source-atomic"
            >
              <a id="catalog-link-1">栏目一</a>
            </li>
          </ul>
        </section>
      </body>
    </html>
  `)

  const parentMessages: unknown[] = []
  const parentWindow = {
    postMessage(message: unknown) {
      parentMessages.push(message)
    },
  }

  Object.assign(globalThis, {
    window,
    document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    MutationObserver: undefined,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
  })

  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: parentWindow,
  })
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1440,
  })
  Object.defineProperty(window, 'MutationObserver', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(window, 'setInterval', {
    configurable: true,
    value: () => 1,
  })
  Object.defineProperty(window, 'clearInterval', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: 'complete',
  })

  const root = document.querySelector('#catalog-link-1')?.parentElement
  root!.getBoundingClientRect = () => ({
    top: 100,
    left: 50,
    right: 150,
    bottom: 140,
    width: 100,
    height: 40,
  } as DOMRect)

  window.eval(script)
  parentMessages.length = 0

  const selectionModeEvent = new window.Event('message')
  Object.assign(selectionModeEvent, {
    source: parentWindow,
    data: {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: true,
      locked: false,
    },
  })
  window.dispatchEvent(selectionModeEvent)
  parentMessages.length = 0

  document.querySelector('#catalog-link-1')?.dispatchEvent(new window.Event('mousemove', {
    bubbles: true,
    cancelable: true,
  }))
  document.querySelector('#catalog-link-1')?.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))

  const selectedMessages = parentMessages.filter((message) =>
    typeof message === 'object'
    && message !== null
    && (message as { type?: string }).type === 'selected'
  ) as Array<{
    selector: string
    targetSelection: {
      kind: string
      htmlPath?: string
      sourceSelector?: string
      parentBlockSelector: string
      component?: string
      editBoundary: string
    }
  }>
  const selectedOverlay = document.querySelector('[data-page-builder-preview-overlay="selected"]') as HTMLElement | null
  const selectedLabel = document.querySelector('[data-page-builder-preview-overlay="selected-label"]') as HTMLElement | null
  const passiveOverlays = document.querySelectorAll('[data-page-builder-preview-overlay="cms-passive"]')

  expect(selectedMessages.at(-1)).toMatchObject({
    selector: 'body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
    displayLabel: 'cms-catalog',
    targetSelection: {
      kind: 'cms-island',
      htmlPath: 'index.html',
      sourceSelector: 'body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
      parentBlockSelector: 'body > section:nth-of-type(1)',
      component: 'cms-catalog',
      editBoundary: 'source-atomic',
    },
  })
  expect(selectedOverlay?.style.display).toBe('block')
  expect(selectedLabel?.textContent).toBe('cms-catalog')
  expect(passiveOverlays).toHaveLength(0)
})

test('page-builder preview bridge treats cms-rendered container clicks as cms-island selections', async () => {
  const module = await importPreviewBridgeModule()
  const script = await module.readPageBuilderPreviewBridgeScript()
  const { document, window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <section>
          <div class="conference-info">
            <p>静态标题</p>
            <ul id="catalog-list">
              <li
                data-proma-cms-island-id="cms-island-1"
                data-proma-cms-island-html-path="index.html"
                data-proma-cms-island-component="cms-catalog"
                data-proma-cms-island-source-selector="body > section:nth-of-type(1) > div:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)"
                data-proma-cms-island-parent-block-selector="body > section:nth-of-type(1) > div:nth-of-type(1)"
                data-proma-cms-island-edit-boundary="source-atomic"
              >
                <a>栏目一</a>
              </li>
              <li
                data-proma-cms-island-id="cms-island-1"
                data-proma-cms-island-html-path="index.html"
                data-proma-cms-island-component="cms-catalog"
                data-proma-cms-island-source-selector="body > section:nth-of-type(1) > div:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)"
                data-proma-cms-island-parent-block-selector="body > section:nth-of-type(1) > div:nth-of-type(1)"
                data-proma-cms-island-edit-boundary="source-atomic"
              >
                <a>栏目二</a>
              </li>
            </ul>
          </div>
        </section>
      </body>
    </html>
  `)

  const parentMessages: unknown[] = []
  const parentWindow = {
    postMessage(message: unknown) {
      parentMessages.push(message)
    },
  }

  Object.assign(globalThis, {
    window,
    document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    MutationObserver: undefined,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
  })

  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: parentWindow,
  })
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1440,
  })
  Object.defineProperty(window, 'MutationObserver', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(window, 'setInterval', {
    configurable: true,
    value: () => 1,
  })
  Object.defineProperty(window, 'clearInterval', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: 'complete',
  })

  const rootA = document.querySelector('#catalog-list > li:nth-of-type(1)')
  const rootB = document.querySelector('#catalog-list > li:nth-of-type(2)')
  const list = document.querySelector('#catalog-list')
  rootA!.getBoundingClientRect = () => ({
    top: 100,
    left: 50,
    right: 150,
    bottom: 140,
    width: 100,
    height: 40,
  } as DOMRect)
  rootB!.getBoundingClientRect = () => ({
    top: 145,
    left: 50,
    right: 170,
    bottom: 185,
    width: 120,
    height: 40,
  } as DOMRect)
  list!.getBoundingClientRect = () => ({
    top: 96,
    left: 44,
    right: 176,
    bottom: 189,
    width: 132,
    height: 93,
  } as DOMRect)

  window.eval(script)
  parentMessages.length = 0

  const selectionModeEvent = new window.Event('message')
  Object.assign(selectionModeEvent, {
    source: parentWindow,
    data: {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: true,
      locked: false,
    },
  })
  window.dispatchEvent(selectionModeEvent)
  parentMessages.length = 0

  list?.dispatchEvent(new window.Event('mousemove', {
    bubbles: true,
    cancelable: true,
  }))
  list?.dispatchEvent(new window.Event('click', {
    bubbles: true,
    cancelable: true,
  }))

  const selectedMessages = parentMessages.filter((message) =>
    typeof message === 'object'
    && message !== null
    && (message as { type?: string }).type === 'selected'
  ) as Array<{
    selector: string
    targetSelection: {
      kind: string
      htmlPath?: string
      sourceSelector?: string
      parentBlockSelector: string
      component?: string
      editBoundary: string
    }
  }>

  expect(selectedMessages.at(-1)).toMatchObject({
    selector: 'body > section:nth-of-type(1) > div:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
    targetSelection: {
      kind: 'cms-island',
      htmlPath: 'index.html',
      sourceSelector: 'body > section:nth-of-type(1) > div:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
      parentBlockSelector: 'body > section:nth-of-type(1) > div:nth-of-type(1)',
      component: 'cms-catalog',
      editBoundary: 'source-atomic',
    },
  })
})
