import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'

afterEach(() => {
  mock.restore()
})

describe('App', () => {
  test('shows neutral loading copy while connecting', async () => {
    mock.module('./components/ui/tooltip', () => ({
      TooltipProvider({ children }: { children: React.ReactNode }) {
        return React.createElement(React.Fragment, null, children)
      },
    }))

    mock.module('./components/app-shell/AppShell', () => ({
      AppShell() {
        return React.createElement('div', null, 'app-shell')
      },
    }))

    mock.module('./lib/api', () => ({
      api: {
        getStatus: () => new Promise(() => {}),
      },
    }))

    const { default: App } = await import(`./App.tsx?test=${Date.now()}-${Math.random()}`)

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(App))
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('正在连接服务...')
    expect(json).not.toContain('正在连接 Proma 服务...')
  })
})
