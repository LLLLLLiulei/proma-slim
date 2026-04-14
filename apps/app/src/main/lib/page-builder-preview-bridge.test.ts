import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseHTML } from 'linkedom'
import {
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@proma/shared'

async function importPreviewBridgeModule() {
  const url = new URL(`./page-builder-preview-bridge.ts?test=${Date.now()}-${Math.random()}`, import.meta.url)
  return import(url.href)
}

afterEach(() => {
  delete process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH
})

test('page-builder preview bridge reads the latest script content and asset version without restarting', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'proma-preview-bridge-'))
  const bridgePath = join(tempDir, 'page-builder-preview-bridge.js')

  try {
    writeFileSync(bridgePath, 'console.info("bridge-version-a")', 'utf-8')
    process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH = bridgePath

    const module = await importPreviewBridgeModule()

    const firstScript = module.readPageBuilderPreviewBridgeScript()
    const firstAssetUrl = module.getPageBuilderPreviewBridgeAssetUrl()

    writeFileSync(bridgePath, 'console.info("bridge-version-b")', 'utf-8')

    const secondScript = module.readPageBuilderPreviewBridgeScript()
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

test('page-builder preview bridge bundled script includes selected rect syncing behavior', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain("type: 'selected'")
  expect(script).toContain('rect,')
  expect(script).toContain('const postSelectedRect = () => {')
  expect(script).toContain('clearAll(true)')
})

test('page-builder preview bridge filters mutation observer events triggered by its own overlays', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('const isBridgeOverlayNode = (node) => {')
  expect(script).toContain('const shouldSyncFromMutations = (mutations) => {')
  expect(script).toContain('if (!shouldSyncFromMutations(mutations)) {')
})

test('page-builder preview bridge handles interaction locks without relying on a parent overlay', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('let showCmsIslandOutlines = false')
  expect(script).toContain('let selectionInteractionLocked = false')
  expect(script).toContain('locked: Boolean(data.locked)')
  expect(script).toContain('selectionInteractionLocked = Boolean(data.locked)')
  expect(script).toContain('showCmsIslandOutlines = Boolean(data.showCmsIslandOutlines)')
  expect(script).toContain('if (!selectionModeEnabled || selectionInteractionLocked) return')
})

test('page-builder preview bridge waits for cms rendering readiness before initializing on CMS pages', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('__PROMA_CMS_RENDERING_PREVIEW__')
  expect(script).toContain('proma:cms-rendering-ready')
  expect(script).toContain("document.addEventListener('proma:cms-rendering-ready', init, { once: true })")
})

test('page-builder preview bridge initializes immediately when CMS rendering was already marked ready', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('__PROMA_CMS_RENDERING_PREVIEW_READY__ === true')
  expect(script).toContain('if (window.__PROMA_CMS_RENDERING_PREVIEW_READY__ === true) {')
  expect(script).toContain('init()')
})

test('page-builder preview bridge initializes immediately on non-CMS pages', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('const shouldWaitForCmsRenderingReady = window.__PROMA_CMS_RENDERING_PREVIEW__?.hasCmsRendering === true')
  expect(script).toContain('document.addEventListener(\'DOMContentLoaded\', initWhenPreviewReady, { once: true })')
  expect(script).toContain('initWhenPreviewReady()')
})

test('page-builder preview bridge uses dashed hover borders and solid selected borders', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain("? '2px solid rgba(37, 99, 235, 0.92)'")
  expect(script).toContain(": '2px dashed rgba(59, 130, 246, 0.65)'")
})

test('page-builder preview bridge bundled script includes inline text editing save protocol hooks', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain("'DIV'")
  expect(script).toContain("type: 'inline-text-save-request'")
  expect(script).toContain("inline-text-save-result")
  expect(script).toContain('contenteditable')
  expect(script).toContain('const resolveEditableTextTargetDescriptor = (root, element) => {')
  expect(script).toContain('function handleInlineTextBlur(event) {')
})

test('page-builder preview bridge bundled script includes nested child selection retargeting before inline editing', async () => {
  const module = await importPreviewBridgeModule()
  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('const shouldRetargetSelection = (target) => {')
  expect(script).toContain('if (shouldRetargetSelection(target)) {')
})

test('page-builder preview bridge bundled script includes cms island target grouping and source-atomic selection metadata', async () => {
  const module = await importPreviewBridgeModule()
  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('data-proma-cms-island-id')
  expect(script).toContain('data-proma-cms-island-source-selector')
  expect(script).toContain('data-proma-cms-island-parent-block-selector')
  expect(script).toContain('const resolveCmsIslandTarget = (input) => {')
  expect(script).toContain('const resolveGroupedRect = (elements) => {')
  expect(script).toContain("editBoundary: 'source-atomic'")
  expect(script).toContain("kind: 'cms-island'")
})

test('page-builder preview bridge bundled script includes replace-image capability discovery in selected payloads', async () => {
  const module = await importPreviewBridgeModule()
  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('const resolveReplaceImageCapability = (element) => {')
  expect(script).toContain('replaceImage')
  expect(script).toContain('targetDescriptor')
  expect(script).toContain("querySelectorAll('img')")
})

test('page-builder preview bridge promotes cms-island descendants into one source-atomic grouped selection and blocks drill-down inline editing', async () => {
  const module = await importPreviewBridgeModule()
  const script = module.readPageBuilderPreviewBridgeScript()
  const { document, window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <section id="news" data-proma-block-id="pb_blk_news">
          <ul>
            <li
              data-proma-cms-island-id="cms-island-1"
              data-proma-cms-island-component="cms-catalog"
              data-proma-cms-island-source-selector="body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)"
              data-proma-cms-island-parent-block-selector="body > section:nth-of-type(1)"
              data-proma-cms-island-edit-boundary="source-atomic"
            >
              <a id="catalog-link-1">栏目一</a>
            </li>
            <li
              data-proma-cms-island-id="cms-island-1"
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
    targetSelection: {
      kind: string
      selector: string
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
    targetSelection: {
      kind: 'cms-island',
      selector: 'body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
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
  const script = module.readPageBuilderPreviewBridgeScript()
  const { document, window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <main>
          <section id="catalog-list">
            <ul>
              <li
                data-proma-cms-island-id="cms-island-catalog"
                data-proma-cms-island-component="cms-catalog"
                data-proma-cms-island-source-selector="body > main:nth-of-type(1) > cms-catalog:nth-of-type(1)"
                data-proma-cms-island-parent-block-selector="body > main:nth-of-type(1) > section:nth-of-type(1)"
                data-proma-cms-island-edit-boundary="source-atomic"
              >
                <a id="catalog-link-1">栏目一</a>
              </li>
              <li
                data-proma-cms-island-id="cms-island-catalog"
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
  const script = module.readPageBuilderPreviewBridgeScript()
  const { document, window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <main>
          <article
            data-proma-cms-island-id="cms-island-content"
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
  const script = module.readPageBuilderPreviewBridgeScript()
  const { document, window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <section>
          <ul>
            <li
              data-proma-cms-island-id="cms-island-1"
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
      selector: string
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
    targetSelection: {
      kind: 'cms-island',
      selector: 'body > section:nth-of-type(1) > ul:nth-of-type(1) > cms-catalog:nth-of-type(1)',
      parentBlockSelector: 'body > section:nth-of-type(1)',
      component: 'cms-catalog',
      editBoundary: 'source-atomic',
    },
  })
  expect(selectedOverlay?.style.display).toBe('block')
  expect(selectedLabel?.textContent).toBe('cms-catalog')
  expect(passiveOverlays).toHaveLength(0)
})
