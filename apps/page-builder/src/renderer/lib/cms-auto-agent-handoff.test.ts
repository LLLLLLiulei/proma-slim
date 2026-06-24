import { describe, expect, test } from 'bun:test'
import type { PageBuilderCmsSelectionResult } from '@ai-page-builder/shared'
import {
  PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER,
  buildPageBuilderCmsApplySkillInput,
  createPageBuilderCmsAutoAgentHandoffRequest,
} from './cms-auto-agent-handoff'

const catalogItemFieldMeta = [
  { name: 'id', type: 'string', optional: false, description: 'Catalog identifier.', recommendedUsage: 'Use as the stable :key when iterating catalogs.' },
  { name: 'name', type: 'string', optional: false, description: 'Catalog display name.', recommendedUsage: 'Render as the visible catalog label.' },
  { name: 'path', type: 'string', optional: false, description: 'Catalog navigation URL.', recommendedUsage: 'Use :href="item.path" for catalog links; add target="_blank" rel="noopener noreferrer" when opening CMS destinations in a new window.' },
  { name: 'parentId', type: 'string|null', optional: false, description: 'Parent catalog identifier, or null for root catalogs.' },
  { name: 'logoUrl', type: 'string', optional: true, description: 'Optional catalog logo or thumbnail URL.', recommendedUsage: 'Guard with v-if before binding to <img :src>.' },
  { name: 'hasChild', type: 'boolean', optional: false, description: 'Whether the catalog has child catalogs.', recommendedUsage: 'Use for child-indicator UI or nested navigation affordances.' },
  { name: 'total', type: 'number', optional: false, description: 'Item count or total entries under the catalog.', recommendedUsage: 'Use for count badges when the current block design needs them.' },
  { name: 'contentType', type: 'string', optional: false, description: 'Internal content type code for the catalog.' },
  { name: 'contentTypeName', type: 'string', optional: false, description: 'Display name for the catalog content type.' },
  { name: 'children', type: 'catalog-item[]', optional: false, description: 'Child catalog list in the same catalog item shape.', recommendedUsage: 'Only use when the current structure explicitly needs nested catalogs.' },
] as const

const contentItemFieldMeta = [
  { name: 'id', type: 'string', optional: false, description: 'Content identifier.', recommendedUsage: 'Use as the stable :key when iterating content items.' },
  { name: 'catalogId', type: 'string', optional: false, description: 'Owning catalog identifier for the content item.' },
  { name: 'title', type: 'string', optional: false, description: 'Content title.', recommendedUsage: 'Use as the primary visible headline.' },
  { name: 'summary', type: 'string', optional: false, description: 'Content summary or excerpt.', recommendedUsage: 'Use for body preview text when the selected target already supports summary copy.' },
  { name: 'publishUrl', type: 'string', optional: false, description: 'Content detail URL.', recommendedUsage: 'Use :href="item.publishUrl" for content links; add target="_blank" rel="noopener noreferrer" when opening CMS destinations in a new window.' },
  { name: 'listLogoUrl', type: 'string', optional: true, description: 'Optional list thumbnail or cover image URL.', recommendedUsage: 'Guard with v-if before binding to <img :src>.' },
  { name: 'addedAt', type: 'string', optional: true, description: 'Optional publish/add time string.', recommendedUsage: 'Render only when the current design needs date metadata and guard for absence.' },
] as const

function extractSkillInputFromComposedMessage(composedUserMessage: string): unknown {
  const match = composedUserMessage.match(/<cms_binding_apply_input>\s*([\s\S]*?)\s*<\/cms_binding_apply_input>/)
  if (!match) {
    throw new Error('missing cms_binding_apply_input payload')
  }

  return JSON.parse(match[1]!)
}

function extractTurnRoutingFromComposedMessage(composedUserMessage: string): unknown {
  const match = composedUserMessage.match(/<page_builder_turn_routing>\s*([\s\S]*?)\s*<\/page_builder_turn_routing>/)
  if (!match) {
    throw new Error('missing page_builder_turn_routing payload')
  }

  return JSON.parse(match[1]!)
}

describe('page-builder CMS auto handoff payloads', () => {
  test('builds the apply skill input with phase 1A defaults and without invented optional block fields', () => {
    const targetSnapshot = {
      kind: 'block' as const,
      selector: '#hero-banner',
      parentBlockSelector: '#hero-banner',
      targetOuterHtml: '<section id="hero-banner"><h1>Hero</h1></section>',
    }
    const selection: PageBuilderCmsSelectionResult = {
      version: 6,
      siteId: '14',
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
      catalogId: 'catalog-1',
      contentIds: ['content-1'],
      snapshot: {
        contents: [],
      },
    }

    expect(buildPageBuilderCmsApplySkillInput(selection, {
      handoffId: 'handoff-1',
      targetSnapshot,
      authoringRevision: 'rev-1',
    })).toEqual({
      version: 8,
      handoffId: 'handoff-1',
      entryPoint: 'cms-browser-confirm',
      applyIntent: 'replace-current',
      workspacePolicy: {
        scope: 'target-selection-only',
        allowPageRewrite: false,
        allowCrossBlockMutation: false,
        outputTarget: 'workspace-files/index.html',
      },
      targetSelection: {
        kind: 'block',
        selector: '#hero-banner',
        parentBlockSelector: '#hero-banner',
        editBoundary: 'block',
      },
      targetBlock: {
        selector: '#hero-banner',
      },
      selection,
      authoringContext: {
        component: 'cms-content',
        sourceType: 'contents-by-ids',
        allowedProps: ['site-id', 'ids', 'catalog-id', 'keyword', 'page-index', 'page-size'],
        requiredProps: ['site-id', 'catalog-id', 'ids'],
        slotScope: ['items', 'loading', 'error', 'empty'],
        allowedSlotHelpers: [],
        itemFields: ['id', 'catalogId', 'title', 'summary', 'publishUrl', 'listLogoUrl', 'addedAt'],
        itemFieldMeta: [...contentItemFieldMeta],
        recommendedLinkField: 'publishUrl',
        recommendedImageField: 'listLogoUrl',
        forbiddenStructures: ['nested-cms-islands', 'dangerous-tags', 'outer-slot-wrapper'],
      },
      targetSnapshot,
      authoringRevision: 'rev-1',
      uiContext: {
        userIntent: 'Preserve the current selected target structure and styles when compatible. Replace the selected target in place, and do not append a sibling CMS block.',
      },
    })
  })

  test('creates a programmatic handoff request that carries hidden structured payload and forced skill mention', () => {
    const targetSnapshot = {
      kind: 'cms-island' as const,
      htmlPath: 'index.html',
      sourceSelector: 'section:nth-of-type(1) > cms-content:nth-of-type(1)',
      parentBlockSelector: '[data-proma-block-id="pb_blk_news"]',
      targetOuterHtml: '<cms-content site-id="14" catalog-id="news"></cms-content>',
      parentBlockOuterHtml: '<section data-proma-block-id="pb_blk_news"><cms-content site-id="14" catalog-id="news"></cms-content></section>',
      component: 'cms-content' as const,
    }
    const selection: PageBuilderCmsSelectionResult = {
      version: 6,
      siteId: '14',
      targetSelection: {
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: 'section:nth-of-type(1) > cms-content:nth-of-type(1)',
        parentBlockSelector: '[data-proma-block-id="pb_blk_news"]',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      },
      targetBlock: {
        selector: '[data-proma-block-id="pb_blk_news"]',
      },
      selectionKind: 'catalogs',
      sourceType: 'catalogs-by-parent',
      selectionMode: 'children-of-parent',
      parentCatalogId: 'catalog-1',
      snapshot: {
        parentCatalog: {
          id: 'catalog-1',
          name: '新闻',
          parentId: null,
          path: 'news/',
          contentType: 'Article',
          contentTypeName: '文章',
          hasChild: true,
          total: 12,
          children: [],
        },
      },
    }

    const request = createPageBuilderCmsAutoAgentHandoffRequest(selection, {
      requestId: 'handoff-1',
      targetSnapshot,
      authoringRevision: 'rev-1',
      uiEntryPoint: 'block-toolbar',
    })

    expect(request).toMatchObject({
      requestId: 'handoff-1',
      userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前目标。',
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
      mentionedMcpServers: [PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER],
    })
    expect(request.composedUserMessage).toMatch(/^<page_builder_turn_routing>[\s\S]*<\/page_builder_turn_routing>\s*<cms_binding_apply_input>[\s\S]*<\/cms_binding_apply_input>$/)
    expect(request.composedUserMessage).not.toContain('只有获得 `decisionId` 之后才能继续调用 `mcp__cms__apply_cms_binding`')
    expect(request.composedUserMessage).not.toContain('作者态源码事实输入')
    expect(extractTurnRoutingFromComposedMessage(request.composedUserMessage)).toEqual({
      sceneKind: 'confirmed-cms-apply',
      ownerSkill: 'cms-binding-apply',
      ownerLockedForTurn: true,
    })
    expect(extractSkillInputFromComposedMessage(request.composedUserMessage)).toEqual({
      version: 8,
      handoffId: 'handoff-1',
      entryPoint: 'cms-browser-confirm',
      applyIntent: 'replace-current',
      workspacePolicy: {
        scope: 'target-selection-only',
        allowPageRewrite: false,
        allowCrossBlockMutation: false,
        outputTarget: 'workspace-files/index.html',
      },
      targetSelection: {
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: 'section:nth-of-type(1) > cms-content:nth-of-type(1)',
        parentBlockSelector: '[data-proma-block-id="pb_blk_news"]',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      },
      targetBlock: {
        selector: '[data-proma-block-id="pb_blk_news"]',
      },
      selection,
      authoringContext: {
        component: 'cms-catalog',
        sourceType: 'catalogs-by-parent',
        allowedProps: ['site-id', 'ids', 'level', 'parent-id', 'content-type', 'search-keyword', 'take'],
        requiredProps: ['site-id', 'level', 'parent-id'],
        slotScope: ['items', 'loading', 'error', 'empty'],
        allowedSlotHelpers: [],
        itemFields: ['id', 'name', 'path', 'parentId', 'logoUrl', 'hasChild', 'total', 'contentType', 'contentTypeName', 'children'],
        itemFieldMeta: [...catalogItemFieldMeta],
        recommendedLinkField: 'path',
        recommendedImageField: 'logoUrl',
        forbiddenStructures: ['nested-cms-islands', 'dangerous-tags', 'outer-slot-wrapper'],
      },
      targetSnapshot,
      authoringRevision: 'rev-1',
      uiContext: {
        userIntent: 'Preserve the current selected target structure and styles when compatible. Replace the selected target in place, and do not append a sibling CMS block.',
        notes: ['opened-from:block-toolbar'],
      },
    })
  })

  test('rejects malformed selections that omit siteId before building the handoff payload', () => {
    const selection = {
      version: 6,
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
      catalogIds: ['catalog-1'],
      snapshot: {
        catalogs: [],
      },
    } as unknown as PageBuilderCmsSelectionResult

    const targetSnapshot = {
      kind: 'block' as const,
      selector: '#hero-banner',
      parentBlockSelector: '#hero-banner',
      targetOuterHtml: '<section id="hero-banner"><h1>Hero</h1></section>',
    }

    expect(() => buildPageBuilderCmsApplySkillInput(selection, {
      handoffId: 'handoff-1',
      targetSnapshot,
      authoringRevision: 'rev-1',
    })).toThrow('CMS 选择结果缺少 siteId')
    expect(() => createPageBuilderCmsAutoAgentHandoffRequest(selection, {
      requestId: 'handoff-1',
      targetSnapshot,
      authoringRevision: 'rev-1',
    })).toThrow('CMS 选择结果缺少 siteId')
  })

  test('preserves the original selection while serializing authoritative source context for contents-by-catalog', () => {
    const targetSnapshot = {
      kind: 'block' as const,
      selector: '#latest-news',
      parentBlockSelector: '#latest-news',
      targetOuterHtml: '<section id="latest-news"><div>placeholder</div></section>',
    }
    const selection: PageBuilderCmsSelectionResult = {
      version: 6,
      siteId: '14',
      targetSelection: {
        kind: 'block',
        selector: '#latest-news',
        parentBlockSelector: '#latest-news',
        editBoundary: 'block',
      },
      targetBlock: {
        selector: '#latest-news',
      },
      selectionKind: 'contents',
      sourceType: 'contents-by-catalog',
      selectionMode: 'by-catalog',
      catalogId: 'catalog-1',
      snapshot: {
        catalog: {
          id: 'catalog-1',
          name: '树节点栏目',
          parentId: null,
          path: '',
          contentType: '',
          contentTypeName: '',
          hasChild: false,
          total: 0,
          children: [],
        },
      },
    }

    const authoritativeSource = {
      catalog: {
        id: 'catalog-1',
        name: '权威栏目',
        parentId: null,
        path: '/news',
        contentType: 'Article',
        contentTypeName: '文章',
        hasChild: false,
        total: 21,
        children: [],
      },
      contentsProbe: {
        total: 21,
        items: [{
          id: 'content-1',
          catalogId: 'catalog-1',
          title: '最新动态',
          summary: '摘要',
          publishUrl: 'https://example.com/news/1',
        }],
      },
    }

    const request = createPageBuilderCmsAutoAgentHandoffRequest(selection, {
      requestId: 'handoff-contents-by-catalog',
      targetSnapshot,
      authoringRevision: 'rev-1',
      authoritativeSource,
    })

    const skillInput = extractSkillInputFromComposedMessage(request.composedUserMessage) as {
      selection: PageBuilderCmsSelectionResult
      authoritativeSource?: {
        catalog: {
          name: string
          total: number
          path: string
        }
        contentsProbe: {
          total: number
          items: Array<{ id: string }>
        }
      }
    }

    expect(skillInput.selection.snapshot).toEqual({
      catalog: {
        id: 'catalog-1',
        name: '树节点栏目',
        parentId: null,
        path: '',
        contentType: '',
        contentTypeName: '',
        hasChild: false,
        total: 0,
        children: [],
      },
    })
    expect(skillInput.authoritativeSource).toEqual({
      catalog: {
        name: '权威栏目',
        total: 21,
        path: '/news',
      },
      contentsProbe: {
        total: 21,
        items: [{ id: 'content-1' }],
      },
    })
  })
})
