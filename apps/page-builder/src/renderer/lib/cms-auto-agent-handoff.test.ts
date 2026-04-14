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
      version: 2,
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
      sourceType: 'contents-fixed',
      selectionMode: 'fixed-items',
      catalogIds: ['catalog-1'],
      contentIds: ['content-1'],
      snapshot: {
        contents: [],
      },
    }

    expect(buildPageBuilderCmsApplySkillInput(selection)).toEqual({
      version: 2,
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
    })
  })

  test('creates a programmatic handoff request that carries hidden structured payload and forced skill mention', () => {
    const selection: PageBuilderCmsSelectionResult = {
      version: 2,
      targetSelection: {
        kind: 'cms-island',
        selector: 'section:nth-of-type(1) > cms-content:nth-of-type(1)',
        parentBlockSelector: '[data-proma-block-id="pb_blk_news"]',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      },
      targetBlock: {
        selector: '[data-proma-block-id="pb_blk_news"]',
      },
      selectionKind: 'catalogs',
      sourceType: 'catalogs',
      selectionMode: 'single',
      catalogIds: ['catalog-1'],
      snapshot: {
        catalogs: [],
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
    expect(extractSkillInputFromComposedMessage(request.composedUserMessage)).toEqual({
      version: 2,
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
        notes: ['opened-from:block-toolbar'],
      },
    })
  })
})
