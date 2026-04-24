import type {
  PageBuilderCmsOrdinaryAuthoringDigest,
  PageBuilderTurnRoutingMetadata,
  PageBuilderTargetSelection,
} from '@proma/shared'
import { serializePageBuilderTurnRoutingMetadata } from '@proma/shared'

export type PageBuilderSelectedTarget = PageBuilderTargetSelection

export type PageBuilderPreviewSelectionEvent =
  | { type: 'hover'; selector?: string | null; targetSelection: PageBuilderTargetSelection | null }
  | { type: 'selected'; selector?: string; targetSelection: PageBuilderTargetSelection }
  | { type: 'reset' }

export interface PageBuilderCmsGuidanceNotice {
  mode: 'page-has-existing-cms-regions' | 'targeted-cms-region-guidance-degraded'
  consultSkill: 'page-builder-cms-region-authoring-guidance'
  currentPageHasExistingCmsRegions: true
  doNotInventCmsTags: true
  doNotGuessBindingProps: true
  doNotAddPageWideVueRuntime: true
  queryPropsChangeRequiresConfirmedApply: true
  currentTargetIsExistingCmsRegion?: true
  component?: 'cms-catalog' | 'cms-content'
  allowOnlyNonBindingEdits?: true
  reason?: 'target-snapshot-fetch-failed' | 'source-type-unresolved'
}

interface ComposePageBuilderAuthoringMessageOptions {
  turnRouting?: PageBuilderTurnRoutingMetadata
  targetSelection?: PageBuilderSelectedTarget
  cmsGuidanceNotice?: PageBuilderCmsGuidanceNotice
  ordinaryCmsRegionDigest?: PageBuilderCmsOrdinaryAuthoringDigest
}

function buildSelectionSemantics(targetSelection: PageBuilderSelectedTarget): Record<string, unknown> {
  return targetSelection.kind === 'cms-island'
    ? {
        previewSurface: 'cms-rendered-output',
        updateRule: 'replace-whole-source-component',
        sourceFirst: true,
        forbidRenderedChildWrites: true,
        forbidCrossBlockMutation: true,
        forbidSiblingInsertion: true,
        forbidCmsSiblingInsertion: true,
        forbidDangerousSlotTags: ['script', 'style'],
      }
    : {
        previewSurface: 'static-block',
        updateRule: 'replace-selected-target-in-place',
        preserveExistingStructure: true,
        forbidSiblingInsertion: true,
        fallbackOnIncompatibleStructure: 'ask-user-question',
      }
}

export function composePageBuilderAuthoringMessage(
  userMessage: string,
  options: ComposePageBuilderAuthoringMessageOptions = {},
): string {
  const payloadBlocks: string[] = []

  if (options.turnRouting) {
    payloadBlocks.push(serializePageBuilderTurnRoutingMetadata(options.turnRouting))
  }

  if (options.targetSelection) {
    payloadBlocks.push(`<page_builder_selection>${JSON.stringify({
      targetSelection: options.targetSelection,
      selectionSemantics: buildSelectionSemantics(options.targetSelection),
    })}</page_builder_selection>`)
  }

  if (options.cmsGuidanceNotice) {
    payloadBlocks.push(`<page_builder_cms_guidance_notice>${JSON.stringify(options.cmsGuidanceNotice)}</page_builder_cms_guidance_notice>`)
  }

  if (options.ordinaryCmsRegionDigest) {
    payloadBlocks.push(`<page_builder_cms_region_authoring>${JSON.stringify(options.ordinaryCmsRegionDigest)}</page_builder_cms_region_authoring>`)
  }

  return [
    ...payloadBlocks.flatMap((block) => [block, '']),
    '',
    userMessage,
  ].join('\n')
}

interface DecoratePageBuilderSelectionMessageOptions {
  turnRouting?: PageBuilderTurnRoutingMetadata
  cmsGuidanceNotice?: PageBuilderCmsGuidanceNotice
  ordinaryCmsRegionDigest?: PageBuilderCmsOrdinaryAuthoringDigest
}

export function decoratePageBuilderSelectionMessage(
  userMessage: string,
  targetSelection: PageBuilderSelectedTarget,
  options: DecoratePageBuilderSelectionMessageOptions = {},
): string {
  return composePageBuilderAuthoringMessage(userMessage, {
    ...(options.turnRouting ? { turnRouting: options.turnRouting } : {}),
    targetSelection,
    ...(options.cmsGuidanceNotice ? { cmsGuidanceNotice: options.cmsGuidanceNotice } : {}),
    ...(options.ordinaryCmsRegionDigest ? { ordinaryCmsRegionDigest: options.ordinaryCmsRegionDigest } : {}),
  })
}
