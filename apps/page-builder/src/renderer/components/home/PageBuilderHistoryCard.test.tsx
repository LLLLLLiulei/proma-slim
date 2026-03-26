import { describe, expect, test } from 'bun:test'
import React from 'react'
import { create } from 'react-test-renderer'
import type { PageBuilderProjectSummary } from '@proma/shared'
import { PageBuilderHistoryCard } from './PageBuilderHistoryCard'

describe('PageBuilderHistoryCard', () => {
  test('renders preview as the emphasized primary action and shows created time down to seconds', () => {
    const project: PageBuilderProjectSummary = {
      workspaceId: 'workspace-1',
      workspaceName: 'History Project',
      workspaceSlug: 'history-project',
      createdAt: 1710000000000,
      lastActiveAt: 1710001000000,
      latestSessionId: 'session-1',
      previewUrl: '/api/workspaces/workspace-1/preview/',
    }

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
})
