import { describe, expect, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { create } from 'react-test-renderer'
import { builderActiveTabAtom } from '@page-builder/atoms/builder-code-atoms'
import { BuilderRightPanel } from './BuilderRightPanel'

describe('BuilderRightPanel', () => {
  test('falls back to chat content when the active code tab is hidden', () => {
    const store = createStore()
    store.set(builderActiveTabAtom, 'code')

    const renderer = create(
      <Provider store={store}>
        <BuilderRightPanel
          chatContent={<div data-panel="chat">聊天内容</div>}
          codeTab={<div data-panel="code">代码内容</div>}
          hiddenToolbarItems={['codeTab']}
        />
      </Provider>,
    )

    const chatPanel = renderer.root.find((node) => node.props['data-panel'] === 'chat').parent
    const codePanel = renderer.root.find((node) => node.props['data-panel'] === 'code').parent

    expect(chatPanel?.props.className).toContain('block')
    expect(codePanel?.props.className).toContain('hidden')
  })

  test('keeps chat content visible when both tab buttons are hidden', () => {
    const store = createStore()
    store.set(builderActiveTabAtom, 'code')

    const renderer = create(
      <Provider store={store}>
        <BuilderRightPanel
          chatContent={<div data-panel="chat">聊天内容</div>}
          codeTab={<div data-panel="code">代码内容</div>}
          hiddenToolbarItems={['chatTab', 'codeTab']}
        />
      </Provider>,
    )

    const chatPanel = renderer.root.find((node) => node.props['data-panel'] === 'chat').parent
    const codePanel = renderer.root.find((node) => node.props['data-panel'] === 'code').parent

    expect(chatPanel?.props.className).toContain('block')
    expect(codePanel?.props.className).toContain('hidden')
  })
})
