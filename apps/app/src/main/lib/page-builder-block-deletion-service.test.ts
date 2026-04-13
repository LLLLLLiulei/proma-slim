import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { applyPageBuilderBlockDeletion, savePageBuilderBlockDeletion } from './page-builder-block-deletion-service'
import { createAgentWorkspace } from './workspace-service'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

describe('page-builder block deletion service', () => {
  test('removes the targeted block by selector', () => {
    const html = '<!doctype html><html><body><section id="hero"><h1>标题</h1></section><section id="features"><p>保留内容</p></section></body></html>'

    const updated = applyPageBuilderBlockDeletion(html, '#hero')

    expect(updated).not.toContain('id="hero"')
    expect(updated).toContain('id="features"')
    expect(updated).toContain('保留内容')
  })

  test('rejects selectors that do not resolve to a unique block before writing', () => {
    const html = '<!doctype html><html><body><section class="hero"><h1>甲</h1></section><section class="hero"><h1>乙</h1></section></body></html>'

    expect(() => applyPageBuilderBlockDeletion(html, '.hero')).toThrow('无法唯一定位')
  })

  test('savePageBuilderBlockDeletion returns preview metadata recomputed from the latest html', () => {
    const workspace = createAgentWorkspace('Block Delete CMS', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="hero"><cms-content catalog-id="news"></cms-content></section></body></html>',
      'utf-8',
    )

    const previewState = savePageBuilderBlockDeletion(workspace, {
      selector: '#hero',
    })

    expect(previewState.hasCmsRendering).toBe(false)
    expect(previewState.requiresSameOrigin).toBe(false)
  })
})
