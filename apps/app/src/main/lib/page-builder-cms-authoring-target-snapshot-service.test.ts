import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AgentWorkspace, PageBuilderTargetSelection } from '@proma/shared'
import {
  PageBuilderCmsAuthoringTargetSnapshotError,
  readPageBuilderCmsApplyTargetSnapshot,
} from './page-builder-cms-authoring-target-snapshot-service'
import { createAgentWorkspace } from './workspace-service'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

function writeWorkspaceEntry(workspace: AgentWorkspace, html: string): void {
  const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
  mkdirSync(workspaceFilesDir, { recursive: true })
  writeFileSync(join(workspaceFilesDir, 'index.html'), html, 'utf-8')
}

describe('page-builder CMS authoring target snapshot service', () => {
  test('returns the authoring block snapshot for a selected static block', () => {
    const workspace = createAgentWorkspace('CMS Handoff Block Snapshot', { template: 'page-builder' })
    writeWorkspaceEntry(
      workspace,
      '<!doctype html><html><body><section id="hero-banner" data-proma-block-id="pb_blk_hero"><h1>Hero</h1></section></body></html>',
    )

    const snapshot = readPageBuilderCmsApplyTargetSnapshot(workspace, {
      kind: 'block',
      selector: '#hero-banner',
      parentBlockSelector: '#hero-banner',
      editBoundary: 'block',
    })

    expect(snapshot).toEqual({
      kind: 'block',
      selector: '#hero-banner',
      parentBlockSelector: '#hero-banner',
      targetOuterHtml: '<section id="hero-banner" data-proma-block-id="pb_blk_hero"><h1>Hero</h1></section>',
    })
  })

  test('returns the source cms tag snapshot and parent block snapshot for cms islands', () => {
    const workspace = createAgentWorkspace('CMS Handoff Island Snapshot', { template: 'page-builder' })
    writeWorkspaceEntry(
      workspace,
      [
        '<!doctype html><html><body>',
        '<section id="latest-news" data-proma-block-id="pb_blk_news">',
        '  <h2>最新动态</h2>',
        '  <cms-content data-proma-cms-source-id="cms-src-news" site-id="14" catalog-id="news">',
        '    <template v-slot:default="{ items, loading, error, empty }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template>',
        '  </cms-content>',
        '</section>',
        '</body></html>',
      ].join(''),
    )

    const snapshot = readPageBuilderCmsApplyTargetSnapshot(workspace, {
      kind: 'cms-island',
      selector: '#latest-news > cms-content:nth-of-type(1)',
      parentBlockSelector: '#latest-news',
      sourceId: 'cms-src-news',
      component: 'cms-content',
      editBoundary: 'source-atomic',
    })

    expect(snapshot.kind).toBe('cms-island')
    expect(snapshot.sourceId).toBe('cms-src-news')
    expect(snapshot.component).toBe('cms-content')
    expect(snapshot.targetOuterHtml).toContain('<cms-content data-proma-cms-source-id="cms-src-news"')
    expect(snapshot.targetOuterHtml).toContain('site-id="14"')
    expect(snapshot.parentBlockOuterHtml).toContain('<section id="latest-news"')
    expect(snapshot.parentBlockOuterHtml).toContain('<h2>最新动态</h2>')
  })

  test('fails closed when the selected target cannot be resolved uniquely in source html', () => {
    const workspace = createAgentWorkspace('CMS Handoff Snapshot Missing', { template: 'page-builder' })
    writeWorkspaceEntry(
      workspace,
      '<!doctype html><html><body><section id="hero-banner"><h1>Hero</h1></section></body></html>',
    )

    const selection: PageBuilderTargetSelection = {
      kind: 'cms-island',
      selector: '#hero-banner > cms-content:nth-of-type(1)',
      parentBlockSelector: '#hero-banner',
      component: 'cms-content',
      editBoundary: 'source-atomic',
    }

    expect(() => readPageBuilderCmsApplyTargetSnapshot(workspace, selection)).toThrow(PageBuilderCmsAuthoringTargetSnapshotError)
    expect(() => readPageBuilderCmsApplyTargetSnapshot(workspace, selection)).toThrow('未找到当前 CMS 源标签')
  })
})
