import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type {
  AgentSessionMeta,
  AgentWorkspace,
  PageBuilderTemplateImportResponse,
  PageBuilderTemplateListResponse,
  PageBuilderTemplateRenameRequest,
  PageBuilderTemplateRenameResponse,
  PageBuilderTemplateUseRequest,
  PageBuilderTemplateSummary,
  PageBuilderTemplateUseResponse,
} from '@ai-page-builder/shared'
import { readBootstrapPayload } from '@page-builder/lib/bootstrap-cache'
import { readWorkspacePreviewState } from '@page-builder/lib/preview-state-cache'
import { buildBuilderPath } from '@page-builder/lib/routes'

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const state = new Map(Object.entries(initial))

  return {
    get length() {
      return state.size
    },
    clear() {
      state.clear()
    },
    getItem(key) {
      return state.get(key) ?? null
    },
    key(index) {
      return Array.from(state.keys())[index] ?? null
    },
    removeItem(key) {
      state.delete(key)
    },
    setItem(key, value) {
      state.set(key, value)
    },
  }
}

function installWindowHarness(initialPathname = '/') {
  const sessionStorage = createMemoryStorage()
  const location = { pathname: initialPathname }
  const history = {
    pushState: (_state: unknown, _title: string, pathname: string | URL | null | undefined) => {
      if (!pathname) return
      const nextPathname = typeof pathname === 'string'
        ? new URL(pathname, 'http://localhost').pathname
        : pathname.pathname
      location.pathname = nextPathname
    },
  }
  const dispatchEvent = mock(() => true)
  const open = mock((_url?: string | URL, _target?: string, _features?: string) => ({}))

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage,
      history,
      location,
      dispatchEvent,
      open,
    },
  })

  Object.defineProperty(globalThis, 'PopStateEvent', {
    configurable: true,
    value: class PopStateEvent {
      readonly type: string

      constructor(type: string) {
        this.type = type
      }
    },
  })

  return { dispatchEvent, location, open, sessionStorage }
}

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

function findButtonByAriaLabel(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.find((node) => node.type === 'button' && node.props['aria-label'] === label)
}

function findControlByAriaLabel(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.find((node) => node.props['aria-label'] === label)
}

const template: PageBuilderTemplateSummary = {
  id: 'tpl-1',
  name: '活动页模板',
  description: '适合营销活动页复用',
  tags: ['营销', '活动页'],
  sourceKind: 'saved-project',
  createdAt: '2026-06-15T12:00:00.000Z',
  previewUrl: '/api/page-builder/templates/tpl-1/preview/',
  deletable: true,
}

function createUseResponse(): PageBuilderTemplateUseResponse {
  const workspace: AgentWorkspace = {
    id: 'workspace-from-template',
    name: '活动页模板',
    slug: 'workspace-from-template',
    template: 'page-builder',
    createdAt: 1,
    updatedAt: 1,
  }
  const session: AgentSessionMeta = {
    id: 'session-from-template',
    title: '新 Agent 会话',
    workspaceId: workspace.id,
    createdAt: 1,
    updatedAt: 1,
  }

  return {
    workspace,
    session,
    previewState: {
      hasPreview: true,
      entryUrl: '/api/workspaces/workspace-from-template/preview/',
      revision: 'rev-template',
      hasCmsRendering: false,
      requiresSameOrigin: false,
    },
  }
}

async function loadTemplateLibrarySection(options: {
  importImpl?: (file: File) => Promise<PageBuilderTemplateImportResponse>
  listImpl?: () => Promise<PageBuilderTemplateListResponse>
  renameImpl?: (templateId: string, payload: PageBuilderTemplateRenameRequest) => Promise<PageBuilderTemplateRenameResponse>
  useImpl?: (templateId: string, payload: PageBuilderTemplateUseRequest) => Promise<PageBuilderTemplateUseResponse>
  deleteImpl?: (templateId: string) => Promise<void>
}) {
  const listPageBuilderTemplates = mock(options.listImpl ?? (async () => ({ templates: [template] })))
  const renamePageBuilderTemplate = mock(options.renameImpl ?? (async (_templateId, payload) => ({
    template: {
      ...template,
      name: payload.name,
    },
  })))
  const importPageBuilderTemplate = mock(options.importImpl ?? (async (file) => ({
    template: {
      ...template,
      id: 'tpl-imported-1',
      name: file.name.replace(/\.zip$/i, '') || '导入模板',
      previewUrl: '/api/page-builder/templates/tpl-imported-1/preview/',
    },
  })))
  const usePageBuilderTemplate = mock(options.useImpl ?? (async () => createUseResponse()))
  const deletePageBuilderTemplate = mock(options.deleteImpl ?? (async () => {}))
  const getPageBuilderTemplateDownloadUrl = mock((templateId: string) => `/api/page-builder/templates/${templateId}/download`)
  const toastError = mock(() => {})
  const toastSuccess = mock(() => {})

  mock.module('@/lib/api', () => ({
    api: {
      importPageBuilderTemplate,
      listPageBuilderTemplates,
      renamePageBuilderTemplate,
      usePageBuilderTemplate,
      deletePageBuilderTemplate,
      getPageBuilderTemplateDownloadUrl,
    },
  }))

  mock.module('sonner', () => ({
    toast: {
      error: toastError,
      success: toastSuccess,
    },
  }))

  mock.module('@/components/ui/alert-dialog', () => {
    const passthrough = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', props, children)

    return {
      AlertDialog: passthrough,
      AlertDialogAction: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('button', props, children),
      AlertDialogCancel: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('button', props, children),
      AlertDialogContent: passthrough,
      AlertDialogDescription: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('p', props, children),
      AlertDialogFooter: passthrough,
      AlertDialogHeader: passthrough,
      AlertDialogTitle: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('h2', props, children),
    }
  })

  mock.module('@/components/ui/dialog', () => {
    const passthrough = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', props, children)

    return {
      Dialog: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
      DialogContent: passthrough,
      DialogDescription: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('p', props, children),
      DialogFooter: passthrough,
      DialogHeader: passthrough,
      DialogTitle: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('h2', props, children),
    }
  })

  const module = await import(`./PageBuilderTemplateLibrarySection.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    PageBuilderTemplateLibrarySection: module.PageBuilderTemplateLibrarySection,
    deletePageBuilderTemplate,
    importPageBuilderTemplate,
    getPageBuilderTemplateDownloadUrl,
    listPageBuilderTemplates,
    renamePageBuilderTemplate,
    toastError,
    toastSuccess,
    usePageBuilderTemplate,
  }
}

afterEach(() => {
  mock.restore()
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'PopStateEvent')
})

describe('PageBuilderTemplateLibrarySection', () => {
  test('renders templates with an iframe preview and opens preview/download in a new window', async () => {
    const { open } = installWindowHarness()
    const {
      PageBuilderTemplateLibrarySection,
      getPageBuilderTemplateDownloadUrl,
      listPageBuilderTemplates,
    } = await loadTemplateLibrarySection({})

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('活动页模板')
    expect(json).not.toContain('适合营销活动页复用')
    expect(json).not.toContain('营销')
    expect(json).not.toContain('无标签')
    expect(json).not.toContain('用户另存的静态页面模板')
    expect(json).not.toContain('我的模板')
    const previewFrame = renderer.root.findByType('iframe')
    expect(previewFrame.props.src).toBe(template.previewUrl)
    expect(previewFrame.props.title).toBe('活动页模板 预览')
    expect(previewFrame.props.className).toBe('page-builder-home-template-preview-frame')
    expect(listPageBuilderTemplates).toHaveBeenCalledTimes(1)

    await act(async () => {
      findButtonByAriaLabel(renderer, '预览模板').props.onClick()
    })

    expect(open).toHaveBeenCalledWith(template.previewUrl, '_blank', 'noopener,noreferrer')

    await act(async () => {
      findButtonByAriaLabel(renderer, '下载模板').props.onClick()
    })

    expect(getPageBuilderTemplateDownloadUrl).toHaveBeenCalledWith('tpl-1')
    expect(open).toHaveBeenLastCalledWith('/api/page-builder/templates/tpl-1/download', '_blank', 'noopener,noreferrer')
  })

  test('renames a template from the card title without refreshing the list', async () => {
    installWindowHarness()
    const {
      PageBuilderTemplateLibrarySection,
      listPageBuilderTemplates,
      renamePageBuilderTemplate,
    } = await loadTemplateLibrarySection({})

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    await act(async () => {
      renderer.root.findByProps({ 'aria-label': '编辑模板名称' }).props.onClick()
    })

    const nameInput = findControlByAriaLabel(renderer, '模板名称')
    await act(async () => {
      nameInput.props.onChange({ currentTarget: { value: '  活动页模板-重命名  ' } })
    })

    await act(async () => {
      await nameInput.props.onKeyDown({ key: 'Enter', preventDefault: mock(() => {}) })
    })

    expect(renamePageBuilderTemplate).toHaveBeenCalledWith('tpl-1', { name: '活动页模板-重命名' })
    expect(listPageBuilderTemplates).toHaveBeenCalledTimes(1)
    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('活动页模板-重命名')
    expect(json).not.toContain('活动页模板创建于')
  })

  test('shows empty state and retries after a list failure', async () => {
    installWindowHarness()
    let requestCount = 0
    const { PageBuilderTemplateLibrarySection, listPageBuilderTemplates } = await loadTemplateLibrarySection({
      listImpl: async () => {
        requestCount += 1
        if (requestCount === 1) {
          throw new Error('加载模板失败')
        }
        return { templates: [] }
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('加载模板失败')

    await act(async () => {
      await findButtonByText(renderer, '重试').props.onClick()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('还没有可用模板')
    expect(json).toContain('先在 Builder 中将当前项目另存为模板')
    expect(listPageBuilderTemplates).toHaveBeenCalledTimes(2)
  })

  test('imports a zip template from the header and refreshes the template list', async () => {
    installWindowHarness()
    const importedTemplate: PageBuilderTemplateSummary = {
      ...template,
      id: 'tpl-imported-1',
      name: '导入活动页',
      previewUrl: '/api/page-builder/templates/tpl-imported-1/preview/',
    }
    let requestCount = 0
    const {
      PageBuilderTemplateLibrarySection,
      importPageBuilderTemplate,
      listPageBuilderTemplates,
      toastSuccess,
    } = await loadTemplateLibrarySection({
      listImpl: async () => {
        requestCount += 1
        return { templates: requestCount === 1 ? [] : [importedTemplate] }
      },
      importImpl: async () => ({ template: importedTemplate }),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    expect(findButtonByText(renderer, '导入模板')).toBeDefined()
    const fileInput = renderer.root.find((node) => node.type === 'input' && node.props.type === 'file')
    const zipFile = new File(['zip-bytes'], 'imported-template.zip', { type: 'application/zip' })
    const inputTarget = { files: [zipFile], value: 'C:\\fakepath\\imported-template.zip' }

    await act(async () => {
      await fileInput.props.onChange({ currentTarget: inputTarget })
    })

    expect(importPageBuilderTemplate).toHaveBeenCalledWith(zipFile)
    expect(inputTarget.value).toBe('')
    expect(listPageBuilderTemplates).toHaveBeenCalledTimes(2)
    expect(toastSuccess).toHaveBeenCalledWith('模板「导入活动页」导入成功')
    expect(JSON.stringify(renderer.toJSON())).toContain('导入活动页')
  })

  test('disables duplicate import requests while an import is pending', async () => {
    installWindowHarness()
    let resolveImport!: (value: PageBuilderTemplateImportResponse) => void
    const importPromise = new Promise<PageBuilderTemplateImportResponse>((resolve) => {
      resolveImport = resolve
    })
    const {
      PageBuilderTemplateLibrarySection,
      importPageBuilderTemplate,
    } = await loadTemplateLibrarySection({
      importImpl: async () => await importPromise,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    const fileInput = renderer.root.find((node) => node.type === 'input' && node.props.type === 'file')
    const zipFile = new File(['zip-bytes'], 'pending-template.zip', { type: 'application/zip' })

    await act(async () => {
      fileInput.props.onChange({ currentTarget: { files: [zipFile], value: 'pending-template.zip' } })
    })

    expect(findButtonByText(renderer, '导入中...').props.disabled).toBe(true)

    await act(async () => {
      fileInput.props.onChange({ currentTarget: { files: [zipFile], value: 'pending-template.zip' } })
    })

    expect(importPageBuilderTemplate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveImport({ template })
      await importPromise
    })
  })

  test('shows feedback and keeps the list unchanged when template import fails', async () => {
    installWindowHarness()
    const {
      PageBuilderTemplateLibrarySection,
      importPageBuilderTemplate,
      listPageBuilderTemplates,
      toastError,
    } = await loadTemplateLibrarySection({
      importImpl: async () => {
        throw new Error('导入失败：未找到 index.html')
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    const fileInput = renderer.root.find((node) => node.type === 'input' && node.props.type === 'file')
    const inputTarget = {
      files: [new File(['zip-bytes'], 'broken-template.zip', { type: 'application/zip' })],
      value: 'broken-template.zip',
    }

    await act(async () => {
      await fileInput.props.onChange({ currentTarget: inputTarget })
    })

    expect(importPageBuilderTemplate).toHaveBeenCalledTimes(1)
    expect(inputTarget.value).toBe('')
    expect(listPageBuilderTemplates).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith('导入失败：未找到 index.html')
    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('活动页模板')
    expect(json).toContain('导入失败：未找到 index.html')
    expect(json).not.toContain('broken-template')
  })

  test('asks for a project name before using a template and navigates with preview cache', async () => {
    const { dispatchEvent, location, sessionStorage } = installWindowHarness()
    sessionStorage.setItem('page-builder.bootstrap.session-from-template', JSON.stringify({
      sessionId: 'session-from-template',
      workspaceId: 'workspace-from-template',
      initialPrompt: '不应被保留',
    }))
    const { PageBuilderTemplateLibrarySection, usePageBuilderTemplate } = await loadTemplateLibrarySection({})

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    await act(async () => {
      await findButtonByAriaLabel(renderer, '使用模板').props.onClick()
    })

    expect(usePageBuilderTemplate).toHaveBeenCalledTimes(0)
    const projectNameInput = findControlByAriaLabel(renderer, '项目名称')
    expect(projectNameInput.props.value).toBe('活动页模板')

    await act(async () => {
      projectNameInput.props.onChange({ currentTarget: { value: '  春季活动项目  ' } })
    })

    await act(async () => {
      await findButtonByText(renderer, '创建项目').props.onClick()
    })

    expect(usePageBuilderTemplate).toHaveBeenCalledWith('tpl-1', { projectName: '春季活动项目' })
    expect(location.pathname).toBe(buildBuilderPath('workspace-from-template', 'session-from-template'))
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(readBootstrapPayload(sessionStorage, 'session-from-template')).toBeNull()
    expect(readWorkspacePreviewState(sessionStorage, 'workspace-from-template')).toEqual({
      hasPreview: true,
      entryUrl: '/api/workspaces/workspace-from-template/preview/',
      revision: 'rev-template',
      hasCmsRendering: false,
      requiresSameOrigin: false,
    })
  })

  test('requires a non-empty project name when using a template', async () => {
    installWindowHarness()
    const { PageBuilderTemplateLibrarySection, usePageBuilderTemplate } = await loadTemplateLibrarySection({})

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    await act(async () => {
      await findButtonByAriaLabel(renderer, '使用模板').props.onClick()
    })

    await act(async () => {
      findControlByAriaLabel(renderer, '项目名称').props.onChange({ currentTarget: { value: '   ' } })
    })

    expect(findButtonByText(renderer, '创建项目').props.disabled).toBe(true)
    expect(usePageBuilderTemplate).toHaveBeenCalledTimes(0)
  })

  test('hides template use while keeping template management actions available when use is disabled', async () => {
    installWindowHarness()
    const { PageBuilderTemplateLibrarySection, usePageBuilderTemplate } = await loadTemplateLibrarySection({})

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection, {
        allowTemplateUse: false,
      }))
      await Promise.resolve()
    })

    expect(renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === '预览模板')).toHaveLength(1)
    expect(renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === '下载模板')).toHaveLength(1)
    expect(renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === '导入模板')).toHaveLength(1)
    expect(renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === '使用模板')).toHaveLength(0)
    expect(JSON.stringify(renderer.toJSON())).not.toContain('使用模板')
    expect(usePageBuilderTemplate).toHaveBeenCalledTimes(0)
  })

  test('disables template use while a use request is pending', async () => {
    installWindowHarness()
    let resolveUse!: (value: PageBuilderTemplateUseResponse) => void
    const usePromise = new Promise<PageBuilderTemplateUseResponse>((resolve) => {
      resolveUse = resolve
    })
    const { PageBuilderTemplateLibrarySection, usePageBuilderTemplate } = await loadTemplateLibrarySection({
      useImpl: async () => await usePromise,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    await act(async () => {
      findButtonByAriaLabel(renderer, '使用模板').props.onClick()
    })

    await act(async () => {
      findButtonByText(renderer, '创建项目').props.onClick()
    })

    expect(findButtonByText(renderer, '创建中...').props.disabled).toBe(true)
    expect(findButtonByAriaLabel(renderer, '使用模板').props.disabled).toBe(true)
    expect(usePageBuilderTemplate).toHaveBeenCalledWith('tpl-1', { projectName: '活动页模板' })

    await act(async () => {
      resolveUse(createUseResponse())
      await usePromise
    })
  })

  test('does not navigate or write caches when template use fails', async () => {
    const { location, sessionStorage } = installWindowHarness()
    const { PageBuilderTemplateLibrarySection } = await loadTemplateLibrarySection({
      useImpl: async () => {
        throw new Error('模板不可用')
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    await act(async () => {
      await findButtonByAriaLabel(renderer, '使用模板').props.onClick()
    })
    await act(async () => {
      await findButtonByText(renderer, '创建项目').props.onClick()
    })

    expect(location.pathname).toBe('/')
    expect(readBootstrapPayload(sessionStorage, 'session-from-template')).toBeNull()
    expect(readWorkspacePreviewState(sessionStorage, 'workspace-from-template')).toBeNull()
    expect(JSON.stringify(renderer.toJSON())).toContain('模板不可用')
  })

  test('confirms template deletion and removes the card after success', async () => {
    installWindowHarness()
    const { PageBuilderTemplateLibrarySection, deletePageBuilderTemplate } = await loadTemplateLibrarySection({})

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    await act(async () => {
      findButtonByAriaLabel(renderer, '删除模板').props.onClick()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('删除模板')
    expect(deletePageBuilderTemplate).toHaveBeenCalledTimes(0)

    await act(async () => {
      await findButtonByText(renderer, '确认删除').props.onClick()
    })

    expect(deletePageBuilderTemplate).toHaveBeenCalledWith('tpl-1')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('活动页模板')
  })

  test('keeps the template card and shows feedback when deletion fails', async () => {
    installWindowHarness()
    const { PageBuilderTemplateLibrarySection } = await loadTemplateLibrarySection({
      deleteImpl: async () => {
        throw new Error('删除模板失败')
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderTemplateLibrarySection))
      await Promise.resolve()
    })

    await act(async () => {
      findButtonByAriaLabel(renderer, '删除模板').props.onClick()
    })
    await act(async () => {
      await findButtonByText(renderer, '确认删除').props.onClick()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('活动页模板')
    expect(json).toContain('删除模板失败')
  })
})
