import type {
  PageBuilderCmsCatalog,
  PageBuilderCmsContentSummary,
  PageBuilderCmsSelectionResult,
  PageBuilderCmsSelectionTargetBlock,
} from './page-builder-cms'
import type { PageBuilderTargetSelection } from './page-builder-target-selection'

export type { PageBuilderCmsCatalog, PageBuilderCmsContentSummary } from './page-builder-cms'

export const PAGE_BUILDER_CMS_APPLY_SKILL_CONTRACT_VERSION = 2

export type PageBuilderCmsApplySkillEntryPoint = 'cms-browser-confirm'

export type PageBuilderCmsApplyIntent = 'replace-current'

export type PageBuilderCmsApplyTargetBlockKind = 'nav' | 'content-list'

export type PageBuilderCmsApplyRenderMode = 'replace-current'

export type PageBuilderCmsApplyMappingKind = 'catalog-nav' | 'catalog-content-list'

export type PageBuilderCmsApplyToolKind = 'catalog-nav' | 'content-list'

export interface PageBuilderCmsApplyWorkspacePolicy {
  scope: 'target-selection-only'
  allowPageRewrite: false
  allowCrossBlockMutation: false
  outputTarget: 'workspace-files/index.html'
}

export interface PageBuilderCmsApplyTargetBlock extends PageBuilderCmsSelectionTargetBlock {
  blockLabel?: string
  blockTypeHint?: PageBuilderCmsApplyTargetBlockKind
  snapshotAvailable?: boolean
}

export interface PageBuilderCmsApplySkillInput {
  version: typeof PAGE_BUILDER_CMS_APPLY_SKILL_CONTRACT_VERSION
  entryPoint: PageBuilderCmsApplySkillEntryPoint
  applyIntent: PageBuilderCmsApplyIntent
  workspacePolicy: PageBuilderCmsApplyWorkspacePolicy
  targetSelection: PageBuilderTargetSelection
  targetBlock: PageBuilderCmsApplyTargetBlock
  selection: PageBuilderCmsSelectionResult
  uiContext?: {
    userIntent?: string
    notes?: string[]
  }
}

export type PageBuilderCmsApplyClarificationKind =
  | 'target-block-intent'
  | 'catalog-nav-scope'
  | 'content-presentation'
  | 'apply-boundary-confirmation'

export interface PageBuilderCmsApplyClarificationOption {
  label: string
  value: string
  description?: string
}

export interface PageBuilderCmsApplyClarification {
  kind: PageBuilderCmsApplyClarificationKind
  question: string
  options: PageBuilderCmsApplyClarificationOption[]
}

export interface PageBuilderCmsApplyReadyDecision {
  status: 'ready'
  targetBlockKind: PageBuilderCmsApplyTargetBlockKind
  supportedRenderModes: PageBuilderCmsApplyRenderMode[]
  renderMode: PageBuilderCmsApplyRenderMode
  applyStrategy: PageBuilderCmsApplyIntent
  mappingKind: PageBuilderCmsApplyMappingKind
  toolKind: PageBuilderCmsApplyToolKind
}

export interface PageBuilderCmsApplyNeedsClarificationDecision {
  status: 'needs-clarification'
  clarification: PageBuilderCmsApplyClarification
}

export type PageBuilderCmsApplyIncompatibleReasonCode =
  | 'malformed-payload'
  | 'unsupported-block-kind'
  | 'selection-block-mismatch'
  | 'requires-page-reflow'
  | 'unsupported-runtime-capability'
  | 'unsupported-apply-strategy'

export interface PageBuilderCmsApplyIncompatibleDecision {
  status: 'incompatible'
  reasonCode: PageBuilderCmsApplyIncompatibleReasonCode
  message: string
}

export type PageBuilderCmsApplyDecisionResult =
  | PageBuilderCmsApplyReadyDecision
  | PageBuilderCmsApplyNeedsClarificationDecision
  | PageBuilderCmsApplyIncompatibleDecision

export interface PageBuilderCmsApplyExampleCatalogNavInput {
  targetBlock: PageBuilderCmsApplyTargetBlock
  selection: Extract<PageBuilderCmsSelectionResult, { selectionKind: 'catalogs' }>
  snapshotCatalogs: PageBuilderCmsCatalog[]
}

export interface PageBuilderCmsApplyExampleContentListInput {
  targetBlock: PageBuilderCmsApplyTargetBlock
  selection: Extract<PageBuilderCmsSelectionResult, { selectionKind: 'catalogs' }>
  selectedCatalogId: string
  snapshotCatalogs: PageBuilderCmsCatalog[]
}
