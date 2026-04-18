import { describe, expect, test } from 'bun:test'
import type { PageBuilderCmsSelectionResult } from '@proma/shared'
import {
  PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER,
  buildPageBuilderCmsApplySkillInput,
  createPageBuilderCmsAutoAgentHandoffRequest,
} from './cms-auto-agent-handoff'

function extractSkillInputFromComposedMessage(composedUserMessage: string): unknown {
  const match = composedUserMessage.match(/<cms_binding_apply_input>\s*([\s\S]*?)\s*<\/cms_binding_apply_input>/)
  if (!match) {
    throw new Error('missing cms_binding_apply_input payload')
  }

  return JSON.parse(match[1]!)
}

describe('page-builder CMS auto handoff payloads', () => {
  test('builds the apply skill input with phase 1A defaults and without invented optional block fields', () => {
    const selection: PageBuilderCmsSelectionResult = {
      version: 5,
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

    expect(buildPageBuilderCmsApplySkillInput(selection)).toEqual({
      version: 3,
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
      uiContext: {
        userIntent: 'Preserve the current selected target structure and styles when compatible. Replace the selected target in place, and do not append a sibling CMS block.',
      },
    })
  })

  test('creates a programmatic handoff request that carries hidden structured payload and forced skill mention', () => {
    const selection: PageBuilderCmsSelectionResult = {
      version: 5,
      siteId: '14',
      targetSelection: {
        kind: 'cms-island',
        sourceId: 'cms-src-news',
        selector: 'section:nth-of-type(1) > cms-content:nth-of-type(1)',
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
      uiEntryPoint: 'block-toolbar',
    })

    expect(request).toMatchObject({
      requestId: 'handoff-1',
      userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前目标。',
      mentionedSkills: ['cms-binding-apply'],
      mentionedMcpServers: [PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER],
    })
    expect(request.composedUserMessage).toContain('当前目标已经是一个 cms-island，必须整体替换现有 cms 源标签，不能在它里面再包一层新的 cms-catalog 或 cms-content。')
    expect(request.composedUserMessage).toContain('优先让 cms-* 标签作为动态区域源码根节点，并把 ul、nav、section、article 等主要动态容器写进 slot。')
    expect(request.composedUserMessage).toContain('新写入或重绑的 cms-* 标签必须显式写出 site-id，并且该值必须等于 selection.siteId。')
    expect(request.composedUserMessage).toContain('不要把 CMS 浏览弹框里的分页大小当作页面绑定时的默认 page-size。')
    expect(request.composedUserMessage).toContain('必须先检查当前目标区块的现有源码结构、类名和主要布局骨架；在兼容时优先复用它们，只替换为 CMS 数据绑定。')
    expect(request.composedUserMessage).toContain('不要在当前选中区块旁边追加一个新的 cms-catalog / cms-content 并把原区块保留下来；必须原位替换当前目标。')
    expect(request.composedUserMessage).toContain('如果当前目标结构与所选 CMS 数据无法安全兼容，先通过 AskUserQuestion 发起一个简短澄清，而不是擅自改造成新的通用列表或图文卡片。')
    expect(request.composedUserMessage).toContain('不要在 cms-* 组件的 default / empty / error slot 中写入 <script> 或 <style>。')
    expect(extractSkillInputFromComposedMessage(request.composedUserMessage)).toEqual({
      version: 3,
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
        sourceId: 'cms-src-news',
        selector: 'section:nth-of-type(1) > cms-content:nth-of-type(1)',
        parentBlockSelector: '[data-proma-block-id="pb_blk_news"]',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      },
      targetBlock: {
        selector: '[data-proma-block-id="pb_blk_news"]',
      },
      selection,
      uiContext: {
        userIntent: 'Preserve the current selected target structure and styles when compatible. Replace the selected target in place, and do not append a sibling CMS block.',
        notes: ['opened-from:block-toolbar'],
      },
    })
  })

  test('rejects malformed selections that omit siteId before building the handoff payload', () => {
    const selection = {
      version: 5,
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

    expect(() => buildPageBuilderCmsApplySkillInput(selection)).toThrow('CMS 选择结果缺少 siteId')
    expect(() => createPageBuilderCmsAutoAgentHandoffRequest(selection)).toThrow('CMS 选择结果缺少 siteId')
  })
})
