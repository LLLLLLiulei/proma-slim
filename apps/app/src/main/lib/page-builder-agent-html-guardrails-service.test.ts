import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  capturePageBuilderAgentHtmlSnapshot,
  finalizePageBuilderAgentHtmlGuardrails,
} from './page-builder-agent-html-guardrails-service'
import { getWorkspaceCmsRenderingManifestPath } from './config-paths'
import { createAgentWorkspace } from './workspace-service'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

describe('page-builder agent html guardrails service', () => {
  test('rebuilds the cms manifest after a direct valid agent edit changes index.html', () => {
    const workspace = createAgentWorkspace('Agent Guardrails Valid', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section data-proma-block-id="pb_blk_news"><h1>Old</h1></section></body></html>',
      'utf-8',
    )

    const snapshot = capturePageBuilderAgentHtmlSnapshot(workspace)

    writeFileSync(
      entryPath,
      [
        '<!doctype html><html><body>',
        '<section data-proma-block-id="pb_blk_news">',
        '  <cms-content data-proma-cms-source-id="cms-src-news" site-id="1" catalog-id="6">',
        '    <template v-slot:default="{ items }">',
        '      <ul><li v-for="item in items" :key="item.id"><a :href="item.publishUrl">{{ item.title }}</a></li></ul>',
        '    </template>',
        '  </cms-content>',
        '</section>',
        '</body></html>',
      ].join('\n'),
      'utf-8',
    )

    const result = finalizePageBuilderAgentHtmlGuardrails(workspace, snapshot, {
      now: () => '2026-04-18T12:00:00.000Z',
    })

    expect(result.status).toBe('validated')
    expect(result.validation.errors).toHaveLength(0)
    expect(existsSync(getWorkspaceCmsRenderingManifestPath(workspace.slug))).toBe(true)
    expect(readFileSync(getWorkspaceCmsRenderingManifestPath(workspace.slug), 'utf-8')).toContain('"component": "cms-content"')
  })

  test('keeps direct agent edits when the resulting cms authoring is invalid', () => {
    const workspace = createAgentWorkspace('Agent Guardrails Invalid', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')
    const originalHtml = '<!doctype html><html><body><section data-proma-block-id="pb_blk_news"><h1>Safe</h1></section></body></html>'

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(entryPath, originalHtml, 'utf-8')

    const snapshot = capturePageBuilderAgentHtmlSnapshot(workspace)

    const invalidHtml = [
      '<!doctype html><html><body>',
      '<section data-proma-block-id="pb_blk_news">',
      '  <cms-content data-proma-cms-source-id="cms-src-news" site-id="1" catalog-id="6">',
      '    <template v-slot:default="{ items }">',
      '      <style>.bad { color: red; }</style>',
      '      <ul><li v-for="item in items" :key="item.id"><a :href="item.url">{{ item.title }}</a></li></ul>',
      '    </template>',
      '  </cms-content>',
      '</section>',
      '</body></html>',
    ].join('\n')

    writeFileSync(entryPath, invalidHtml, 'utf-8')

    const result = finalizePageBuilderAgentHtmlGuardrails(workspace, snapshot, {
      now: () => '2026-04-18T12:00:00.000Z',
    })

    expect(result.status).toBe('invalid')
    expect(result.validation.errors).toEqual([
      expect.objectContaining({ code: 'DANGEROUS_TAG' }),
      expect.objectContaining({ code: 'UNKNOWN_ITEM_FIELD' }),
    ])
    expect(readFileSync(entryPath, 'utf-8')).toBe(invalidHtml)
    expect(existsSync(getWorkspaceCmsRenderingManifestPath(workspace.slug))).toBe(false)
  })
})
