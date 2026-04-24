import { describe, expect, test } from 'bun:test'
import {
  composePageBuilderAuthoringMessage,
  decoratePageBuilderSelectionMessage,
} from './preview-selection'

function extractSelectionPayload(message: string): unknown {
  const match = message.match(/<page_builder_selection>\s*([\s\S]*?)\s*<\/page_builder_selection>/)
  if (!match) {
    throw new Error('missing page_builder_selection payload')
  }

  return JSON.parse(match[1]!)
}

function extractTurnRoutingPayload(message: string): unknown {
  const match = message.match(/<page_builder_turn_routing>\s*([\s\S]*?)\s*<\/page_builder_turn_routing>/)
  if (!match) {
    throw new Error('missing page_builder_turn_routing payload')
  }

  return JSON.parse(match[1]!)
}

function extractCmsRegionDigest(message: string): unknown {
  const match = message.match(/<page_builder_cms_region_authoring>\s*([\s\S]*?)\s*<\/page_builder_cms_region_authoring>/)
  if (!match) {
    throw new Error('missing page_builder_cms_region_authoring payload')
  }

  return JSON.parse(match[1]!)
}

function extractCmsGuidanceNotice(message: string): unknown {
  const match = message.match(/<page_builder_cms_guidance_notice>\s*([\s\S]*?)\s*<\/page_builder_cms_guidance_notice>/)
  if (!match) {
    throw new Error('missing page_builder_cms_guidance_notice payload')
  }

  return JSON.parse(match[1]!)
}

describe('page builder preview selection helpers', () => {
  test('decorates the next builder message using the structured block target selection and visible user message', () => {
    const decorated = decoratePageBuilderSelectionMessage('把这里的文案改短一点', {
      kind: 'block',
      selector: '#hero',
      parentBlockSelector: '#hero',
      editBoundary: 'block',
    }, {
      turnRouting: {
        sceneKind: 'ordinary-page-flow',
        ownerSkill: 'page-builder-guided-generation',
        ownerLockedForTurn: true,
      },
    })

    expect(decorated).toContain('把这里的文案改短一点')
    expect(extractTurnRoutingPayload(decorated)).toEqual({
      sceneKind: 'ordinary-page-flow',
      ownerSkill: 'page-builder-guided-generation',
      ownerLockedForTurn: true,
    })
    expect(extractSelectionPayload(decorated)).toEqual({
      targetSelection: {
        kind: 'block',
        selector: '#hero',
        parentBlockSelector: '#hero',
        editBoundary: 'block',
      },
      selectionSemantics: {
        previewSurface: 'static-block',
        updateRule: 'replace-selected-target-in-place',
        preserveExistingStructure: true,
        forbidSiblingInsertion: true,
        fallbackOnIncompatibleStructure: 'ask-user-question',
      },
    })
  })

  test('decorates cms islands with source-atomic boundary metadata instead of rendered child semantics', () => {
    const decorated = decoratePageBuilderSelectionMessage('请把这里换成另一个栏目', {
      kind: 'cms-island',
      htmlPath: 'index.html',
      sourceSelector: 'section:nth-of-type(2) > cms-catalog:nth-of-type(1)',
      parentBlockSelector: '[data-proma-block-id="pb_blk_nav"]',
      component: 'cms-catalog',
      editBoundary: 'source-atomic',
    }, {
      turnRouting: {
        sceneKind: 'existing-cms-region-ordinary-edit',
        ownerSkill: 'page-builder-guided-generation',
        ownerLockedForTurn: true,
        consultSkills: ['page-builder-cms-region-authoring-guidance'],
      },
    })

    expect(extractTurnRoutingPayload(decorated)).toEqual({
      sceneKind: 'existing-cms-region-ordinary-edit',
      ownerSkill: 'page-builder-guided-generation',
      ownerLockedForTurn: true,
      consultSkills: ['page-builder-cms-region-authoring-guidance'],
    })
    expect(extractSelectionPayload(decorated)).toEqual({
      targetSelection: {
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: 'section:nth-of-type(2) > cms-catalog:nth-of-type(1)',
        parentBlockSelector: '[data-proma-block-id="pb_blk_nav"]',
        component: 'cms-catalog',
        editBoundary: 'source-atomic',
      },
      selectionSemantics: {
        previewSurface: 'cms-rendered-output',
        updateRule: 'replace-whole-source-component',
        sourceFirst: true,
        forbidRenderedChildWrites: true,
        forbidCrossBlockMutation: true,
        forbidSiblingInsertion: true,
        forbidCmsSiblingInsertion: true,
        forbidDangerousSlotTags: ['script', 'style'],
      },
    })
  })

  test('includes the ordinary cms-region digest only for existing cms region edits', () => {
    const decorated = decoratePageBuilderSelectionMessage('把这里的栏目样式改成横向导航', {
      kind: 'cms-island',
      htmlPath: 'index.html',
      sourceSelector: 'section:nth-of-type(2) > cms-catalog:nth-of-type(1)',
      parentBlockSelector: '[data-proma-block-id="pb_blk_nav"]',
      component: 'cms-catalog',
      editBoundary: 'source-atomic',
    }, {
      ordinaryCmsRegionDigest: {
        mode: 'ordinary-existing-region',
        component: 'cms-catalog',
        sourceType: 'catalogs-by-parent',
        allowedProps: ['site-id', 'ids', 'level', 'parent-id', 'content-type', 'search-keyword', 'take'],
        requiredProps: ['site-id', 'level', 'parent-id'],
        slotScope: ['items', 'loading', 'error', 'empty'],
        itemFields: ['id', 'name', 'path'],
        itemFieldMeta: [],
        recommendedLinkField: 'path',
        forbiddenStructures: ['nested-cms-islands'],
        boundary: {
          editBoundary: 'source-atomic',
          sourceFirst: true,
          queryPropsChangeRequiresConfirmedApply: true,
          runtimeOnlyAttrsAreNotAuthoringSurface: true,
          vueSyntaxInsideSourceTagOnly: true,
          nonCmsRegionsHtmlOnly: true,
        },
      },
    })

    expect(extractCmsRegionDigest(decorated)).toMatchObject({
      mode: 'ordinary-existing-region',
      component: 'cms-catalog',
      sourceType: 'catalogs-by-parent',
      boundary: {
        editBoundary: 'source-atomic',
        sourceFirst: true,
        queryPropsChangeRequiresConfirmedApply: true,
      },
    })
  })

  test('supports page-level cms guidance notices without requiring a selected target', () => {
    const decorated = composePageBuilderAuthoringMessage('继续微调这个页面', {
      turnRouting: {
        sceneKind: 'ordinary-page-flow',
        ownerSkill: 'page-builder-guided-generation',
        ownerLockedForTurn: true,
      },
      cmsGuidanceNotice: {
        mode: 'page-has-existing-cms-regions',
        consultSkill: 'page-builder-cms-region-authoring-guidance',
        currentPageHasExistingCmsRegions: true,
        doNotInventCmsTags: true,
        doNotGuessBindingProps: true,
        doNotAddPageWideVueRuntime: true,
        queryPropsChangeRequiresConfirmedApply: true,
      },
    })

    expect(extractTurnRoutingPayload(decorated)).toEqual({
      sceneKind: 'ordinary-page-flow',
      ownerSkill: 'page-builder-guided-generation',
      ownerLockedForTurn: true,
    })
    expect(extractCmsGuidanceNotice(decorated)).toEqual({
      mode: 'page-has-existing-cms-regions',
      consultSkill: 'page-builder-cms-region-authoring-guidance',
      currentPageHasExistingCmsRegions: true,
      doNotInventCmsTags: true,
      doNotGuessBindingProps: true,
      doNotAddPageWideVueRuntime: true,
      queryPropsChangeRequiresConfirmedApply: true,
    })
    expect(decorated).not.toContain('<page_builder_selection>')
  })
})
