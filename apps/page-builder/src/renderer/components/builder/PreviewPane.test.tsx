import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import {
  PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@ai-page-builder/shared'

function createBlockTargetSelection(selector: string) {
  return {
    kind: 'block' as const,
    selector,
    parentBlockSelector: selector,
    editBoundary: 'block' as const,
  }
}

function createCmsIslandTargetSelection(
  selector: string,
  parentBlockSelector: string,
  component: 'cms-catalog' | 'cms-content',
) {
  return {
    kind: 'cms-island' as const,
    sourceSelector: selector,
    parentBlockSelector,
    component,
    editBoundary: 'source-atomic' as const,
  }
}

function findButton(renderer: ReturnType<typeof create>, ariaLabel: string) {
  return renderer.root.find((node) =>
    node.type === 'button'
    && node.props['aria-label'] === ariaLabel
  )
}

function findToolbarNode(renderer: ReturnType<typeof create>) {
  return renderer.root.find((node) =>
    node.type === 'div'
    && node.props.style
    && typeof node.props.style.left === 'number'
    && typeof node.props.style.top === 'number'
  )
}

function findViewportFrameNode(renderer: ReturnType<typeof create>) {
  return renderer.root.find((node) =>
    node.type === 'div' && node.props['data-preview-viewport-frame'] === true
  )
}

async function loadPreviewPane() {
  mock.restore()
  return import(`./PreviewPane.tsx?test=${Date.now()}-${Math.random()}`)
}

afterEach(() => {
  mock.restore()
})

describe('PreviewPane', () => {
  test('renders a compact toolbar with device toggle, block selection, export, refresh, and new-window controls', async () => {
    const { PreviewPane } = await loadPreviewPane()
    const renderer = create(<PreviewPane previewUrl="https://example.com/preview" />)

    const toolbar = renderer.root.find((node) =>
      node.type === 'div'
      && typeof node.props.className === 'string'
      && node.props.className.includes('h-11')
      && node.props.className.includes('border-b border-border/70')
    )
    const buttons = renderer.root.findAllByType('button')
    const desktopButton = findButton(renderer, 'PC 预览')
    const mobileButton = findButton(renderer, 'Mobile 预览')
    const exportButton = findButton(renderer, '导出静态包')
    const json = JSON.stringify(renderer.toJSON())
    const viewportShell = renderer.root.find((node) =>
      node.type === 'div' && node.props['data-preview-viewport-shell'] === true
    )
    const deviceToggleGroup = renderer.root.find((node) =>
      node.type === 'div' && node.props['data-preview-device-toggle-group'] === true
    )
    const selectionActionGroup = renderer.root.find((node) =>
      node.type === 'div' && node.props['data-preview-selection-action-group'] === true
    )

    expect(toolbar.props.className).toContain('h-11')
    expect(buttons.map((button) => button.props['aria-label'])).toEqual([
      'PC 预览',
      'Mobile 预览',
      '选择区块',
      '导出静态包',
      '刷新预览',
      '新窗口打开预览',
    ])
    expect(desktopButton.props['aria-pressed']).toBe(true)
    expect(mobileButton.props['aria-pressed']).toBe(false)
    expect(findButton(renderer, '选择区块').props['aria-pressed']).toBe(false)
    expect(deviceToggleGroup.findAllByType('button').map((button) => button.props['aria-label'])).toEqual([
      'PC 预览',
      'Mobile 预览',
    ])
    expect(selectionActionGroup.findAllByType('button').map((button) => button.props['aria-label'])).toEqual([
      '选择区块',
    ])
    expect(viewportShell.props['data-preview-device-mode']).toBe('desktop')
    expect(json).not.toContain('实时预览')
    expect(exportButton.props.className).toContain('size-8')
    expect(exportButton.children.some((child: unknown) => typeof child === 'string')).toBe(false)
    expect(json).not.toContain('第一阶段使用精简 iframe 容器承载页面预览。')
  })

  test('reflects the preview block-selection toggle states and forwards toggle requests', async () => {
    const onToggleSelectionMode = mock(() => {})
    const { PreviewPane } = await loadPreviewPane()
    let renderer = create(
      <PreviewPane
        onToggleSelectionMode={onToggleSelectionMode}
        previewUrl="https://example.com/preview"
      />,
    )

    let idleSelectionButton = findButton(renderer, '选择区块')
    expect(idleSelectionButton.props['aria-pressed']).toBe(false)
    expect(idleSelectionButton.props.className).toContain('text-foreground')
    expect(idleSelectionButton.props.className).not.toContain('text-muted-foreground')

    await act(async () => {
      renderer.update(
        <PreviewPane
          onToggleSelectionMode={onToggleSelectionMode}
          previewUrl="https://example.com/preview"
          selectionActionState="armed"
          selectionModeEnabled={true}
        />,
      )
    })

    let selectionButton = findButton(renderer, '选择区块')
    expect(selectionButton.props['aria-pressed']).toBe(true)
    expect(selectionButton.props.className).toContain('border-primary/35')

    await act(async () => {
      selectionButton.props.onClick()
    })

    expect(onToggleSelectionMode).toHaveBeenCalledTimes(1)

    await act(async () => {
      renderer.update(
        <PreviewPane
          onToggleSelectionMode={onToggleSelectionMode}
          previewUrl="https://example.com/preview"
          selectionActionState="selected"
          selectionModeEnabled={true}
        />,
      )
    })

    selectionButton = findButton(renderer, '选择区块')
    expect(selectionButton.props['aria-pressed']).toBe(true)
    expect(selectionButton.props.className).toContain('bg-primary')

    await act(async () => {
      renderer.update(
        <PreviewPane
          onToggleSelectionMode={onToggleSelectionMode}
          previewUrl="https://example.com/preview"
          selectionActionState="idle"
          selectionToggleDisabled={true}
        />,
      )
    })

    selectionButton = findButton(renderer, '选择区块')
    expect(selectionButton.props['aria-pressed']).toBe(false)
    expect(selectionButton.props.disabled).toBe(true)
  })

  test('shows a loading state on the export button while the static export job is running', async () => {
    const { PreviewPane } = await loadPreviewPane()
    const renderer = create(
      <PreviewPane
        exportStaticPending={true}
        previewUrl="https://example.com/preview"
      />,
    )

    const exportButton = findButton(renderer, '导出静态包')
    const spinnerIcon = exportButton.findByType('svg')
    expect(exportButton.children.some((child: unknown) => typeof child === 'string')).toBe(false)
    expect(exportButton.props.disabled).toBe(true)
    expect(exportButton.props['aria-busy']).toBe(true)
    expect(spinnerIcon.props.className).toContain('animate-spin')
  })

  test('renders the preview iframe with a restricted sandbox and falls back to an empty state when no preview is available', async () => {
    const { PreviewPane } = await loadPreviewPane()
    const readyRenderer = create(<PreviewPane previewUrl="https://example.com/preview?v=rev-1" />)
    const iframe = readyRenderer.root.findByType('iframe')
    const viewportShell = readyRenderer.root.find((node) =>
      node.type === 'div' && node.props['data-preview-viewport-shell'] === true
    )
    expect(iframe.props.src).toBe('https://example.com/preview?v=rev-1&page-builder-bridge=1')
    expect(iframe.props.sandbox).toBe('allow-forms allow-scripts')
    expect(viewportShell.props.style.width).toBe('100%')

    const emptyRenderer = create(<PreviewPane previewUrl={null} />)
    const emptyJson = JSON.stringify(emptyRenderer.toJSON())
    expect(emptyJson).toContain('预览尚未生成')
  })

  test('appends allow-same-origin only when preview metadata requires it', async () => {
    const { PreviewPane } = await loadPreviewPane()
    const cmsRenderer = create(
      <PreviewPane
        previewUrl="https://example.com/preview?v=rev-1"
        requiresSameOrigin={true}
      />,
    )
    const cmsIframe = cmsRenderer.root.findByType('iframe')
    expect(cmsIframe.props.sandbox).toBe('allow-forms allow-scripts allow-same-origin')

    const plainRenderer = create(
      <PreviewPane
        previewUrl="https://example.com/preview?v=rev-1"
        requiresSameOrigin={false}
      />,
    )
    const plainIframe = plainRenderer.root.findByType('iframe')
    expect(plainIframe.props.sandbox).toBe('allow-forms allow-scripts')
  })

  test('opens the plain preview URL in a new window without the bridge query flag', async () => {
    const open = mock(() => {})
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener() {},
        removeEventListener() {},
        open,
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    const renderer = create(<PreviewPane previewUrl="https://example.com/preview?v=rev-1" />)

    await act(async () => {
      findButton(renderer, '新窗口打开预览').props.onClick()
    })

    expect(open).toHaveBeenCalledWith(
      'https://example.com/preview?v=rev-1',
      '_blank',
      'noopener,noreferrer',
    )
  })

  test('emits a reset selection event when the user manually refreshes the preview', async () => {
    const { PreviewPane } = await loadPreviewPane()
    const onSelectionEvent = mock(() => {})
    const renderer = create(
      <PreviewPane
        previewUrl="https://example.com/preview?v=rev-1"
        onSelectionEvent={onSelectionEvent}
      />,
    )

    await act(async () => {
      findButton(renderer, '刷新预览').props.onClick()
    })

    expect(onSelectionEvent).toHaveBeenCalledWith({ type: 'reset' })
  })

  test('switches to mobile mode and keeps the selected block toolbar anchored inside the viewport shell', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }
    let viewportWidth = 960

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onRequestOpenCmsBrowser={mock(() => {})}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }

            if (
              element.type === 'div'
              && element.props['data-preview-viewport-shell'] === true
            ) {
              return {
                getBoundingClientRect() {
                  return {
                    top: 0,
                    left: 0,
                    width: viewportWidth,
                    height: 640,
                    right: viewportWidth,
                    bottom: 640,
                  }
                },
              }
            }

            return {}
          },
        },
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])].at(-1)
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'selected',
          selector: '#hero',
          rect: {
            top: 120,
            left: 300,
            right: 620,
            bottom: 260,
            width: 320,
            height: 140,
          },
        },
      })
    })

    expect(findToolbarNode(renderer).props.style.left).toBe(300)

    viewportWidth = 390
    await act(async () => {
      findButton(renderer, 'Mobile 预览').props.onClick()
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'selected',
          selector: '#hero',
          rect: {
            top: 120,
            left: 300,
            right: 620,
            bottom: 260,
            width: 320,
            height: 140,
          },
        },
      })
    })

    const viewportShell = renderer.root.find((node) =>
      node.type === 'div' && node.props['data-preview-viewport-shell'] === true
    )
    const viewportFrame = findViewportFrameNode(renderer)

    expect(viewportShell.props['data-preview-device-mode']).toBe('mobile')
    expect(viewportShell.props.style.width).toBe('min(390px, 100%)')
    expect(viewportFrame.props.className).toContain('py-4')
    expect(viewportShell.props.className).toContain('border')
    expect(viewportShell.props.className).toContain('rounded')
    expect(findButton(renderer, 'PC 预览').props['aria-pressed']).toBe(false)
    expect(findButton(renderer, 'Mobile 预览').props['aria-pressed']).toBe(true)
    expect(findToolbarNode(renderer).props.style.left).toBe(202)
    expect(renderer.root.findAll((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '从 CMS 选择数据'
    )).toHaveLength(1)
  })

  test('keeps the iframe mounted when selection mode starts before the preview bridge becomes ready', async () => {
    const { PreviewPane } = await loadPreviewPane()
    const renderer = create(
      <PreviewPane
        previewUrl="https://example.com/preview?v=rev-1"
        selectionModeEnabled={true}
      />,
    )
    const initialIframe = renderer.root.findByType('iframe')

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750))
    })

    expect(renderer.root.findByType('iframe')).toBe(initialIframe)
  })

  test('keeps the iframe mounted when selection mode exits before the preview bridge becomes ready', async () => {
    const { PreviewPane } = await loadPreviewPane()
    const renderer = create(
      <PreviewPane
        previewUrl="https://example.com/preview?v=rev-1"
        selectionModeEnabled={true}
      />,
    )
    const initialIframe = renderer.root.findByType('iframe')

    await act(async () => {
      renderer.update(
        <PreviewPane
          onRequestOpenCmsBrowser={mock(() => {})}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={false}
        />,
      )
    })

    expect(renderer.root.findByType('iframe')).toBe(initialIframe)
  })

  test('syncs the latest selection state once the bridge becomes ready after earlier pending changes', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onRequestOpenCmsBrowser={mock(() => {})}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }
            return {}
          },
        },
      )
    })

    await act(async () => {
      renderer.update(
        <PreviewPane
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={false}
        />,
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'ready',
        },
      })
    })

    expect(iframeWindow.postMessage).toHaveBeenLastCalledWith({
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-clear',
    }, '*')
  })

  test('posts explicit exit messages when leaving selection mode after the bridge is ready', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onRequestOpenCmsBrowser={mock(() => {})}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }
            return {}
          },
        },
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'ready',
        },
      })
    })

    expect(iframeWindow.postMessage).toHaveBeenCalledWith({
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: true,
      locked: false,
    }, '*')

    await act(async () => {
      renderer.update(
        <PreviewPane
          interactionLocked={true}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={false}
        />,
      )
    })

    expect(iframeWindow.postMessage).toHaveBeenCalledWith({
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: false,
      locked: true,
    }, '*')
    expect(iframeWindow.postMessage).toHaveBeenLastCalledWith({
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-clear',
    }, '*')
  })

  test('renders CMS and delete actions for selected blocks', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }
    const onSelectionEvent = mock(() => {})
    const onRequestOpenCmsBrowser = mock(() => {})
    const onRequestDeleteBlock = mock(() => {})

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onRequestDeleteBlock={onRequestDeleteBlock}
          onRequestOpenCmsBrowser={onRequestOpenCmsBrowser}
          onSelectionEvent={onSelectionEvent}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }

            if (
              element.type === 'div'
              && typeof element.props.className === 'string'
              && element.props.className.includes('rounded-xl border border-border/70 bg-background')
            ) {
              return {
                getBoundingClientRect() {
                  return {
                    top: 0,
                    left: 0,
                    width: 960,
                    height: 640,
                    right: 960,
                    bottom: 640,
                  }
                },
              }
            }

            return {}
          },
        },
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'selected',
          selector: '#hero',
          displayLabel: 'Hero',
          targetSelection: createBlockTargetSelection('#hero'),
          rect: {
            top: 120,
            left: 80,
            right: 380,
            bottom: 260,
            width: 300,
            height: 140,
          },
        },
      })
    })

    expect(onSelectionEvent).toHaveBeenCalledWith({
      type: 'selected',
      selector: '#hero',
      displayLabel: 'Hero',
      targetSelection: createBlockTargetSelection('#hero'),
    })

    const actionButton = renderer.root.find((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '从 CMS 选择数据'
    )
    const deleteButton = renderer.root.find((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '删除'
    )

    expect(actionButton).toBeTruthy()
    expect(deleteButton).toBeTruthy()
    expect(deleteButton.props.disabled).toBe(false)
    expect(renderer.root.findAll((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '替换图片'
    )).toHaveLength(0)

    await act(async () => {
      actionButton.props.onClick()
    })

    expect(onRequestOpenCmsBrowser).toHaveBeenCalledTimes(1)

    await act(async () => {
      deleteButton.props.onClick()
    })

    expect(onRequestDeleteBlock).toHaveBeenCalledTimes(1)
    expect(onRequestDeleteBlock).toHaveBeenCalledWith('#hero')
  })

  test('hides the CMS action for selected blocks when CMS browsing is unavailable', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }
    const onRequestDeleteBlock = mock(() => {})

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onRequestDeleteBlock={onRequestDeleteBlock}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }

            if (
              element.type === 'div'
              && typeof element.props.className === 'string'
              && element.props.className.includes('rounded-xl border border-border/70 bg-background')
            ) {
              return {
                getBoundingClientRect() {
                  return {
                    top: 0,
                    left: 0,
                    width: 960,
                    height: 640,
                    right: 960,
                    bottom: 640,
                  }
                },
              }
            }

            return {}
          },
        },
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'selected',
          selector: '#hero',
          displayLabel: 'Hero',
          targetSelection: createBlockTargetSelection('#hero'),
          rect: {
            top: 120,
            left: 80,
            right: 380,
            bottom: 260,
            width: 300,
            height: 140,
          },
        },
      })
    })

    expect(renderer.root.findAll((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '从 CMS 选择数据'
    )).toHaveLength(0)
    expect(findButton(renderer, '删除')).toBeTruthy()
  })

  test('renders a replace-image action only when the selected block declares replaceImage capability', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }
    const onRequestReplaceImage = mock(() => {})

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onRequestReplaceImage={onRequestReplaceImage}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }

            if (
              element.type === 'div'
              && typeof element.props.className === 'string'
              && element.props.className.includes('rounded-xl border border-border/70 bg-background')
            ) {
              return {
                getBoundingClientRect() {
                  return {
                    top: 0,
                    left: 0,
                    width: 960,
                    height: 640,
                    right: 960,
                    bottom: 640,
                  }
                },
              }
            }

            return {}
          },
        },
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'selected',
          selector: '#hero-image',
          displayLabel: 'HeroImage',
          targetSelection: createBlockTargetSelection('#hero-image'),
          rect: {
            top: 160,
            left: 100,
            right: 360,
            bottom: 320,
            width: 260,
            height: 160,
          },
          capabilities: {
            replaceImage: {
              supported: true,
              targetDescriptor: {
                version: 1,
                tagName: 'img',
                childPath: [],
              },
            },
          },
        },
      })
    })

    const replaceImageButton = renderer.root.find((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '替换图片'
    )

    expect(replaceImageButton).toBeTruthy()

    await act(async () => {
      replaceImageButton.props.onClick()
    })

    expect(onRequestReplaceImage).toHaveBeenCalledTimes(1)
    expect(onRequestReplaceImage).toHaveBeenCalledWith({
      selector: '#hero-image',
      imageTargetDescriptor: {
        version: 1,
        tagName: 'img',
        childPath: [],
      },
    })
  })

  test('locks preview block interactions while the agent is processing', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }
    const onSelectionEvent = mock(() => {})
    const onRequestOpenCmsBrowser = mock(() => {})
    const onRequestDeleteBlock = mock(() => {})
    const onRequestReplaceImage = mock(() => {})

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onRequestDeleteBlock={onRequestDeleteBlock}
          onRequestOpenCmsBrowser={onRequestOpenCmsBrowser}
          onRequestReplaceImage={onRequestReplaceImage}
          onSelectionEvent={onSelectionEvent}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }

            if (
              element.type === 'div'
              && typeof element.props.className === 'string'
              && element.props.className.includes('rounded-xl border border-border/70 bg-background')
            ) {
              return {
                getBoundingClientRect() {
                  return {
                    top: 0,
                    left: 0,
                    width: 960,
                    height: 640,
                    right: 960,
                    bottom: 640,
                  }
                },
              }
            }

            return {}
          },
        },
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'selected',
          selector: '#hero-image',
          displayLabel: 'HeroImage',
          targetSelection: createBlockTargetSelection('#hero-image'),
          rect: {
            top: 160,
            left: 100,
            right: 360,
            bottom: 320,
            width: 260,
            height: 160,
          },
          capabilities: {
            replaceImage: {
              supported: true,
              targetDescriptor: {
                version: 1,
                tagName: 'img',
                childPath: [],
              },
            },
          },
        },
      })
    })

    await act(async () => {
      renderer.update(
        <PreviewPane
          interactionLocked={true}
          onRequestDeleteBlock={onRequestDeleteBlock}
          onRequestOpenCmsBrowser={onRequestOpenCmsBrowser}
          onRequestReplaceImage={onRequestReplaceImage}
          onSelectionEvent={onSelectionEvent}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
      )
    })

    const actionButton = renderer.root.find((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '从 CMS 选择数据'
    )
    const deleteButton = renderer.root.find((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '删除'
    )
    const replaceImageButton = renderer.root.find((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '替换图片'
    )

    expect(actionButton.props.disabled).toBe(true)
    expect(deleteButton.props.disabled).toBe(true)
    expect(replaceImageButton.props.disabled).toBe(true)
    expect(renderer.root.findAll((node) =>
      node.type === 'div'
      && node.props['data-preview-interaction-lock'] === true
    )).toHaveLength(0)

    await act(async () => {
      actionButton.props.onClick()
      deleteButton.props.onClick()
      replaceImageButton.props.onClick()
    })

    expect(onRequestOpenCmsBrowser).toHaveBeenCalledTimes(0)
    expect(onRequestDeleteBlock).toHaveBeenCalledTimes(0)
    expect(onRequestReplaceImage).toHaveBeenCalledTimes(0)

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'selected',
          selector: '#pricing',
          displayLabel: 'Pricing',
          targetSelection: createBlockTargetSelection('#pricing'),
          rect: {
            top: 220,
            left: 120,
            right: 400,
            bottom: 360,
            width: 280,
            height: 140,
          },
        },
      })
    })

    expect(onSelectionEvent).toHaveBeenCalledWith({
      type: 'selected',
      selector: '#hero-image',
      displayLabel: 'HeroImage',
      targetSelection: createBlockTargetSelection('#hero-image'),
    })
    expect(onSelectionEvent).not.toHaveBeenCalledWith({
      type: 'selected',
      selector: '#pricing',
      displayLabel: 'Pricing',
      targetSelection: createBlockTargetSelection('#pricing'),
    })
  })

  test('emits cms-island target selections and suppresses replace-image affordances for source-atomic islands', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }
    const onSelectionEvent = mock(() => {})

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onSelectionEvent={onSelectionEvent}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }

            if (
              element.type === 'div'
              && typeof element.props.className === 'string'
              && element.props.className.includes('rounded-xl border border-border/70 bg-background')
            ) {
              return {
                getBoundingClientRect() {
                  return {
                    top: 0,
                    left: 0,
                    width: 960,
                    height: 640,
                    right: 960,
                    bottom: 640,
                  }
                },
              }
            }

            return {}
          },
        },
      )
    })

    const targetSelection = createCmsIslandTargetSelection(
      'body > section:nth-of-type(1) > cms-catalog:nth-of-type(1)',
      '[data-proma-block-id="hero-news"]',
      'cms-catalog',
    )

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'selected',
          selector: targetSelection.sourceSelector,
          displayLabel: 'cms-catalog',
          targetSelection,
          rect: {
            top: 140,
            left: 90,
            right: 420,
            bottom: 360,
            width: 330,
            height: 220,
          },
        },
      })
    })

    expect(onSelectionEvent).toHaveBeenCalledWith({
      type: 'selected',
      selector: targetSelection.sourceSelector,
      displayLabel: 'cms-catalog',
      targetSelection,
    })
    expect(renderer.root.findAll((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '替换图片'
    )).toHaveLength(0)
  })

  test('posts interaction lock state to the preview bridge without mounting an iframe overlay', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onRequestOpenCmsBrowser={mock(() => {})}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }
            return {}
          },
        },
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'ready',
        },
      })
    })

    expect(iframeWindow.postMessage).toHaveBeenCalledWith({
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: true,
      locked: false,
    }, '*')

    await act(async () => {
      renderer.update(
        <PreviewPane
          interactionLocked={true}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
      )
    })

    expect(iframeWindow.postMessage).toHaveBeenCalledWith({
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: true,
      locked: true,
    }, '*')
    expect(renderer.root.findAll((node) =>
      node.type === 'div'
      && node.props['data-preview-interaction-lock'] === true
    )).toHaveLength(0)
  })

  test('hides the block toolbar when the bridge resets the current selection', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PreviewPane
          onRequestOpenCmsBrowser={mock(() => {})}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }

            if (
              element.type === 'div'
              && typeof element.props.className === 'string'
              && element.props.className.includes('rounded-xl border border-border/70 bg-background')
            ) {
              return {
                getBoundingClientRect() {
                  return {
                    top: 0,
                    left: 0,
                    width: 960,
                    height: 640,
                    right: 960,
                    bottom: 640,
                  }
                },
              }
            }

            return {}
          },
        },
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'selected',
          selector: '#hero',
          rect: {
            top: 160,
            left: 100,
            right: 360,
            bottom: 320,
            width: 260,
            height: 160,
          },
        },
      })
    })

    expect(renderer.root.findAll((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '从 CMS 选择数据'
    )).toHaveLength(1)

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'reset',
        },
      })
    })

    expect(renderer.root.findAll((node) =>
      node.type === 'button'
      && node.props['aria-label'] === '从 CMS 选择数据'
    )).toHaveLength(0)
  })

  test('forwards inline text save requests to the host and posts the save result back to the iframe', async () => {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    const iframeWindow = {
      postMessage: mock(() => {}),
    }
    const onInlineTextSaveRequest = mock(async () => ({
      requestId: 'save-1',
      ok: true,
    }))

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          const bucket = listeners.get(type) ?? new Set()
          bucket.add(listener)
          listeners.set(type, bucket)
        },
        removeEventListener(type: string, listener: (event: unknown) => void) {
          listeners.get(type)?.delete(listener)
        },
        open: mock(() => {}),
      },
    })

    const { PreviewPane } = await loadPreviewPane()

    await act(async () => {
      create(
        <PreviewPane
          onInlineTextSaveRequest={onInlineTextSaveRequest}
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={true}
        />,
        {
          createNodeMock(element) {
            if (element.type === 'iframe') {
              return { contentWindow: iframeWindow }
            }
            return {}
          },
        },
      )
    })

    await act(async () => {
      const messageHandler = [...(listeners.get('message') ?? [])][0]
      messageHandler?.({
        source: iframeWindow,
        data: {
          source: PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
          type: 'inline-text-save-request',
          requestId: 'save-1',
          selector: '#hero',
          textTargetDescriptor: {
            version: 1,
            tagName: 'h1',
            childPath: [0],
          },
          previousText: '旧标题',
          nextText: '新标题',
        },
      })
      await Promise.resolve()
    })

    expect(onInlineTextSaveRequest).toHaveBeenCalledWith({
      requestId: 'save-1',
      selector: '#hero',
      textTargetDescriptor: {
        version: 1,
        tagName: 'h1',
        childPath: [0],
      },
      previousText: '旧标题',
      nextText: '新标题',
    })
    expect(iframeWindow.postMessage).toHaveBeenLastCalledWith({
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'inline-text-save-result',
      requestId: 'save-1',
      ok: true,
    }, '*')
  })
})
