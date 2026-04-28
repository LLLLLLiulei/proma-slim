import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type {
  PageBuilderCmsCatalogList,
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsCatalogDetail,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
  PageBuilderCmsSiteSummary,
  PageBuilderCmsSelectionRequestContext,
  PageBuilderCmsSelectionResult,
} from '@proma/shared'
import { PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION } from '@proma/shared'

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

const REQUEST_CONTEXT = {
  entryPoint: 'block-toolbar',
  targetSelection: {
    kind: 'block',
    selector: '#hero-banner',
    parentBlockSelector: '#hero-banner',
    editBoundary: 'block',
  },
  targetBlock: {
    selector: '#hero-banner',
  },
} satisfies PageBuilderCmsSelectionRequestContext

const CMS_SITES: PageBuilderCmsSiteSummary[] = [
  {
    id: '1',
    name: '主站',
    url: 'https://demo.zving.com',
    parentId: null,
    branchInnerCode: '0001',
  },
  {
    id: '14',
    name: '新闻站',
    url: 'https://news.demo.zving.com',
    parentId: '1',
    branchInnerCode: '000114',
  },
]

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
  }
}

function createCatalogsForSite(rootId: string, childId: string, rootName: string): PageBuilderCmsCatalogList {
  return {
    items: [
      {
        id: rootId,
        name: rootName,
        parentId: null,
        path: `${rootName}/`,
        contentType: '',
        contentTypeName: '文章',
        hasChild: true,
        total: 12,
        children: [],
      },
      {
        id: childId,
        name: `${rootName} Banner`,
        parentId: rootId,
        path: `${rootName}/banner/`,
        contentType: 'Image',
        contentTypeName: '图片',
        hasChild: false,
        total: 3,
        children: [],
      },
    ],
    tree: [
      {
        id: rootId,
        name: rootName,
        parentId: null,
        path: `${rootName}/`,
        contentType: '',
        contentTypeName: '文章',
        hasChild: true,
        total: 12,
        children: [
          {
            id: childId,
            name: `${rootName} Banner`,
            parentId: rootId,
            path: `${rootName}/banner/`,
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
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
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
  listSites?: () => Promise<PageBuilderCmsSiteSummary[]>
  listCatalogs?: (query?: PageBuilderCmsCatalogQuery) => Promise<PageBuilderCmsCatalogList>
  getCatalogDetail?: (catalogId: string, siteId?: string) => Promise<PageBuilderCmsCatalogDetail>
  listContents?: (query: PageBuilderCmsContentQuery) => Promise<PageBuilderCmsContentList>
}) {
  const treeHarness = installUiMocks()
  const listSites = options?.listSites ?? mock(async () => CMS_SITES)
  const listCatalogs = options?.listCatalogs ?? mock(async () => CATALOGS)
  const getCatalogDetail = options?.getCatalogDetail ?? mock(async (catalogId: string) => CATALOG_DETAILS[catalogId]!)
  const listContents = options?.listContents ?? mock(async () => createContentsPayload('首页轮播图'))

  mock.module('@/lib/api', () => ({
    api: {
      listPageBuilderCmsSites: listSites,
      listPageBuilderCmsCatalogs: listCatalogs,
      getPageBuilderCmsCatalogDetail: getCatalogDetail,
      listPageBuilderCmsContents: listContents,
    },
  }))

  const module = await import(`./CmsBrowserDialog.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    CmsBrowserDialog: module.CmsBrowserDialog,
    listSites,
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
    expect(listCatalogs).toHaveBeenCalledWith({ siteId: '1' })
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
      siteId: '1',
      catalogId: '100',
    }))
    expect(JSON.stringify(renderer.toJSON())).toContain('首页轮播图')
  })

  test('reloads content data when returning to the content tab instead of reusing a cached page', async () => {
    let requestCount = 0
    const listContents = mock(async () => {
      requestCount += 1
      return createContentsPayload(`实时内容 ${requestCount}`)
    })
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({ listContents })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const findTab = (label: string) => renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === label)

    await act(async () => {
      findTab('内容')?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listContents).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(renderer.toJSON())).toContain('实时内容 1')

    await act(async () => {
      findTab('栏目')?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      findTab('内容')?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listContents).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(renderer.toJSON())).toContain('实时内容 2')
  })

  test('reloads catalog data when returning to the catalog tab', async () => {
    const listCatalogs = mock(async () => CATALOGS)
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({ listCatalogs })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const findTab = (label: string) => renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === label)

    expect(listCatalogs).toHaveBeenCalledTimes(1)

    await act(async () => {
      findTab('内容')?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      findTab('栏目')?.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listCatalogs).toHaveBeenCalledTimes(2)
  })

  test('keeps catalog checkbox selection independent from the content tab single checked catalog', async () => {
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

    expect(getLastTreeProps()).toEqual(expect.objectContaining({
      checkable: true,
      checkStrictly: true,
      checkedKeys: ['100'],
      selectedKeys: ['100'],
    }))
    expect(listContents).toHaveBeenCalledWith(expect.objectContaining({
      siteId: '1',
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

    expect(getCatalogDetail).toHaveBeenCalledWith('100', '1')
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

    expect(getCatalogDetail).toHaveBeenCalledWith('101', '1')
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
      siteId: '1',
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
      siteId: '1',
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
      siteId: '1',
      catalogId: '100',
      pageIndex: 0,
      pageSize: 12,
    }))
  })

  test('switching site resets checked state and refetches site-scoped catalogs and contents', async () => {
    const listCatalogs = mock(async () => CATALOGS)
    const listContents = mock(async (query: PageBuilderCmsContentQuery) => ({
      pageIndex: query.pageIndex ?? 0,
      pageSize: query.pageSize ?? 6,
      total: 1,
      totalPages: 1,
      items: [
        createContentItem(
          `${query.siteId ?? '1'}-${query.catalogId ?? 'catalog'}-1`,
          query.catalogId ?? 'catalog',
          `内容 ${query.catalogId ?? 'catalog'}`,
        ),
      ],
    }))
    const { CmsBrowserDialog, getLastTreeProps } = await loadCmsBrowserDialog({
      listCatalogs,
      listContents,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} requestContext={REQUEST_CONTEXT} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastTreeProps() as {
        onCheck?: (checkedKeys: string[]) => void
      } | null)?.onCheck?.(['100'])
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
    expect(listCatalogs).toHaveBeenCalledWith({ siteId: '1' })
    expect(listContents).toHaveBeenCalledWith(expect.objectContaining({
      siteId: '1',
      catalogId: '100',
    }))

    const siteSelect = renderer.root.findByType('select')
    await act(async () => {
      siteSelect.props.onChange?.({ target: { value: '14' } })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listCatalogs).toHaveBeenCalledWith({ siteId: '14' })
    expect(JSON.stringify(renderer.toJSON())).toContain('将使用当前栏目下的内容列表')
  })

  test('ignores stale catalog responses from the previous site after switching site', async () => {
    const site1Catalogs = createDeferred<PageBuilderCmsCatalogList>()
    const site14Catalogs = createDeferred<PageBuilderCmsCatalogList>()
    const listCatalogs = mock(async (query?: PageBuilderCmsCatalogQuery) => {
      if (query?.siteId === '14') {
        return site14Catalogs.promise
      }

      return site1Catalogs.promise
    })
    const { CmsBrowserDialog, getLastTreeProps } = await loadCmsBrowserDialog({
      listCatalogs,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} requestContext={REQUEST_CONTEXT} />,
      )
      await Promise.resolve()
    })

    const siteSelect = renderer.root.findByType('select')
    await act(async () => {
      siteSelect.props.onChange?.({ target: { value: '14' } })
      await Promise.resolve()
    })

    await act(async () => {
      site14Catalogs.resolve(createCatalogsForSite('200', '201', '新闻站'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect((getLastTreeProps() as { treeData?: Array<{ key: string }> } | null)?.treeData?.[0]?.key).toBe('200')

    await act(async () => {
      site1Catalogs.resolve(createCatalogsForSite('100', '101', '主站'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect((getLastTreeProps() as { treeData?: Array<{ key: string }> } | null)?.treeData?.[0]?.key).toBe('200')
  })

  test('ignores stale contents responses from the previous site after switching site', async () => {
    const listCatalogs = mock(async (query?: PageBuilderCmsCatalogQuery) => {
      return query?.siteId === '14'
        ? createCatalogsForSite('200', '201', '新闻站')
        : createCatalogsForSite('100', '101', '主站')
    })
    const site1Contents = createDeferred<PageBuilderCmsContentList>()
    const site14Contents = createDeferred<PageBuilderCmsContentList>()
    const listContents = mock(async (query: PageBuilderCmsContentQuery) => {
      if (query.siteId === '14') {
        return site14Contents.promise
      }

      return site1Contents.promise
    })
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({
      listCatalogs,
      listContents,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} requestContext={REQUEST_CONTEXT} />,
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

    const siteSelect = renderer.root.findByType('select')
    await act(async () => {
      siteSelect.props.onChange?.({ target: { value: '14' } })
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      site14Contents.resolve({
        pageIndex: 0,
        pageSize: 6,
        total: 1,
        totalPages: 1,
        items: [createContentItem('200-1', '200', '新闻站内容')],
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('新闻站内容')

    await act(async () => {
      site1Contents.resolve({
        pageIndex: 0,
        pageSize: 6,
        total: 1,
        totalPages: 1,
        items: [createContentItem('100-1', '100', '主站内容')],
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('新闻站内容')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('主站内容')
  })

  test('confirms the highlighted catalog as a parent-source selection when no fixed catalogs are checked', async () => {
    const onConfirmSelection = mock(() => {})
    const { CmsBrowserDialog } = await loadCmsBrowserDialog()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog
          onConfirmSelection={onConfirmSelection}
          open
          onOpenChange={() => {}}
          requestContext={REQUEST_CONTEXT}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const confirmButton = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '确认选择')

    expect(confirmButton).not.toBeUndefined()
    expect(confirmButton?.props.disabled).toBe(false)

    await act(async () => {
      confirmButton?.props.onClick()
      await Promise.resolve()
    })

    expect(onConfirmSelection).toHaveBeenCalledTimes(1)

    const [[selection]] = onConfirmSelection.mock.calls as unknown as [[PageBuilderCmsSelectionResult]]
    expect(selection).toMatchObject({
      version: PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION,
      siteId: '1',
      targetSelection: {
        kind: 'block',
        selector: '#hero-banner',
        parentBlockSelector: '#hero-banner',
        editBoundary: 'block',
      },
      targetBlock: {
        selector: '#hero-banner',
      },
      selectionKind: 'catalogs',
      sourceType: 'catalogs-by-parent',
      selectionMode: 'children-of-parent',
      parentCatalogId: '100',
      snapshot: {
        parentCatalog: expect.objectContaining({ id: '100' }),
      },
    })
    expect(selection).not.toHaveProperty('tab')
    expect(selection).not.toHaveProperty('contents')
    expect(selection).not.toHaveProperty('querySpec')
    expect(selection).not.toHaveProperty('limit')
    expect(selection).not.toHaveProperty('catalogIds')
  })

  test('confirms fixed catalog ids when one or more catalogs are checked', async () => {
    const onConfirmSelection = mock(() => {})
    const { CmsBrowserDialog, getLastTreeProps } = await loadCmsBrowserDialog()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog
          onConfirmSelection={onConfirmSelection}
          open
          onOpenChange={() => {}}
          requestContext={REQUEST_CONTEXT}
        />,
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

    await act(async () => {
      confirmButton?.props.onClick()
      await Promise.resolve()
    })

    expect(onConfirmSelection).toHaveBeenCalledTimes(1)

    const [[selection]] = onConfirmSelection.mock.calls as unknown as [[PageBuilderCmsSelectionResult]]
    expect(selection).toMatchObject({
      version: PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION,
      siteId: '1',
      targetSelection: {
        kind: 'block',
        selector: '#hero-banner',
        parentBlockSelector: '#hero-banner',
        editBoundary: 'block',
      },
      targetBlock: {
        selector: '#hero-banner',
      },
      selectionKind: 'catalogs',
      sourceType: 'catalogs-by-ids',
      selectionMode: 'fixed-items',
      catalogIds: ['100', '101'],
      snapshot: {
        catalogs: [
          expect.objectContaining({ id: '100' }),
          expect.objectContaining({ id: '101' }),
        ],
      },
    })
    expect(selection).not.toHaveProperty('parentCatalogId')
  })

  test('disables parent-source confirmation when the highlighted catalog has no direct children', async () => {
    const onConfirmSelection = mock(() => {})
    const { CmsBrowserDialog, getLastTreeProps } = await loadCmsBrowserDialog()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog
          onConfirmSelection={onConfirmSelection}
          open
          onOpenChange={() => {}}
          requestContext={REQUEST_CONTEXT}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastTreeProps() as {
        onSelect?: (selectedKeys: string[]) => void
      } | null)?.onSelect?.(['101'])
      await Promise.resolve()
      await Promise.resolve()
    })

    const confirmButton = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '确认选择')

    expect(confirmButton?.props.disabled).toBe(true)
    expect(JSON.stringify(renderer.toJSON())).toContain('当前栏目下没有可用子栏目')

    await act(async () => {
      confirmButton?.props.onClick()
      await Promise.resolve()
    })

    expect(onConfirmSelection).toHaveBeenCalledTimes(0)
  })

  test('confirms the highlighted catalog as a dynamic contents source when no fixed content is checked', async () => {
    const onConfirmSelection = mock(() => {})
    const { CmsBrowserDialog } = await loadCmsBrowserDialog({
      listContents: mock(async () => createContentsPayload('首页轮播图')),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog
          onConfirmSelection={onConfirmSelection}
          open
          onOpenChange={() => {}}
          requestContext={REQUEST_CONTEXT}
        />,
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

    const confirmButton = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '确认选择')

    expect(confirmButton?.props.disabled).toBe(false)

    await act(async () => {
      confirmButton?.props.onClick()
      await Promise.resolve()
    })

    expect(onConfirmSelection).toHaveBeenCalledTimes(1)

    const [[selection]] = onConfirmSelection.mock.calls as unknown as [[PageBuilderCmsSelectionResult]]
    expect(selection).toMatchObject({
      version: PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION,
      siteId: '1',
      targetSelection: {
        kind: 'block',
        selector: '#hero-banner',
        parentBlockSelector: '#hero-banner',
        editBoundary: 'block',
      },
      targetBlock: {
        selector: '#hero-banner',
      },
      selectionKind: 'contents',
      sourceType: 'contents-by-catalog',
      selectionMode: 'by-catalog',
      catalogId: '100',
      snapshot: {
        catalog: expect.objectContaining({ id: '100' }),
      },
    })
    expect(selection).not.toHaveProperty('contentIds')
  })

  test('clears checked contents when switching content catalogs and confirms fixed content ids', async () => {
    const onConfirmSelection = mock(() => {})
    const { CmsBrowserDialog, getLastTreeProps } = await loadCmsBrowserDialog({
      listContents: mock(async (query: PageBuilderCmsContentQuery) => ({
        pageIndex: query.pageIndex ?? 0,
        pageSize: query.pageSize ?? 6,
        total: 2,
        totalPages: 1,
        items: [
          createContentItem(`${query.catalogId ?? 'catalog'}-1`, query.catalogId ?? 'catalog', `内容 ${query.catalogId ?? 'catalog'} - A`),
          createContentItem(`${query.catalogId ?? 'catalog'}-2`, query.catalogId ?? 'catalog', `内容 ${query.catalogId ?? 'catalog'} - B`),
        ],
      })),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog
          onConfirmSelection={onConfirmSelection}
          open
          onOpenChange={() => {}}
          requestContext={REQUEST_CONTEXT}
        />,
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

    expect(JSON.stringify(renderer.toJSON())).toContain('将使用当前栏目下的内容列表')
    expect(JSON.stringify(renderer.toJSON())).toContain('内容 101')

    const [secondCheckbox, thirdCheckbox] = renderer.root.findAllByType('input')
    await act(async () => {
      secondCheckbox?.props.onChange?.({ target: { checked: true } })
      thirdCheckbox?.props.onChange?.({ target: { checked: true } })
      await Promise.resolve()
    })

    const confirmButton = renderer.root.findAllByType('button')
      .find((button) => flattenText(button.props.children).trim() === '确认选择')

    await act(async () => {
      confirmButton?.props.onClick()
      await Promise.resolve()
    })

    expect(onConfirmSelection).toHaveBeenCalledTimes(1)

    const [[selection]] = onConfirmSelection.mock.calls as unknown as [[PageBuilderCmsSelectionResult]]
    expect(selection).toMatchObject({
      version: PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION,
      siteId: '1',
      targetSelection: {
        kind: 'block',
        selector: '#hero-banner',
        parentBlockSelector: '#hero-banner',
        editBoundary: 'block',
      },
      targetBlock: {
        selector: '#hero-banner',
      },
      selectionKind: 'contents',
      sourceType: 'contents-by-ids',
      selectionMode: 'fixed-items',
      catalogId: '101',
      contentIds: ['101-1', '101-2'],
      snapshot: {
        contents: [
          expect.objectContaining({
            id: '101-1',
            catalogId: '101',
            title: '内容 101 - A',
          }),
          expect.objectContaining({
            id: '101-2',
            catalogId: '101',
            title: '内容 101 - B',
          }),
        ],
      },
    })
    expect(selection).not.toHaveProperty('tab')
    expect(selection).not.toHaveProperty('catalogs')
    expect(selection).not.toHaveProperty('latestByCatalog')
    expect(selection).not.toHaveProperty('querySpec')
    expect(selection).not.toHaveProperty('limit')
    expect(selection).not.toHaveProperty('catalogIds')
  })

  test('clears the current content catalog when the only checked tree node is unchecked', async () => {
    const listContents = mock(async (query: PageBuilderCmsContentQuery) => ({
      pageIndex: query.pageIndex ?? 0,
      pageSize: query.pageSize ?? 6,
      total: 1,
      totalPages: 1,
      items: [
        createContentItem(
          `${query.catalogId ?? 'catalog'}-1`,
          query.catalogId ?? 'catalog',
          `内容 ${query.catalogId ?? 'catalog'}`,
        ),
      ],
    }))
    const { CmsBrowserDialog, getLastTreeProps } = await loadCmsBrowserDialog({
      listContents,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <CmsBrowserDialog open onOpenChange={() => {}} requestContext={REQUEST_CONTEXT} />,
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

    await act(async () => {
      (getLastTreeProps() as {
        onCheck?: (checkedKeys: { checked?: string[] }) => void
      } | null)?.onCheck?.({ checked: ['101'] })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('内容 101')
    expect(listContents).toHaveBeenCalledWith(expect.objectContaining({
      siteId: '1',
      catalogId: '101',
    }))

    await act(async () => {
      (getLastTreeProps() as {
        onCheck?: (checkedKeys: { checked?: string[] }) => void
      } | null)?.onCheck?.({ checked: [] })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastTreeProps()).toEqual(expect.objectContaining({
      checkedKeys: [],
      selectedKeys: [],
    }))
    expect(JSON.stringify(renderer.toJSON())).toContain('请选择栏目')
    expect(listContents).toHaveBeenCalledTimes(2)
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

    expect(JSON.stringify(renderer.toJSON())).toContain('将使用当前栏目下的内容列表')

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

    expect(JSON.stringify(renderer.toJSON())).toContain('将使用当前栏目下的内容列表')
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
    const metaRow = renderer.root.findAllByProps({
      className: 'page-builder-cms-content-meta',
    })[0]

    expect(tree).toContain('2025-04-11 17:48')
    expect(tree).toContain('/api/page-builder/cms/assets?url=')
    expect(flattenText(metaRow?.props.children)).toBe('2025-04-11 17:48')
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
