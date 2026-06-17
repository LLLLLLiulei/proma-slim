import { describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type { PageBuilderProjectSummary } from '@ai-page-builder/shared'
import { PageBuilderHistoryCard } from './PageBuilderHistoryCard'

function createProject(overrides: Partial<PageBuilderProjectSummary> = {}): PageBuilderProjectSummary {
  return {
    workspaceId: 'workspace-1',
    workspaceName: 'History Project',
    workspaceSlug: 'history-project',
    createdAt: 1710000000000,
    lastActiveAt: 1710001000000,
    latestSessionId: 'session-1',
    activeSessionId: null,
    previewUrl: '/api/workspaces/workspace-1/preview/',
    editState: { status: 'available' },
    ...overrides,
  }
}

describe('PageBuilderHistoryCard', () => {
  test('renders metadata and actions in a template-card style body below the preview', () => {
    const project = createProject()

    const renderer = create(
      <PageBuilderHistoryCard
        onDelete={() => {}}
        onEdit={async () => {}}
        onPreview={() => {}}
        project={project}
      />,
    )

    const previewButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '预览项目')
    const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')
    const deleteButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '删除项目')
    const actionRow = renderer.root.findByProps({ 'data-testid': 'page-builder-history-card-actions' })
    const card = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-history-card'),
    )
    const preview = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-history-preview'),
    )
    const previewSurface = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-history-preview-surface'),
    )
    const body = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('px-4')
      && node.props.className.includes('py-3'),
    )
    expect(previewButton).toBeDefined()
    expect(editButton).toBeDefined()
    expect(card.props.className).toContain('rounded-[22px]')
    expect(preview.props.className).toContain('aspect-[4/3]')
    expect(previewSurface.props.className).toContain('rounded-[18px]')
    expect(body.props.className).toContain('space-y-2.5')
    expect(body.props.className).toContain('px-4 py-3')
    expect(previewButton!.props.className).toContain('h-8 rounded-full px-2.5 text-xs')
    expect(previewButton!.props.className).toContain('[&_svg]:size-3.5')
    expect(editButton!.props.className).toContain('h-8 rounded-full px-2.5 text-xs')
    expect(editButton!.props.className).toContain('[&_svg]:size-3.5')
    expect(deleteButton).toBeDefined()
    expect(deleteButton!.props.className).toContain('size-8')
    expect(deleteButton!.props.className).toContain('[&_svg]:size-3.5')
    expect(actionRow.props.className).toContain('flex flex-wrap items-center gap-2')
    expect(actionRow.props.className).not.toContain('absolute')

    const createdAtText = renderer.root.findAll((node) => typeof node.type === 'string').find((node) => {
      const text = node.children.join('')
      return typeof text === 'string' && text.startsWith('创建于 ')
    })

    expect(createdAtText).toBeDefined()
    expect(createdAtText!.children.join('')).toMatch(/创建于 .+\d{2}:\d{2}:\d{2}$/)
  })

  test('renders editor-locked projects with edit still available and delete disabled', () => {
    const project = createProject({
      editState: {
        status: 'locked',
        reason: 'editor',
        expiresAt: 1710002000000,
      },
    })

    const renderer = create(
      <PageBuilderHistoryCard
        onDelete={() => {}}
        onEdit={async () => {}}
        onPreview={() => {}}
        project={project}
      />,
    )

    const buttons = renderer.root.findAllByType('button')
    const previewButton = buttons.find((button) => button.props['aria-label'] === '查看项目')
    const editButton = buttons.find((button) => button.props['aria-label'] === '编辑项目')
    const deleteButton = buttons.find((button) => button.props['aria-label'] === '删除项目')

    expect(JSON.stringify(renderer.toJSON())).toContain('正在编辑')
    expect(previewButton).toBeDefined()
    expect(previewButton!.props.disabled).toBe(false)
    expect(editButton).toBeDefined()
    expect(editButton!.props.disabled).not.toBe(true)
    expect(deleteButton).toBeDefined()
    expect(deleteButton!.props.disabled).toBe(true)
  })

  test('renders agent-busy projects without preview as unavailable to view but still editable', () => {
    const project = createProject({
      previewUrl: null,
      editState: {
        status: 'locked',
        reason: 'agent',
      },
    })

    const renderer = create(
      <PageBuilderHistoryCard
        onDelete={() => {}}
        onEdit={async () => {}}
        onPreview={() => {}}
        project={project}
      />,
    )

    const previewButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '查看项目')
    const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')

    expect(JSON.stringify(renderer.toJSON())).toContain('Agent 处理中')
    expect(JSON.stringify(renderer.toJSON())).toContain('暂无可查看预览')
    expect(previewButton).toBeDefined()
    expect(previewButton!.props.disabled).toBe(true)
    expect(editButton).toBeDefined()
    expect(editButton!.props.disabled).not.toBe(true)
  })

  test('renders active Agent projects with a recoverable lock label', () => {
    const project = createProject({
      editState: {
        status: 'locked',
        reason: 'agent',
        activeSessionId: 'session-active',
      },
    })

    const renderer = create(
      <PageBuilderHistoryCard
        onDelete={() => {}}
        onEdit={async () => {}}
        onPreview={() => {}}
        project={project}
      />,
    )

    const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')

    expect(JSON.stringify(renderer.toJSON())).toContain('Agent 处理中')
    expect(editButton).toBeDefined()
    expect(editButton!.props.disabled).not.toBe(true)
  })

  test('renders export-busy projects with a distinct lock label', () => {
    const project = createProject({
      editState: {
        status: 'locked',
        reason: 'export',
      },
    })

    const renderer = create(
      <PageBuilderHistoryCard
        onDelete={() => {}}
        onEdit={async () => {}}
        onPreview={() => {}}
        project={project}
      />,
    )

    expect(JSON.stringify(renderer.toJSON())).toContain('正在导出')
  })

  test('edits the project name inline and saves with Enter', async () => {
    const project = createProject()
    const onRename = mock(async (_project: PageBuilderProjectSummary, _name: string) => {})
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(
        <PageBuilderHistoryCard
          onDelete={() => {}}
          onEdit={async () => {}}
          onPreview={() => {}}
          onRename={onRename}
          project={project}
        />,
      )
    })

    const titleButton = renderer.root.findAllByType('button').find((button) => button.children.join('') === 'History Project')
    expect(titleButton).toBeDefined()

    await act(async () => {
      titleButton!.props.onClick()
    })

    const input = renderer.root.findByProps({ 'aria-label': '项目名称' })
    expect(input.props.value).toBe('History Project')
    expect(input.props.className).toContain('border-b border-primary/40')
    expect(input.props.className).toContain('bg-transparent px-0 py-0.5 text-sm font-medium outline-none')

    await act(async () => {
      input.props.onChange({ currentTarget: { value: '  Renamed Project  ' } })
    })

    await act(async () => {
      await input.props.onKeyDown({ key: 'Enter', preventDefault: mock(() => {}) })
    })

    expect(onRename).toHaveBeenCalledWith(project, 'Renamed Project')
  })

  test('uses the builder title-bar edit affordance for project names', () => {
    const project = createProject()

    const renderer = create(
      <PageBuilderHistoryCard
        onDelete={() => {}}
        onEdit={async () => {}}
        onPreview={() => {}}
        project={project}
      />,
    )

    const editButton = renderer.root.findByProps({ 'aria-label': '编辑项目名称' })
    expect(editButton.props.className).toContain('p-1 text-muted-foreground transition-colors hover:text-foreground')
    expect(JSON.stringify(renderer.toJSON())).toContain('size-3.5')
  })
})
