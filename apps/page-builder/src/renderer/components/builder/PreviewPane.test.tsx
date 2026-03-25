import { describe, expect, test } from 'bun:test'
import React from 'react'
import { create } from 'react-test-renderer'
import { PreviewPane } from './PreviewPane'

describe('PreviewPane', () => {
  test('renders a compact toolbar with refresh, fullscreen, and new-window controls', () => {
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

  test('renders the preview iframe with a restricted sandbox and falls back to an empty state when no preview is available', () => {
    const readyRenderer = create(<PreviewPane previewUrl="https://example.com/preview?v=rev-1" />)
    const iframe = readyRenderer.root.findByType('iframe')
    expect(iframe.props.src).toBe('https://example.com/preview?v=rev-1')
    expect(iframe.props.sandbox).toBe('allow-forms allow-scripts')

    const emptyRenderer = create(<PreviewPane previewUrl={null} />)
    const emptyJson = JSON.stringify(emptyRenderer.toJSON())
    expect(emptyJson).toContain('预览尚未生成')
  })
})
