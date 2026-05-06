import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type { AskUserRequest } from '@ai-page-builder/shared'
import { allPendingAskUserRequestsAtom } from '@/atoms/agent-atoms'
import { AskUserBanner } from './AskUserBanner'

function HydrateAskUserRequests({
  children,
  requestsBySession,
}: {
  children: React.ReactNode
  requestsBySession: Map<string, readonly AskUserRequest[]>
}): React.ReactElement {
  useHydrateAtoms([[allPendingAskUserRequestsAtom, requestsBySession]])
  return <>{children}</>
}

afterEach(() => {
  mock.restore()
})

describe('AskUserBanner', () => {
  test('keeps the footer visible by constraining banner height and scrolling the content region', async () => {
    const sessionId = 'session-1'
    const request: AskUserRequest = {
      requestId: 'ask-request-1',
      sessionId,
      toolInput: {},
      questions: [{
        header: '栏目',
        question: '请选择要继续处理的栏目来源',
        options: [
          { label: '首页推荐', description: '默认推荐位' },
          { label: '新闻资讯', description: '按发布时间排序' },
          { label: '专题活动', description: '按运营配置顺序' },
          { label: '图片轮播', description: '展示轮播图片' },
          { label: '品牌案例', description: '展示案例列表' },
          { label: '下载中心', description: '展示文件资源' },
        ],
      }],
    }

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <HydrateAskUserRequests requestsBySession={new Map([[sessionId, [request]]])}>
            <AskUserBanner sessionId={sessionId} />
          </HydrateAskUserRequests>
        </Provider>,
      )
    })

    const banner = renderer.root.findByProps({ 'data-testid': 'ask-user-banner' })
    const scrollRegion = renderer.root.findByProps({ 'data-testid': 'ask-user-scroll-region' })
    const footer = renderer.root.findByProps({ 'data-testid': 'ask-user-footer' })
    const metaSections = renderer.root.findAll((node) => node.props.className === 'shrink-0 px-4 py-3')

    expect(banner.props.className).toContain('max-h-[min(32rem,calc(100vh-12rem))]')
    expect(banner.props.className).toContain('flex-col')
    expect(scrollRegion.props.className).toContain('overflow-y-auto')
    expect(scrollRegion.props.className).toContain('flex-1')
    expect(scrollRegion.props.className).toContain('pt-3')
    expect(footer.props.className).toContain('shrink-0')
    expect(metaSections).toHaveLength(0)
  })
})
