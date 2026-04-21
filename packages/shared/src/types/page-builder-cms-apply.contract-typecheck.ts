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
const catalogItemFields = ['id', 'name', 'path', 'parentId', 'logoUrl', 'hasChild', 'total', 'contentType', 'contentTypeName', 'children'] as const
const contentItemFields = ['id', 'catalogId', 'title', 'summary', 'publishUrl', 'listLogoUrl', 'addedAt'] as const
const catalogItemFieldMeta = [
  { name: 'id', type: 'string', optional: false, description: 'Catalog identifier.', recommendedUsage: 'Use as the stable :key when iterating catalogs.' },
  { name: 'name', type: 'string', optional: false, description: 'Catalog display name.', recommendedUsage: 'Render as the visible catalog label.' },
  { name: 'path', type: 'string', optional: false, description: 'Catalog detail URL/path.', recommendedUsage: 'Use :href=\"item.path\" for catalog links.' },
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
  { name: 'publishUrl', type: 'string', optional: false, description: 'Content detail URL.', recommendedUsage: 'Use :href=\"item.publishUrl\" for content links.' },
  { name: 'listLogoUrl', type: 'string', optional: true, description: 'Optional list thumbnail or cover image URL.', recommendedUsage: 'Guard with v-if before binding to <img :src>.' },
  { name: 'addedAt', type: 'string', optional: true, description: 'Optional publish/add time string.', recommendedUsage: 'Render only when the current design needs date metadata and guard for absence.' },
] as const

const catalogApplyInput = {
  version: 8,
  handoffId: 'handoff-catalog-parent',
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
    version: 6,
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
  authoringContext: {
    component: 'cms-catalog',
    sourceType: 'catalogs-by-parent',
    allowedProps: ['site-id', 'ids', 'level', 'parent-id', 'content-type', 'search-keyword', 'take'],
    requiredProps: ['site-id', 'level', 'parent-id'],
    slotScope: ['items', 'loading', 'error', 'empty'],
    itemFields: [...catalogItemFields],
    itemFieldMeta: [...catalogItemFieldMeta],
    recommendedLinkField: 'path',
    forbiddenStructures: ['nested-cms-islands', 'dangerous-tags', 'outer-slot-wrapper'],
  },
  targetSnapshot: {
    kind: 'block',
    selector: '#main-nav',
    parentBlockSelector: '#main-nav',
    targetOuterHtml: '<nav id="main-nav"></nav>',
  },
  authoringRevision: 'rev-catalog-parent',
} satisfies PageBuilderCmsApplySkillInput

const catalogListApplyInput = {
  version: 8,
  handoffId: 'handoff-catalog-list',
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
    version: 6,
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
  authoringContext: {
    component: 'cms-catalog',
    sourceType: 'catalogs-by-ids',
    allowedProps: ['site-id', 'ids', 'level', 'parent-id', 'content-type', 'search-keyword', 'take'],
    requiredProps: ['site-id', 'ids'],
    slotScope: ['items', 'loading', 'error', 'empty'],
    itemFields: [...catalogItemFields],
    itemFieldMeta: [...catalogItemFieldMeta],
    recommendedLinkField: 'path',
    forbiddenStructures: ['nested-cms-islands', 'dangerous-tags', 'outer-slot-wrapper'],
  },
  targetSnapshot: {
    kind: 'block',
    selector: '#featured-catalogs',
    parentBlockSelector: '#featured-catalogs',
    targetOuterHtml: '<section id="featured-catalogs"></section>',
  },
  authoringRevision: 'rev-catalog-list',
} satisfies PageBuilderCmsApplySkillInput

const contentApplyInput = {
  version: 8,
  handoffId: 'handoff-content-by-catalog',
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
    version: 6,
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
  authoringContext: {
    component: 'cms-content',
    sourceType: 'contents-by-catalog',
    allowedProps: ['site-id', 'ids', 'catalog-id', 'keyword', 'page-index', 'page-size'],
    requiredProps: ['site-id', 'catalog-id'],
    slotScope: ['items', 'loading', 'error', 'empty'],
    itemFields: [...contentItemFields],
    itemFieldMeta: [...contentItemFieldMeta],
    recommendedLinkField: 'publishUrl',
    recommendedImageField: 'listLogoUrl',
    forbiddenStructures: ['nested-cms-islands', 'dangerous-tags', 'outer-slot-wrapper'],
  },
  targetSnapshot: {
    kind: 'block',
    selector: '#latest-news',
    parentBlockSelector: '#latest-news',
    targetOuterHtml: '<section id="latest-news"></section>',
  },
  authoringRevision: 'rev-content-by-catalog',
} satisfies PageBuilderCmsApplySkillInput

const fixedContentsApplyInput = {
  version: 8,
  handoffId: 'handoff-content-fixed',
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
    version: 6,
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
  authoringContext: {
    component: 'cms-content',
    sourceType: 'contents-by-ids',
    allowedProps: ['site-id', 'ids', 'catalog-id', 'keyword', 'page-index', 'page-size'],
    requiredProps: ['site-id', 'catalog-id', 'ids'],
    slotScope: ['items', 'loading', 'error', 'empty'],
    itemFields: [...contentItemFields],
    itemFieldMeta: [...contentItemFieldMeta],
    recommendedLinkField: 'publishUrl',
    recommendedImageField: 'listLogoUrl',
    forbiddenStructures: ['nested-cms-islands', 'dangerous-tags', 'outer-slot-wrapper'],
  },
  targetSnapshot: {
    kind: 'block',
    selector: '#latest-news',
    parentBlockSelector: '#latest-news',
    targetOuterHtml: '<section id="latest-news"></section>',
  },
  authoringRevision: 'rev-content-fixed',
} satisfies PageBuilderCmsApplySkillInput

const readyDecision = {
  status: 'ready',
  targetBlockKind: 'catalog-list',
  supportedRenderModes: ['replace-current'],
  renderMode: 'replace-current',
  applyStrategy: 'replace-current',
  mappingKind: 'catalog-nav',
  toolKind: 'catalog-nav',
  source: {
    siteId: '14',
    ids: ['catalog-1'],
  },
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
