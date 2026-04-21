import type {
  PageBuilderCmsCatalog,
  PageBuilderCmsContentSummary,
  PageBuilderCmsSiteSummary,
  PageBuilderCmsSelectionRequestContext,
  PageBuilderCmsSelectionResult,
} from './page-builder-cms'
import { createPageBuilderBlockTargetSelection } from './page-builder-target-selection'

type Assert<T extends true> = T
type IsExact<T, Expected> = (<G>() => G extends T ? 1 : 2) extends (<G>() => G extends Expected ? 1 : 2)
  ? (<G>() => G extends Expected ? 1 : 2) extends (<G>() => G extends T ? 1 : 2)
    ? true
    : false
  : false

const requestContext: PageBuilderCmsSelectionRequestContext = {
  entryPoint: 'block-toolbar',
  targetSelection: createPageBuilderBlockTargetSelection('#hero-banner'),
  targetBlock: {
    selector: '#hero-banner',
  },
}

const catalogSnapshot = {} as PageBuilderCmsCatalog
const contentSnapshot = {} as PageBuilderCmsContentSummary
const siteSummary = {} as PageBuilderCmsSiteSummary

const catalogsByParentSelection = {
  version: 6,
  siteId: '14',
  targetSelection: requestContext.targetSelection,
  targetBlock: requestContext.targetBlock,
  selectionKind: 'catalogs',
  sourceType: 'catalogs-by-parent',
  selectionMode: 'children-of-parent',
  parentCatalogId: 'catalog-parent',
  snapshot: {
    parentCatalog: catalogSnapshot,
  },
} satisfies PageBuilderCmsSelectionResult

const catalogsByIdsSelection = {
  version: 6,
  siteId: '14',
  targetSelection: requestContext.targetSelection,
  targetBlock: requestContext.targetBlock,
  selectionKind: 'catalogs',
  sourceType: 'catalogs-by-ids',
  selectionMode: 'fixed-items',
  catalogIds: ['catalog-1', 'catalog-2'],
  snapshot: {
    catalogs: [catalogSnapshot],
  },
} satisfies PageBuilderCmsSelectionResult

const contentsByCatalogSelection = {
  version: 6,
  siteId: '14',
  targetSelection: requestContext.targetSelection,
  targetBlock: requestContext.targetBlock,
  selectionKind: 'contents',
  sourceType: 'contents-by-catalog',
  selectionMode: 'by-catalog',
  catalogId: 'catalog-1',
  snapshot: {
    catalog: catalogSnapshot,
  },
} satisfies PageBuilderCmsSelectionResult

const contentsByIdsSelection = {
  version: 6,
  siteId: '14',
  targetSelection: requestContext.targetSelection,
  targetBlock: requestContext.targetBlock,
  selectionKind: 'contents',
  sourceType: 'contents-by-ids',
  selectionMode: 'fixed-items',
  catalogId: 'catalog-1',
  contentIds: ['content-1'],
  snapshot: {
    contents: [contentSnapshot],
  },
} satisfies PageBuilderCmsSelectionResult

type CatalogBranch = Extract<PageBuilderCmsSelectionResult, { selectionKind: 'catalogs' }>
type ContentBranch = Extract<PageBuilderCmsSelectionResult, { selectionKind: 'contents' }>

type _SiteSummaryId = Assert<IsExact<PageBuilderCmsSiteSummary['id'], string>>
type _SiteSummaryName = Assert<IsExact<PageBuilderCmsSiteSummary['name'], string>>
type _SiteSummaryParentId = Assert<IsExact<PageBuilderCmsSiteSummary['parentId'], string | null>>
type _SelectionSiteId = Assert<IsExact<PageBuilderCmsSelectionResult['siteId'], string>>
type _CatalogSelectionMode = Assert<IsExact<CatalogBranch['selectionMode'], 'children-of-parent' | 'fixed-items'>>
type _CatalogSourceType = Assert<IsExact<CatalogBranch['sourceType'], 'catalogs-by-parent' | 'catalogs-by-ids'>>
type _ContentSelectionMode = Assert<IsExact<ContentBranch['selectionMode'], 'by-catalog' | 'fixed-items'>>
type _ContentSourceType = Assert<IsExact<ContentBranch['sourceType'], 'contents-by-catalog' | 'contents-by-ids'>>

void catalogsByParentSelection
void catalogsByIdsSelection
void contentsByCatalogSelection
void contentsByIdsSelection
void siteSummary
