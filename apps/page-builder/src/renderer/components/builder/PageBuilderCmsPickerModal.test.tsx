import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type {
  PageBuilderCmsChannel,
  PageBuilderCmsContent,
  PageBuilderCmsSelectionRequest,
} from '@proma/shared'

function createChannel(overrides: Partial<PageBuilderCmsChannel> = {}): PageBuilderCmsChannel {
  return {
    id: 'catalog-1',
    parentId: null,
    siteId: '277',
    name: '新闻中心',
    alias: null,
    path: '/news',
    contentType: 'article',
    contentTypeName: '文章',
    channelType: 'normal',
    treeLevel: 1,
    total: 2,
    childCount: 1,
    hasChild: true,
    link: null,
    children: [],
    ...overrides,
  }
}

function createContent(overrides: Partial<PageBuilderCmsContent> = {}): PageBuilderCmsContent {
  return {
    id: 'item-1',
    catalogId: 'catalog-1',
    mainCatalogId: 'catalog-1',
    title: '头条新闻',
    summary: '最新摘要',
    publishDate: '2026-03-30',
    publishUrl: null,
    contentTypeId: 'article',
    bodyText: null,
    richTitle: null,
    previewAsset: null,
    assets: [],
    mediaCounts: {
      images: 0,
      videos: 0,
      audios: 0,
      files: 0,
    },
    extendData: null,
    ...overrides,
  }
}

function collectText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map((item) => collectText(item)).join('')
  if (React.isValidElement(node)) return collectText(node.props.children)
  return ''
}

function findButtonByText(renderer: ReturnType<typeof create>, text: string) {
  return renderer.root.findAll((node) => {
    if (typeof node.props.onClick !== 'function') return false
    const renderedText = collectText(node.props.children).trim()
    return renderedText.includes(text)
  })[0] ?? null
}

afterEach(() => {
  mock.restore()
})

describe('PageBuilderCmsPickerModal', () => {
  test('loads channels and confirms a single content selection', async () => {
    const listPageBuilderCmsChannels = mock(async () => [createChannel()])
    const listPageBuilderCmsContents = mock(async () => ({
      total: 1,
      pageIndex: 0,
      pageSize: 24,
      items: [createContent()],
    }))

    mock.module('@/lib/api', () => ({
      api: {
        listPageBuilderCmsChannels,
        listPageBuilderCmsContents,
      },
    }))

    const { PageBuilderCmsPickerModal } = await import(`./PageBuilderCmsPickerModal.tsx?test=${Date.now()}-${Math.random()}`)
    const onConfirm = mock(async () => {})
    const onCancel = mock(async () => {})

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PageBuilderCmsPickerModal
          mode="manual"
          onCancel={onCancel}
          onConfirm={onConfirm}
          open
          request={null}
          sessionId="session-1"
          workspaceId="workspace-1"
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const contentCard = findButtonByText(renderer, '头条新闻')
    expect(contentCard).not.toBeNull()

    await act(async () => {
      contentCard!.props.onClick()
    })

    const confirmButton = findButtonByText(renderer, '确认选择')
    expect(confirmButton).not.toBeNull()

    await act(async () => {
      await confirmButton!.props.onClick()
    })

    expect(listPageBuilderCmsChannels).toHaveBeenCalled()
    expect(listPageBuilderCmsContents).toHaveBeenCalledWith({
      catalogId: 'catalog-1',
      pageIndex: 0,
      pageSize: 24,
    })
    expect(onConfirm).toHaveBeenCalledWith({
      sourceType: 'content-item',
      stableId: 'content:catalog-1:item-1',
      displayName: '头条新闻',
      catalogId: 'catalog-1',
      contentId: 'item-1',
      contentTypeId: 'article',
      itemIds: ['item-1'],
      items: [{
        id: 'item-1',
        title: '头条新闻',
        summary: '最新摘要',
      }],
      selector: null,
      presentationHint: null,
    })
  })

  test('returns a child-channel selection when the picker is switched to channel mode', async () => {
    const parent = createChannel({
      id: 'catalog-1',
      name: '新闻中心',
      childCount: 2,
      children: [
        createChannel({
          id: 'catalog-2',
          parentId: 'catalog-1',
          name: '公司新闻',
          hasChild: false,
          childCount: 0,
          children: [],
        }),
      ],
    })

    mock.module('@/lib/api', () => ({
      api: {
        listPageBuilderCmsChannels: mock(async () => [parent]),
        listPageBuilderCmsContents: mock(async () => ({
          total: 0,
          pageIndex: 0,
          pageSize: 24,
          items: [],
        })),
      },
    }))

    const { PageBuilderCmsPickerModal } = await import(`./PageBuilderCmsPickerModal.tsx?test=${Date.now()}-${Math.random()}`)
    const onConfirm = mock(async () => {})

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PageBuilderCmsPickerModal
          mode="agent"
          onCancel={async () => {}}
          onConfirm={onConfirm}
          open
          request={{
            requestId: 'cms-request-1',
            sessionId: 'session-1',
            workspaceId: 'workspace-1',
            action: 'replace-data',
            allowedSourceTypes: ['channel-children'],
          } satisfies PageBuilderCmsSelectionRequest}
          sessionId="session-1"
          workspaceId="workspace-1"
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const confirmButton = findButtonByText(renderer, '确认选择')
    expect(confirmButton).not.toBeNull()

    await act(async () => {
      await confirmButton!.props.onClick()
    })

    expect(onConfirm).toHaveBeenCalledWith({
      sourceType: 'channel-children',
      stableId: 'channel-children:catalog-1',
      displayName: '新闻中心 子栏目',
      channelId: 'catalog-1',
      channelName: '新闻中心',
      selector: null,
      presentationHint: null,
    })
  })
})
