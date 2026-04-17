import type {
  PageBuilderCmsApplyDecisionResult,
  PageBuilderCmsApplyExampleCatalogNavInput,
  PageBuilderCmsApplyExampleContentListInput,
  PageBuilderCmsApplySkillInput,
  PageBuilderCmsCatalog,
  PageBuilderCmsContentSummary,
} from './page-builder-cms-apply'
import { createPageBuilderBlockTargetSelection } from './page-builder-target-selection'

type Assert<T extends true> = T
type IsExact<T, Expected> = (<G>() => G extends T ? 1 : 2) extends (<G>() => G extends Expected ? 1 : 2)
  ? (<G>() => G extends Expected ? 1 : 2) extends (<G>() => G extends T ? 1 : 2)
    ? true
    : false
  : false

const catalogSnapshot = {} as PageBuilderCmsCatalog
const contentSnapshot = {} as PageBuilderCmsContentSummary

const catalogApplyInput = {
  version: 3,
  entryPoint: 'cms-browser-confirm',
  applyIntent: 'replace-current',
  workspacePolicy: {
    scope: 'target-selection-only',
    allowPageRewrite: false,
    allowCrossBlockMutation: false,
    outputTarget: 'workspace-files/index.html',
  },
  targetSelection: createPageBuilderBlockTargetSelection('#main-nav'),
  targetBlock: {
    selector: '#main-nav',
    blockTypeHint: 'nav',
  },
  selection: {
    version: 5,
    siteId: '14',
    targetSelection: createPageBuilderBlockTargetSelection('#main-nav'),
    targetBlock: {
      selector: '#main-nav',
    },
    selectionKind: 'catalogs',
    sourceType: 'catalogs-by-parent',
    selectionMode: 'children-of-parent',
    parentCatalogId: 'catalog-parent',
    snapshot: {
      parentCatalog: catalogSnapshot,
    },
  },
} satisfies PageBuilderCmsApplySkillInput

const catalogListApplyInput = {
  version: 3,
  entryPoint: 'cms-browser-confirm',
  applyIntent: 'replace-current',
  workspacePolicy: {
    scope: 'target-selection-only',
    allowPageRewrite: false,
    allowCrossBlockMutation: false,
    outputTarget: 'workspace-files/index.html',
  },
  targetSelection: createPageBuilderBlockTargetSelection('#featured-catalogs'),
  targetBlock: {
    selector: '#featured-catalogs',
    blockTypeHint: 'catalog-list',
  },
  selection: {
    version: 5,
    siteId: '14',
    targetSelection: createPageBuilderBlockTargetSelection('#featured-catalogs'),
    targetBlock: {
      selector: '#featured-catalogs',
    },
    selectionKind: 'catalogs',
    sourceType: 'catalogs-by-ids',
    selectionMode: 'fixed-items',
    catalogIds: ['catalog-1'],
    snapshot: {
      catalogs: [catalogSnapshot],
    },
  },
} satisfies PageBuilderCmsApplySkillInput

const contentApplyInput = {
  version: 3,
  entryPoint: 'cms-browser-confirm',
  applyIntent: 'replace-current',
  workspacePolicy: {
    scope: 'target-selection-only',
    allowPageRewrite: false,
    allowCrossBlockMutation: false,
    outputTarget: 'workspace-files/index.html',
  },
  targetSelection: createPageBuilderBlockTargetSelection('#latest-news'),
  targetBlock: {
    selector: '#latest-news',
    blockTypeHint: 'content-list',
  },
  selection: {
    version: 5,
    siteId: '14',
    targetSelection: createPageBuilderBlockTargetSelection('#latest-news'),
    targetBlock: {
      selector: '#latest-news',
    },
    selectionKind: 'contents',
    sourceType: 'contents-by-catalog',
    selectionMode: 'by-catalog',
    catalogId: 'catalog-1',
    snapshot: {
      catalog: catalogSnapshot,
    },
  },
} satisfies PageBuilderCmsApplySkillInput

const fixedContentsApplyInput = {
  version: 3,
  entryPoint: 'cms-browser-confirm',
  applyIntent: 'replace-current',
  workspacePolicy: {
    scope: 'target-selection-only',
    allowPageRewrite: false,
    allowCrossBlockMutation: false,
    outputTarget: 'workspace-files/index.html',
  },
  targetSelection: createPageBuilderBlockTargetSelection('#latest-news'),
  targetBlock: {
    selector: '#latest-news',
    blockTypeHint: 'content-list',
  },
  selection: {
    version: 5,
    siteId: '14',
    targetSelection: createPageBuilderBlockTargetSelection('#latest-news'),
    targetBlock: {
      selector: '#latest-news',
    },
    selectionKind: 'contents',
    sourceType: 'contents-by-ids',
    selectionMode: 'fixed-items',
    catalogId: 'catalog-1',
    contentIds: ['content-1'],
    snapshot: {
      contents: [contentSnapshot],
    },
  },
} satisfies PageBuilderCmsApplySkillInput

const readyDecision = {
  status: 'ready',
  targetBlockKind: 'catalog-list',
  supportedRenderModes: ['replace-current'],
  renderMode: 'replace-current',
  applyStrategy: 'replace-current',
  mappingKind: 'catalog-nav',
  toolKind: 'catalog-nav',
} satisfies PageBuilderCmsApplyDecisionResult

const needsClarificationDecision = {
  status: 'needs-clarification',
  clarification: {
    kind: 'catalog-nav-scope',
    question: '多个栏目需要按一级导航平铺，还是保留层级结构？',
    options: [
      { label: '平铺一级栏目', value: 'flat-top-level' },
      { label: '保留层级结构', value: 'preserve-hierarchy' },
    ],
  },
} satisfies PageBuilderCmsApplyDecisionResult

const incompatibleDecision = {
  status: 'incompatible',
  reasonCode: 'unsupported-block-kind',
  message: '当前区块不属于第一阶段支持的 nav 或 content-list 类型。',
} satisfies PageBuilderCmsApplyDecisionResult

const malformedPayloadDecision = {
  status: 'incompatible',
  reasonCode: 'malformed-payload',
  message: '缺少 selection 或 targetBlock，无法进入 Phase 1A 决策。',
} satisfies PageBuilderCmsApplyDecisionResult

type _ApplyInputIntent = Assert<IsExact<PageBuilderCmsApplySkillInput['applyIntent'], 'replace-current'>>
type _TargetBlockKind = Assert<IsExact<PageBuilderCmsApplySkillInput['targetBlock']['blockTypeHint'], 'nav' | 'catalog-list' | 'content-list' | undefined>>
type _ExampleCatalogNavSelection = Assert<
  IsExact<
    PageBuilderCmsApplyExampleCatalogNavInput['selection'],
    Extract<PageBuilderCmsApplySkillInput['selection'], { selectionKind: 'catalogs' }>
  >
>
type _ExampleContentListSelection = Assert<
  IsExact<
    PageBuilderCmsApplyExampleContentListInput['selection'],
    Extract<PageBuilderCmsApplySkillInput['selection'], { selectionKind: 'contents' }>
  >
>
type _ReadyStatus = Assert<IsExact<Extract<PageBuilderCmsApplyDecisionResult, { status: 'ready' }>['renderMode'], 'replace-current'>>
type _ClarificationKind = Assert<
  IsExact<
    Extract<PageBuilderCmsApplyDecisionResult, { status: 'needs-clarification' }>['clarification']['kind'],
    'target-block-intent' | 'catalog-nav-scope' | 'content-presentation' | 'apply-boundary-confirmation'
  >
>
type _IncompatibleReason = Assert<
  IsExact<
    Extract<PageBuilderCmsApplyDecisionResult, { status: 'incompatible' }>['reasonCode'],
    | 'malformed-payload'
    | 'unsupported-block-kind'
    | 'selection-block-mismatch'
    | 'requires-page-reflow'
    | 'unsupported-runtime-capability'
    | 'unsupported-apply-strategy'
  >
>

void catalogApplyInput
void catalogListApplyInput
void contentApplyInput
void fixedContentsApplyInput
void readyDecision
void needsClarificationDecision
void incompatibleDecision
void malformedPayloadDecision
