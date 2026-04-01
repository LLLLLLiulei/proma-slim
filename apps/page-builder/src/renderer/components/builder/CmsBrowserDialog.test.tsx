import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type {
  PageBuilderCmsCatalogList,
  PageBuilderCmsCatalogDetail,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
} from '@proma/shared'

const CATALOGS: PageBuilderCmsCatalogList = {
  items: [
    {
      id: '100',
      name: '首页',
      parentId: null,
      path: 'home/',
      contentType: '',
      contentTypeName: '文章',
      hasChild: true,
      total: 12,
      children: [],
    },
    {
      id: '101',
      name: 'Banner',
      parentId: '100',
      path: 'home/banner/',
      contentType: 'Image',
      contentTypeName: '图片',
      hasChild: false,
      total: 3,
      children: [],
    },
  ],
  tree: [
    {
      id: '100',
      name: '首页',
      parentId: null,
      path: 'home/',
      contentType: '',
      contentTypeName: '文章',
      hasChild: true,
      total: 12,
      children: [
        {
          id: '101',
          name: 'Banner',
          parentId: '100',
          path: 'home/banner/',
          contentType: 'Image',
          contentTypeName: '图片',
          hasChild: false,
          total: 3,
          children: [],
        },
      ],
    },
  ],
}

const CATALOG_DETAILS: Record<string, PageBuilderCmsCatalogDetail> = {
  '100': {
    id: '100',
    innerCode: '001',
    statusCode: 20,
    statusLabel: '启用',
    name: '首页',
    alias: 'home',
    contentType: '',
    contentTypeName: '',
    description: '首页栏目描述',
    logoUrl: 'https://demo.zving.com/zcmstest/assets/images/home.png',
  },
  '101': {
    id: '101',
    innerCode: '002676000004',
    statusCode: 20,
    statusLabel: '启用',
    name: 'Banner',
    alias: 'home_banner',
    contentType: 'Image',
    contentTypeName: '图片',
    description: 'Banner 栏目描述',
    logoUrl: 'https://demo.zving.com/zcmstest/assets/images/addpicture.png',
  },
}

function createContentsPayload(title: string): PageBuilderCmsContentList {
  return {
    pageIndex: 0,
    pageSize: 6,
    total: 12,
    totalPages: 1,
    items: [
      {
        id: '501',
        catalogId: '101',
        title,
        summary: '三张首页图片',
        listLogoUrl: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner-list-logo.jpg',
        addedAt: '2025-04-11 17:48',
        publishUrl: 'https://demo.zving.com/home/banner/501.html',
        shape: 'gallery',
        assetCounts: {
          images: 3,
          audios: 0,
          videos: 0,
          files: 0,
        },
        assetHints: {
          images: [],
          audios: [],
          videos: [],
          files: [],
        },
      },
    ],
  }
}

function createContentItem(id: string, catalogId: string, title: string) {
  return {
    id,
    catalogId,
    title,
    summary: `${title} 摘要`,
    listLogoUrl: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/content-list-logo.jpg',
    addedAt: '2025-04-11 17:48',
    publishUrl: `https://demo.zving.com/${catalogId}/${id}.html`,
    shape: 'gallery' as const,
    assetCounts: {
      images: 3,
      audios: 0,
      videos: 0,
      files: 0,
    },
    assetHints: {
      images: [],
      audios: [],
      videos: [],
      files: [],
    },
  }
}

function flattenText(node: React.ReactNode): string {
  return React.Children.toArray(node).map((child) => {
    if (typeof child === 'string') {
      return child
    }

    if (typeof child === 'number') {
      return String(child)
    }

    if (React.isValidElement(child)) {
      return flattenText(child.props.children)
    }

    return ''
  }).join('')
}

function installUiMocks() {
  let lastTreeProps: Record<string, unknown> | null = null
  let lastPaginationProps: Record<string, unknown> | null = null
  let lastConfigProviderProps: Record<string, unknown> | null = null

  mock.module('@/components/ui/dialog', () => ({
    Dialog: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    DialogContent: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('section', props, children),
    DialogDescription: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('p', props, children),
    DialogHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('header', props, children),
    DialogTitle: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('h2', props, children),
  }))

  mock.module('@/components/ui/tabs', () => {
    const TabsContext = React.createContext<{
      value: string
      onValueChange?: (value: string) => void
    }>({ value: 'catalogs' })

    function TabsTrigger({
      children,
      value,
      ...props
    }: React.PropsWithChildren<{
      value: string
      className?: string
    }>) {
      const context = React.useContext(TabsContext)

      return React.createElement('button', {
        ...props,
        'data-active': context.value === value,
        onClick: () => context.onValueChange?.(value),
        type: 'button',
      }, children)
    }

    function TabsContent({
      children,
      value,
      ...props
    }: React.PropsWithChildren<{
      value: string
      className?: string
    }>) {
      const context = React.useContext(TabsContext)
      if (context.value !== value) {
        return null
      }

      return React.createElement('div', props, children)
    }

    return {
      Tabs: ({
        children,
        onValueChange,
        value,
        ...props
      }: React.PropsWithChildren<{
        onValueChange?: (value: string) => void
        value?: string
        className?: string
      }>) =>
        React.createElement(
          TabsContext.Provider,
          { value: { value: String(value ?? 'catalogs'), onValueChange } },
          React.createElement('div', props, children),
        ),
      TabsList: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('div', props, children),
      TabsTrigger,
      TabsContent,
    }
  })

  mock.module('antd', () => ({
    Alert: ({ children, message, description, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', props, children ?? [message, description].filter(Boolean).join(' ')),
    Checkbox: ({ children, checked, onChange, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(
        'label',
        props,
        React.createElement('input', {
          checked,
          onChange,
          type: 'checkbox',
        }),
        children,
      ),
    Card: ({ children, title, extra, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('article', props, children ?? [title, extra].filter(Boolean).join(' ')),
    ConfigProvider: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      lastConfigProviderProps = props
      return React.createElement(React.Fragment, null, children)
    },
    Empty: ({ description, ...props }: Record<string, unknown>) =>
      React.createElement('div', props, description as React.ReactNode),
    Image: ({ alt, fallback, preview, src, ...props }: Record<string, unknown>) =>
      React.createElement('img', {
        ...props,
        alt: typeof alt === 'string' ? alt : '',
        'data-antd-image': 'true',
        'data-preview': String(Boolean(preview)),
        src: String(src ?? fallback ?? ''),
      }),
    List: ({ children, dataSource, renderItem, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(
        'div',
        props,
        children ?? (Array.isArray(dataSource) && typeof renderItem === 'function'
          ? dataSource.map((item, index) => renderItem(item, index))
          : null),
      ),
    Pagination: (props: Record<string, unknown>) => {
      lastPaginationProps = props
      return React.createElement('div', { 'data-testid': 'cms-pagination' })
    },
    Spin: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', props, children),
    Tag: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('span', props, children),
    Tree: (props: Record<string, unknown>) => {
      lastTreeProps = props
      return React.createElement('div', { 'data-testid': 'cms-tree' })
    },
    Typography: {
      Paragraph: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('p', props, children),
      Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('span', props, children),
      Title: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('h3', props, children),
    },
  }))

  return {
    getLastTreeProps() {
      return lastTreeProps
    },
    getLastPaginationProps() {
      return lastPaginationProps
    },
    getLastConfigProviderProps() {
      return lastConfigProviderProps
    },
  }
}

async function loadCmsBrowserDialog(options?: {
  listCatalogs?: (query?: unknown) => Promise<PageBuilderCmsCatalogList>
  getCatalogDetail?: (catalogId: string) => Promise<PageBuilderCmsCatalogDetail>
  listContents?: (query: PageBuilderCmsContentQuery) => Promise<PageBuilderCmsContentList>
}) {
  const treeHarness = installUiMocks()
  const listCatalogs = options?.listCatalogs ?? mock(async () => CATALOGS)
  const getCatalogDetail = options?.getCatalogDetail ?? mock(async (catalogId: string) => CATALOG_DETAILS[catalogId]!)
  const listContents = options?.listContents ?? mock(async () => createContentsPayload('首页轮播图'))

  mock.module('@/lib/api', () => ({
    api: {
      listPageBuilderCmsCatalogs: listCatalogs,
      getPageBuilderCmsCatalogDetail: getCatalogDetail,
      listPageBuilderCmsContents: listContents,
    },
  }))

  const module = await import(`./CmsBrowserDialog.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    CmsBrowserDialog: module.CmsBrowserDialog,
    listCatalogs,
    getCatalogDetail,
    listContents,
    ...treeHarness,
  }
}

afterEach(() => {
  mock.restore()
})

describe('CmsBrowserDialog', () => {
  test('loads catalogs on open and uses the first available catalog when the user switches to contents without a prior selection', async () => {
    const { CmsBrowserDialog, listCatalogs, listContents, getLastTreeProps } = await loadCmsBrowserDialog()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listCatalogs).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(renderer.toJSON())).toContain('从 CMS 选择数据')
    expect((getLastTreeProps() as { treeData?: Array<{ key: string }> } | null)?.treeData?.[0]?.key).toBe('100')

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listContents).toHaveBeenCalledWith(expect.objectContaining({
      catalogId: '100',
    }))
    expect(JSON.stringify(renderer.toJSON())).toContain('首页轮播图')
  })

  test('keeps catalog checkbox selection independent from the content tab current catalog', async () => {
    const { CmsBrowserDialog, listContents, getLastTreeProps } = await loadCmsBrowserDialog({
      listContents: mock(async () => createContentsPayload('Banner 二级栏目内容')),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastTreeProps() as {
        onCheck?: (checkedKeys: string[]) => void
      } | null)?.onCheck?.(['101'])
    })

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listContents).toHaveBeenCalledWith(expect.objectContaining({
      catalogId: '100',
    }))
    expect(JSON.stringify(renderer.toJSON())).toContain('Banner 二级栏目内容')
  })

  test('renders readonly catalog detail for the highlighted catalog in the catalogs tab', async () => {
    const { CmsBrowserDialog, getCatalogDetail, getLastTreeProps } = await loadCmsBrowserDialog()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getCatalogDetail).toHaveBeenCalledWith('100')
    expect(JSON.stringify(renderer.toJSON())).toContain('首页栏目描述')
    expect(JSON.stringify(renderer.toJSON())).toContain('内部编码')
    expect(JSON.stringify(renderer.toJSON())).toContain('001')

    await act(async () => {
      (getLastTreeProps() as {
        onSelect?: (selectedKeys: string[]) => void
      } | null)?.onSelect?.(['101'])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getCatalogDetail).toHaveBeenCalledWith('101')
    expect(JSON.stringify(renderer.toJSON())).toContain('Banner 栏目描述')
    expect(JSON.stringify(renderer.toJSON())).toContain('home_banner')
    expect(JSON.stringify(renderer.toJSON())).toContain('/api/page-builder/cms/assets?url=')
  })

  test('shows an error state with retry when catalog loading fails', async () => {
    let attempts = 0
    const { CmsBrowserDialog, listCatalogs, getLastTreeProps } = await loadCmsBrowserDialog({
      listCatalogs: mock(async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Error('CMS 鉴权失败')
        }

        return CATALOGS
      }),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('CMS 鉴权失败')

    const retryButton = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '重试')

    await act(async () => {
      retryButton?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listCatalogs).toHaveBeenCalledTimes(2)
    expect((getLastTreeProps() as { treeData?: Array<{ key: string }> } | null)?.treeData?.[0]?.key).toBe('100')
  })

  test('shows an empty state when the current catalog has no content', async () => {
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({
      listContents: mock(async () => ({
        pageIndex: 0,
        pageSize: 20,
        total: 0,
        totalPages: 1,
        items: [],
      })),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('当前栏目暂无内容')
  })

  test('keeps the dialog shell in a flex column layout and uses a compact contents error state', async () => {
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({
      listContents: mock(async () => {
        throw new Error('CMS 内容鉴权失败')
      }),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    const dialogShell = renderer.root.findByType('section')
    expect(String(dialogShell.props.className ?? '')).toContain('!flex')
    expect(String(dialogShell.props.className ?? '')).toContain('!flex-col')

    expect(renderer.root.findAllByProps({
      className: 'page-builder-cms-state page-builder-cms-state-stack page-builder-cms-state-compact',
    })).toHaveLength(1)
  })

  test('requests another contents page when pagination changes', async () => {
    const { CmsBrowserDialog, listContents, getLastConfigProviderProps, getLastPaginationProps } = await loadCmsBrowserDialog({
      listContents: mock(async (query: PageBuilderCmsContentQuery) => ({
        ...createContentsPayload(`第 ${(query.pageIndex ?? 0) + 1} 页内容`),
        pageIndex: query.pageIndex ?? 0,
        pageSize: query.pageSize ?? 6,
        total: 12,
        totalPages: 2,
      })),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listContents).toHaveBeenCalledWith(expect.objectContaining({
      catalogId: '100',
      pageIndex: 0,
      pageSize: 6,
    }))

    expect(getLastPaginationProps()).toEqual(expect.objectContaining({
      pageSize: 6,
      pageSizeOptions: ['6', '12', '24'],
      showSizeChanger: expect.objectContaining({
        showSearch: false,
      }),
    }))
    expect(getLastConfigProviderProps()).toEqual(expect.objectContaining({
      locale: expect.any(Object),
    }))

    await act(async () => {
      (getLastPaginationProps() as { onChange?: (page: number, pageSize: number) => void } | null)?.onChange?.(2, 6)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listContents).toHaveBeenCalledWith(expect.objectContaining({
      catalogId: '100',
      pageIndex: 1,
      pageSize: 6,
    }))

    await act(async () => {
      (getLastPaginationProps() as { onChange?: (page: number, pageSize: number) => void } | null)?.onChange?.(1, 12)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listContents).toHaveBeenCalledWith(expect.objectContaining({
      catalogId: '100',
      pageIndex: 0,
      pageSize: 12,
    }))
  })

  test('confirms checked catalogs from the catalogs tab', async () => {
    const onConfirmSelection = mock(() => {})
    const { CmsBrowserDialog, getLastTreeProps } = await loadCmsBrowserDialog()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog onConfirmSelection={onConfirmSelection} open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastTreeProps() as {
        onCheck?: (checkedKeys: string[]) => void
      } | null)?.onCheck?.(['100', '101'])
      await Promise.resolve()
    })

    const confirmButton = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '确认选择')

    expect(confirmButton).not.toBeUndefined()

    await act(async () => {
      confirmButton?.props.onClick()
      await Promise.resolve()
    })

    expect(onConfirmSelection).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'catalogs',
      catalogs: [
        expect.objectContaining({ id: '100' }),
        expect.objectContaining({ id: '101' }),
      ],
      contents: [],
    }))
  })

  test('clears checked contents when switching content catalogs and confirms the current checked contents', async () => {
    const onConfirmSelection = mock(() => {})
    const { CmsBrowserDialog, getLastTreeProps } = await loadCmsBrowserDialog({
      listContents: mock(async (query: PageBuilderCmsContentQuery) => ({
        pageIndex: query.pageIndex ?? 0,
        pageSize: query.pageSize ?? 6,
        total: 2,
        totalPages: 1,
        items: [
          createContentItem(`${query.catalogId}-1`, query.catalogId, `内容 ${query.catalogId}`),
        ],
      })),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog onConfirmSelection={onConfirmSelection} open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    const firstCheckbox = renderer.root.findAllByType('input')[0]

    await act(async () => {
      firstCheckbox?.props.onChange?.({ target: { checked: true } })
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('已选 1 条内容')

    await act(async () => {
      (getLastTreeProps() as {
        onSelect?: (selectedKeys: string[]) => void
      } | null)?.onSelect?.(['101'])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('已选 0 条内容')
    expect(JSON.stringify(renderer.toJSON())).toContain('内容 101')

    const secondCheckbox = renderer.root.findAllByType('input')[0]
    await act(async () => {
      secondCheckbox?.props.onChange?.({ target: { checked: true } })
      await Promise.resolve()
    })

    const confirmButton = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '确认选择')

    await act(async () => {
      confirmButton?.props.onClick()
      await Promise.resolve()
    })

    expect(onConfirmSelection).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'contents',
      catalogs: [],
      contents: [
        expect.objectContaining({
          id: '101-1',
          catalogId: '101',
          title: '内容 101',
        }),
      ],
    }))
  })

  test('toggles content selection when the user clicks a card', async () => {
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({
      listContents: mock(async () => ({
        pageIndex: 0,
        pageSize: 6,
        total: 1,
        totalPages: 1,
        items: [
          createContentItem('501', '101', '可点击内容卡片'),
        ],
      })),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('已选 0 条内容')

    const firstCard = renderer.root.findAllByType('article')[0]

    await act(async () => {
      firstCard?.props.onClick?.()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('已选 1 条内容')

    await act(async () => {
      firstCard?.props.onClick?.()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('已选 0 条内容')
  })

  test('renders cms content cards with proxied listLogo, added time, and single-line summary metadata', async () => {
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({
      listContents: mock(async () => createContentsPayload('带 Logo 的内容')),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    const tree = JSON.stringify(renderer.toJSON())

    expect(tree).toContain('2025-04-11 17:48')
    expect(tree).toContain('/api/page-builder/cms/assets?url=')
    expect(tree).not.toContain('图片 3')
    expect(tree).not.toContain('无素材')
    expect(tree).not.toContain('预览')

    const summaryParagraph = renderer.root.findAllByProps({
      className: 'page-builder-cms-content-summary',
    })[0]
    expect(summaryParagraph?.props.ellipsis).toEqual({
      rows: 1,
    })
  })

  test('renders a default preview image when content has no logo', async () => {
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({
      listContents: mock(async () => ({
        pageIndex: 0,
        pageSize: 6,
        total: 1,
        totalPages: 1,
        items: [
          {
            ...createContentItem('fallback-1', '101', '无 Logo 内容'),
            listLogoUrl: undefined,
            assetHints: {
              images: [],
              audios: [],
              videos: [],
              files: [],
            },
          },
        ],
      })),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    const previewImages = renderer.root.findAll((node) =>
      node.type === 'img' && node.props['data-antd-image'] === 'true',
    )

    expect(previewImages.length).toBeGreaterThan(0)
    expect(String(previewImages[0]?.props.src ?? '')).toContain('data:image/svg+xml')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('page-builder-cms-content-thumb-badge')
  })

  test('renders the shared default preview image when catalog detail has no logo', async () => {
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({
      getCatalogDetail: mock(async (catalogId: string) => ({
        ...CATALOG_DETAILS[catalogId]!,
        logoUrl: undefined,
      })),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const previewImages = renderer.root.findAll((node) =>
      node.type === 'img' && node.props['data-antd-image'] === 'true',
    )

    expect(previewImages.length).toBeGreaterThan(0)
    expect(String(previewImages[0]?.props.src ?? '')).toContain('data:image/svg+xml')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('page-builder-cms-catalog-detail-logo-empty')
  })

  test('does not render summary text when content summary is empty', async () => {
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({
      listContents: mock(async () => ({
        pageIndex: 0,
        pageSize: 6,
        total: 1,
        totalPages: 1,
        items: [
          {
            ...createContentItem('empty-summary', '101', '空摘要内容'),
            summary: '',
          },
        ],
      })),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const contentsTab = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '内容')

    await act(async () => {
      contentsTab?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).not.toContain('暂无摘要')
    expect(renderer.root.findAllByProps({
      className: 'page-builder-cms-content-summary',
    })).toHaveLength(0)
  })
})
