import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type { PermissionRequest } from '@proma/shared'
import { allPendingPermissionRequestsAtom } from '@/atoms/agent-atoms'
import { api } from '@/lib/api'
import { PermissionBanner } from './PermissionBanner'

const originalRespondPermission = api.respondPermission
const originalConsoleError = console.error

function HydratePermissionRequests({
  children,
  requestsBySession,
}: {
  children: React.ReactNode
  requestsBySession: Map<string, readonly PermissionRequest[]>
}): React.ReactElement {
  useHydrateAtoms([[allPendingPermissionRequestsAtom, requestsBySession]])
  return <>{children}</>
}

afterEach(() => {
  mock.restore()
  api.respondPermission = originalRespondPermission
  console.error = originalConsoleError
})

describe('PermissionBanner', () => {
  test('drops a stale permission request locally when the backend reports it no longer exists', async () => {
    const sessionId = 'session-1'
    const staleRequest: PermissionRequest = {
      requestId: 'missing-request',
      sessionId,
      toolName: 'Write',
      toolInput: { file_path: '/tmp/index.html' },
      description: '写入文件',
      dangerLevel: 'normal',
    }
    const nextRequest: PermissionRequest = {
      requestId: 'fresh-request',
      sessionId,
      toolName: 'Bash',
      toolInput: { command: 'mkdir test' },
      description: '执行命令',
      command: 'mkdir test',
      dangerLevel: 'normal',
    }

    const respondPermission = mock(async () => {
      throw new Error(`权限请求不存在: ${staleRequest.requestId}`)
    })
    api.respondPermission = respondPermission
    console.error = mock(() => {}) as typeof console.error

    const store = createStore()
    const requestsBySession = new Map<string, readonly PermissionRequest[]>([
      [sessionId, [staleRequest, nextRequest]],
    ])

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <HydratePermissionRequests requestsBySession={requestsBySession}>
            <PermissionBanner sessionId={sessionId} />
          </HydratePermissionRequests>
        </Provider>,
      )
    })

    const buttons = renderer.root.findAllByType('button')
    expect(JSON.stringify(renderer.toJSON())).toContain('Write')

    await act(async () => {
      buttons[1]!.props.onClick()
      await Promise.resolve()
    })

    expect(respondPermission).toHaveBeenCalledWith(sessionId, {
      requestId: staleRequest.requestId,
      behavior: 'allow',
      alwaysAllow: true,
    })
    expect(console.error).not.toHaveBeenCalled()
    expect(store.get(allPendingPermissionRequestsAtom).get(sessionId)).toEqual([nextRequest])
    expect(JSON.stringify(renderer.toJSON())).toContain('Bash')
  })
})
