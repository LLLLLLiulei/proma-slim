import type {
  PageBuilderCmsApplyContentSource,
  PageBuilderCmsApplyCatalogSource,
  PageBuilderCmsApplyDecisionResult,
  PageBuilderCmsApplyIntent,
  PageBuilderCmsApplyMappingKind,
  PageBuilderCmsApplyRenderMode,
  PageBuilderCmsApplySkillInput,
  PageBuilderCmsApplyTargetBlockKind,
  PageBuilderCmsApplyToolKind,
} from './page-builder-cms-apply'
import type { PageBuilderTargetSelection } from './page-builder-target-selection'

export const PAGE_BUILDER_CMS_DECIDE_TOOL_ID = 'decide_cms_binding'
export const PAGE_BUILDER_CMS_DECIDE_TOOL_NAME = 'mcp__cms__decide_cms_binding'
export const PAGE_BUILDER_CMS_BINDING_DECISION_CONTRACT_VERSION = 1

export type PageBuilderCmsBindingDecisionSource =
  | PageBuilderCmsApplyCatalogSource
  | PageBuilderCmsApplyContentSource

export type PageBuilderCmsBindingStructureShellMode =
  | 'preserve-target-shell'
  | 'replace-existing-cms-island'
  | 'slot-owns-major-region'

export type PageBuilderCmsBindingMajorContainerOwner = 'shell' | 'slot'

export type PageBuilderCmsBindingStructureShellReason =
  | 'existing-shell-major-container'
  | 'source-atomic-cms-island'
  | 'slot-major-region-default'

export interface PageBuilderCmsBindingStructureGuardrails {
  shellMode: PageBuilderCmsBindingStructureShellMode
  majorContainerOwner: PageBuilderCmsBindingMajorContainerOwner
  shellSelector?: string
  shellTagName?: string
  shellReason: PageBuilderCmsBindingStructureShellReason
}

interface PageBuilderCmsBindingApplyPlanBase {
  version: typeof PAGE_BUILDER_CMS_BINDING_DECISION_CONTRACT_VERSION
  handoffId: string
  workspaceId: string
  sessionId: string
  authoringRevision: string
  targetSelection: PageBuilderTargetSelection
  targetBlock: PageBuilderCmsApplySkillInput['targetBlock']
  selection: PageBuilderCmsApplySkillInput['selection']
  authoringContext: PageBuilderCmsApplySkillInput['authoringContext']
  targetSnapshot: PageBuilderCmsApplySkillInput['targetSnapshot']
  targetBlockKind: PageBuilderCmsApplyTargetBlockKind
  renderMode: PageBuilderCmsApplyRenderMode
  applyStrategy: PageBuilderCmsApplyIntent
  mappingKind: PageBuilderCmsApplyMappingKind
  structureGuardrails?: PageBuilderCmsBindingStructureGuardrails
}

export interface PageBuilderCmsCatalogBindingApplyPlan extends PageBuilderCmsBindingApplyPlanBase {
  toolKind: 'catalog-nav'
  component: 'cms-catalog'
  source: PageBuilderCmsApplyCatalogSource
}

export interface PageBuilderCmsContentBindingApplyPlan extends PageBuilderCmsBindingApplyPlanBase {
  toolKind: 'content-list'
  component: 'cms-content'
  source: PageBuilderCmsApplyContentSource
}

export type PageBuilderCmsBindingApplyPlan =
  | PageBuilderCmsCatalogBindingApplyPlan
  | PageBuilderCmsContentBindingApplyPlan

export interface PageBuilderCmsBindingReadyDecisionSummary {
  decisionId: string
  toolKind: PageBuilderCmsApplyToolKind
  component: 'cms-catalog' | 'cms-content'
  targetSelection: PageBuilderTargetSelection
  targetBlockKind: PageBuilderCmsApplyTargetBlockKind
  renderMode: PageBuilderCmsApplyRenderMode
  applyStrategy: PageBuilderCmsApplyIntent
}

export interface PageBuilderCmsBindingReadyDecisionResult {
  status: 'ready'
  decisionId: string
  summary: PageBuilderCmsBindingReadyDecisionSummary
}

export type PageBuilderCmsBindingDecisionResult =
  | PageBuilderCmsBindingReadyDecisionResult
  | Exclude<PageBuilderCmsApplyDecisionResult, { status: 'ready' }>
