import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import {
  PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@proma/shared'

async function loadPreviewPane() {
  mock.restore()
  return import(`./PreviewPane.tsx?test=${Date.now()}-${Math.random()}`)
}

afterEach(() => {
  mock.restore()
})

describe('PreviewPane', () => {
  test('renders a compact toolbar with refresh, fullscreen, and new-window controls', async () => {
    const { PreviewPane } = await loadPreviewPane()
    const renderer = create(<PreviewPane previewUrl="https://example.com/preview" />)

    const toolbar = renderer.root.find((node) =>
      node.type === 'div'
      && typeof node.props.className === 'string'
      && node.props.className.includes('h-11')
      && node.props.className.includes('border-b border-border/70')
    )
    const buttons = renderer.root.findAllByType('button')
    const json = JSON.stringify(renderer.toJSON())

    expect(toolbar.props.className).toContain('h-11')
    expect(buttons.map((button) => button.props['aria-label'])).toEqual([
      '刷新预览',
      '全屏预览',
      '新窗口打开预览',
    ])
    expect(json).toContain('实时预览')
    expect(json).not.toContain('第一阶段使用精简 iframe 容器承载页面预览。')
  })

  test('renders the preview iframe with a restricted sandbox and falls back to an empty state when no preview is available', async () => {
    const { PreviewPane } = await loadPreviewPane()
    const readyRenderer = create(<PreviewPane previewUrl="https://example.com/preview?v=rev-1" />)
    const iframe = readyRenderer.root.findByType('iframe')
    expect(iframe.props.src).toBe('https://example.com/preview?v=rev-1&page-builder-bridge=1')
    expect(iframe.props.sandbox).toBe('allow-forms allow-scripts')

    const emptyRenderer = create(<PreviewPane previewUrl={null} />)
    const emptyJson = JSON.stringify(emptyRenderer.toJSON())
    expect(emptyJson).toContain('预览尚未生成')
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
      renderer.root.findAllByType('button')[2]!.props.onClick()
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
      renderer.root.findAllByType('button')[0]!.props.onClick()
    })

    expect(onSelectionEvent).toHaveBeenCalledWith({ type: 'reset' })
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
    }, '*')

    await act(async () => {
      renderer.update(
        <PreviewPane
          previewUrl="https://example.com/preview?v=rev-1"
          selectionModeEnabled={false}
        />,
      )
    })

    expect(iframeWindow.postMessage).toHaveBeenCalledWith({
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: false,
    }, '*')
    expect(iframeWindow.postMessage).toHaveBeenLastCalledWith({
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-clear',
    }, '*')
  })
})
