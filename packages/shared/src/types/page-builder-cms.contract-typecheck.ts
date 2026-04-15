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

const catalogSelection = {
  version: 3,
  siteId: '14',
  targetSelection: requestContext.targetSelection,
  targetBlock: requestContext.targetBlock,
  selectionKind: 'catalogs',
  sourceType: 'catalogs',
  selectionMode: 'single',
  catalogIds: ['catalog-1'],
  snapshot: {
    catalogs: [catalogSnapshot],
  },
} satisfies PageBuilderCmsSelectionResult

const contentSelection = {
  version: 3,
  siteId: '14',
  targetSelection: requestContext.targetSelection,
  targetBlock: requestContext.targetBlock,
  selectionKind: 'contents',
  sourceType: 'contents-fixed',
  selectionMode: 'fixed-items',
  catalogIds: ['catalog-1'],
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
type _CatalogSelectionMode = Assert<IsExact<CatalogBranch['selectionMode'], 'single' | 'multiple'>>
type _CatalogSourceType = Assert<IsExact<CatalogBranch['sourceType'], 'catalogs'>>
type _ContentSelectionMode = Assert<IsExact<ContentBranch['selectionMode'], 'fixed-items'>>
type _ContentSourceType = Assert<IsExact<ContentBranch['sourceType'], 'contents-fixed'>>

void catalogSelection
void contentSelection
void siteSummary
