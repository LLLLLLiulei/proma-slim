import { describe, expect, test } from 'bun:test'
import React from 'react'
import { create } from 'react-test-renderer'
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
    previewUrl: '/api/workspaces/workspace-1/preview/',
    editState: { status: 'available' },
    ...overrides,
  }
}

describe('PageBuilderHistoryCard', () => {
  test('renders preview as the emphasized primary action and shows created time down to seconds', () => {
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
    expect(previewButton).toBeDefined()
    expect(editButton).toBeDefined()
    expect(previewButton!.props.className).toContain('page-builder-home-history-action-primary')
    expect(editButton!.props.className).toContain('page-builder-home-history-action-secondary')

    const createdAtText = renderer.root.findAllByType('p').find((node) => {
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

    expect(JSON.stringify(renderer.toJSON())).toContain('正在构建')
    expect(JSON.stringify(renderer.toJSON())).toContain('暂无可查看预览')
    expect(previewButton).toBeDefined()
    expect(previewButton!.props.disabled).toBe(true)
    expect(editButton).toBeDefined()
    expect(editButton!.props.disabled).not.toBe(true)
  })
})
