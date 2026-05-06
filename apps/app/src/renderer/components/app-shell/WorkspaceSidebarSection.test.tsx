import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AgentWorkspace } from '@ai-page-builder/shared'
import {
  WorkspaceSidebarSection,
  getWorkspaceDeleteBlockedReason,
  resolveWorkspaceSelectionFallback,
} from './WorkspaceSidebarSection'

const defaultWorkspace: AgentWorkspace = {
  id: 'workspace-default',
  name: '默认工作区',
  slug: 'default',
  createdAt: 1,
  updatedAt: 1,
}

const docsWorkspace: AgentWorkspace = {
  id: 'workspace-docs',
  name: '文档库',
  slug: 'docs',
  createdAt: 2,
  updatedAt: 2,
}

describe('WorkspaceSidebarSection', () => {
  test('marks the current workspace row and keeps the inline create action in the list', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSidebarSection
        workspaces={[defaultWorkspace, docsWorkspace]}
        currentWorkspaceId="workspace-docs"
        workspaceSessionCounts={new Map()}
        isCreatingWorkspace={false}
        newWorkspaceName=""
        editingWorkspaceId={null}
        editingWorkspaceName=""
        workspaceInputRef={null}
        workspaceEditInputRef={null}
        onSelectWorkspace={() => {}}
        onStartCreateWorkspace={() => {}}
        onChangeNewWorkspaceName={() => {}}
        onSubmitCreateWorkspace={() => {}}
        onCancelCreateWorkspace={() => {}}
        onStartRenameWorkspace={() => {}}
        onChangeEditWorkspaceName={() => {}}
        onSubmitRenameWorkspace={() => {}}
        onCancelRenameWorkspace={() => {}}
        onRequestDeleteWorkspace={() => {}}
        onBlockedDeleteWorkspace={() => {}}
      />
    )

    expect(markup).toContain('data-workspace-id="workspace-docs"')
    expect(markup).toContain('aria-current="true"')
    expect(markup).toContain('>文档库<')
    expect(markup).toContain('>新建工作区<')
  })

  test('renders an inline create input when the new workspace row is expanded', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSidebarSection
        workspaces={[defaultWorkspace]}
        currentWorkspaceId="workspace-default"
        workspaceSessionCounts={new Map()}
        isCreatingWorkspace
        newWorkspaceName="新工作区"
        editingWorkspaceId={null}
        editingWorkspaceName=""
        workspaceInputRef={null}
        workspaceEditInputRef={null}
        onSelectWorkspace={() => {}}
        onStartCreateWorkspace={() => {}}
        onChangeNewWorkspaceName={() => {}}
        onSubmitCreateWorkspace={() => {}}
        onCancelCreateWorkspace={() => {}}
        onStartRenameWorkspace={() => {}}
        onChangeEditWorkspaceName={() => {}}
        onSubmitRenameWorkspace={() => {}}
        onCancelRenameWorkspace={() => {}}
        onRequestDeleteWorkspace={() => {}}
        onBlockedDeleteWorkspace={() => {}}
      />
    )

    expect(markup).toContain('placeholder="工作区名称"')
    expect(markup).toContain('value="新工作区"')
  })
})

describe('workspace sidebar helpers', () => {
  test('blocks deleting the default workspace and occupied workspaces', () => {
    expect(getWorkspaceDeleteBlockedReason(defaultWorkspace, 0)).toBe('默认工作区不可删除')
    expect(getWorkspaceDeleteBlockedReason(docsWorkspace, 2)).toBe('请先迁移或删除该工作区下的会话')
    expect(getWorkspaceDeleteBlockedReason(docsWorkspace, 0)).toBeNull()
  })

  test('prefers the default workspace as the fallback selection after deletion', () => {
    expect(resolveWorkspaceSelectionFallback([docsWorkspace, defaultWorkspace])).toBe('workspace-default')
    expect(resolveWorkspaceSelectionFallback([docsWorkspace])).toBe('workspace-docs')
    expect(resolveWorkspaceSelectionFallback([])).toBeNull()
  })
})
