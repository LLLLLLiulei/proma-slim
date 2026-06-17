import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'

function flattenElementText(node: React.ReactNode): string {
  return React.Children.toArray(node).map((child) => {
    if (typeof child === 'string') return child
    if (typeof child === 'number') return String(child)
    if (React.isValidElement(child)) return flattenElementText(child.props.children)
    return ''
  }).join('')
}

function findButtonByText(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.find((node) =>
    node.type === 'button'
    && flattenElementText(node.props.children).trim() === label,
  )
}

function findByTestId(renderer: ReturnType<typeof create>, testId: string) {
  return renderer.root.find((node) => node.props['data-testid'] === testId)
}

async function loadResourceTabs() {
  let templateRenderCount = 0
  let historyRenderCount = 0
  let templateMountCount = 0
  let historyMountCount = 0
  const templateSectionProps: Array<{
    allowTemplateUse?: boolean
  }> = []

  mock.module('./PageBuilderTemplateLibrarySection', () => ({
    PageBuilderTemplateLibrarySection(props: {
      allowTemplateUse?: boolean
    }) {
      templateRenderCount += 1
      templateSectionProps.push(props)
      React.useEffect(() => {
        templateMountCount += 1
      }, [])
      return React.createElement('div', { 'data-testid': 'template-library-section' }, 'template-section')
    },
  }))

  mock.module('./PageBuilderHistorySection', () => ({
    PageBuilderHistorySection() {
      historyRenderCount += 1
      React.useEffect(() => {
        historyMountCount += 1
      }, [])
      return React.createElement('div', { 'data-testid': 'page-builder-history-section' }, 'history-section')
    },
  }))

  const module = await import(`./PageBuilderHomeResourceTabs.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    PageBuilderHomeResourceTabs: module.PageBuilderHomeResourceTabs,
    getTemplateRenderCount: () => templateRenderCount,
    getHistoryRenderCount: () => historyRenderCount,
    getTemplateMountCount: () => templateMountCount,
    getHistoryMountCount: () => historyMountCount,
    getTemplateSectionProps: () => templateSectionProps,
  }
}

afterEach(() => {
  mock.restore()
})

describe('PageBuilderHomeResourceTabs', () => {
  test('defaults to the template library while keeping history mounted and hidden', async () => {
    const {
      PageBuilderHomeResourceTabs,
      getHistoryMountCount,
      getHistoryRenderCount,
      getTemplateMountCount,
      getTemplateRenderCount,
    } = await loadResourceTabs()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHomeResourceTabs))
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('模板库')
    expect(json).toContain('历史记录')
    expect(json).toContain('template-section')
    expect(json).toContain('history-section')
    expect(findByTestId(renderer, 'page-builder-template-tab-panel').props.hidden).toBe(false)
    expect(findByTestId(renderer, 'page-builder-history-tab-panel').props.hidden).toBe(true)
    expect(getTemplateRenderCount()).toBe(1)
    expect(getHistoryRenderCount()).toBe(1)
    expect(getTemplateMountCount()).toBe(1)
    expect(getHistoryMountCount()).toBe(1)
  })

  test('switches visibility without remounting either tab panel', async () => {
    const {
      PageBuilderHomeResourceTabs,
      getHistoryMountCount,
      getTemplateMountCount,
    } = await loadResourceTabs()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHomeResourceTabs))
    })

    await act(async () => {
      findButtonByText(renderer, '历史记录').props.onClick()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('history-section')
    expect(json).toContain('template-section')
    expect(findByTestId(renderer, 'page-builder-template-tab-panel').props.hidden).toBe(true)
    expect(findByTestId(renderer, 'page-builder-history-tab-panel').props.hidden).toBe(false)
    expect(getTemplateMountCount()).toBe(1)
    expect(getHistoryMountCount()).toBe(1)
  })

  test('can hide history and disable template use for CMS integration home mode', async () => {
    const {
      PageBuilderHomeResourceTabs,
      getHistoryMountCount,
      getHistoryRenderCount,
      getTemplateMountCount,
      getTemplateSectionProps,
    } = await loadResourceTabs()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHomeResourceTabs, {
        allowTemplateUse: false,
        showHistory: false,
      }))
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('模板库')
    expect(json).not.toContain('历史记录')
    expect(json).toContain('template-section')
    expect(renderer.root.findAll((node) => node.props['data-testid'] === 'page-builder-history-tab-panel')).toHaveLength(0)
    expect(getTemplateSectionProps()).toEqual([{ allowTemplateUse: false }])
    expect(getTemplateMountCount()).toBe(1)
    expect(getHistoryRenderCount()).toBe(0)
    expect(getHistoryMountCount()).toBe(0)
  })
})
