import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentEvent } from '@proma/shared'
import { getPageBuilderCmsBindingsPath, getWorkspaceFilesDir } from './config-paths'
import {
  collectPageBuilderCmsBindingsFromAgentRun,
  persistPageBuilderCmsBindingsFromAgentRun,
  readPageBuilderCmsBindings,
} from './page-builder-cms-binding-service'
import { createAgentWorkspace } from './workspace-service'

function createToolTextResult(payload: unknown): string {
  return JSON.stringify([{
    type: 'text',
    text: JSON.stringify(payload, null, 2),
  }], null, 2)
}

describe('page builder cms binding service', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-page-builder-cms-bindings-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    rmSync(configDir, { recursive: true, force: true })
  })

  test('collects a manual hidden-context selection and chains subsequent asset imports into the same binding', () => {
    const events: AgentEvent[] = [
      {
        type: 'tool_result',
        toolUseId: 'tool-import-1',
        toolName: 'cms_import_asset_to_workspace',
        result: createToolTextResult({
          relativePath: 'upload/resources/image/2025/06/30/hero.jpeg',
          workspaceRelativePath: 'assets/cms/abc123-hero.jpeg',
          filename: 'hero.jpeg',
          bytes: 1024,
          mediaType: 'image/jpeg',
        }),
        isError: false,
      },
    ]

    const bindings = collectPageBuilderCmsBindingsFromAgentRun({
      composedUserMessage: [
        '<page_builder_selection>',
        'selector: #hero',
        '</page_builder_selection>',
        '<page_builder_cms_selection>',
        'sourceType: content-item',
        'stableId: content:catalog-1:item-1',
        'displayName: 头条新闻',
        'catalogId: catalog-1',
        'contentId: item-1',
        'contentTypeId: article',
        'presentationHint: hero',
        '</page_builder_cms_selection>',
        '',
        '把这里改成 CMS 内容',
      ].join('\n'),
      events,
    })

    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      selector: '#hero',
      selection: {
        sourceType: 'content-item',
        stableId: 'content:catalog-1:item-1',
        displayName: '头条新闻',
        catalogId: 'catalog-1',
        contentId: 'item-1',
        contentTypeId: 'article',
        presentationHint: 'hero',
      },
      importedAssets: [{
        relativePath: 'upload/resources/image/2025/06/30/hero.jpeg',
        workspaceRelativePath: 'assets/cms/abc123-hero.jpeg',
        filename: 'hero.jpeg',
        bytes: 1024,
        mediaType: 'image/jpeg',
      }],
    })
  })

  test('persists tool-driven confirmed selections into a workspace-private bindings file without touching preview html', () => {
    const workspace = createAgentWorkspace('CMS Binding Target', { template: 'page-builder' })
    const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
    const indexPath = join(workspaceFilesDir, 'index.html')
    writeFileSync(indexPath, '<!doctype html><html><body><section id="hero">unchanged</section></body></html>', 'utf-8')

    persistPageBuilderCmsBindingsFromAgentRun({
      workspaceSlug: workspace.slug,
      events: [
        {
          type: 'tool_result',
          toolUseId: 'tool-request-1',
          toolName: 'RequestCmsSelection',
          result: createToolTextResult({
            requestId: 'cms-request-1',
            status: 'confirmed',
            selection: {
              sourceType: 'content-list',
              stableId: 'content-list:catalog-9:item-1,item-2',
              displayName: '新闻列表',
              selector: '#news',
              catalogId: 'catalog-9',
              contentTypeId: 'article',
              itemIds: ['item-1', 'item-2'],
              presentationHint: 'news-grid',
            },
          }),
          isError: false,
        },
        {
          type: 'tool_result',
          toolUseId: 'tool-import-1',
          toolName: 'cms_import_asset_to_workspace',
          result: createToolTextResult({
            relativePath: 'upload/resources/image/2025/06/30/card.jpeg',
            workspaceRelativePath: 'assets/cms/def456-card.jpeg',
            filename: 'card.jpeg',
            bytes: 2048,
            mediaType: 'image/jpeg',
          }),
          isError: false,
        },
      ],
    })

    const bindingsPath = getPageBuilderCmsBindingsPath(workspace.slug)
    const payload = readPageBuilderCmsBindings(workspace.slug)

    expect(bindingsPath).toContain('/.page-builder/cms-bindings.json')
    expect(payload.bindings).toHaveLength(1)
    expect(payload.bindings[0]).toMatchObject({
      selector: '#news',
      sourceType: 'content-list',
      stableId: 'content-list:catalog-9:item-1,item-2',
      displayName: '新闻列表',
      renderHint: 'news-grid',
      catalogId: 'catalog-9',
      contentTypeId: 'article',
      itemIds: ['item-1', 'item-2'],
      importedAssets: [{
        relativePath: 'upload/resources/image/2025/06/30/card.jpeg',
        workspaceRelativePath: 'assets/cms/def456-card.jpeg',
        filename: 'card.jpeg',
        bytes: 2048,
        mediaType: 'image/jpeg',
      }],
    })
    expect(readFileSync(indexPath, 'utf-8')).toBe('<!doctype html><html><body><section id="hero">unchanged</section></body></html>')
    expect(readFileSync(bindingsPath, 'utf-8')).toContain('"selector": "#news"')
    expect(readFileSync(bindingsPath, 'utf-8')).not.toContain('CurrentSite=')
  })
})
