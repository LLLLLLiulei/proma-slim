export interface PageBuilderCmsCatalogQuery {
  siteId?: string
  ids?: string[]
  contentType?: string
  searchKeyword?: string
}

export interface PageBuilderCmsContentQuery {
  siteId?: string
  ids?: string[]
  catalogId?: string
  keyword?: string
  pageIndex?: number
  pageSize?: number
}

export interface PageBuilderCmsSiteSummary {
  id: string
  name: string
  url: string
  parentId: string | null
  branchInnerCode: string
}

export interface PageBuilderCmsCatalog {
  id: string
  name: string
  parentId: string | null
  path: string
  contentType: string
  contentTypeName: string
  logoUrl?: string
  hasChild: boolean
  total: number
  children: PageBuilderCmsCatalog[]
}

export interface PageBuilderCmsCatalogDetail {
  id: string
  innerCode: string
  statusCode: number | null
  statusLabel: string
  name: string
  alias: string
  contentType: string
  contentTypeName: string
  description: string
  logoUrl?: string
}

export interface PageBuilderCmsContentSummary {
  id: string
  catalogId: string
  title: string
  summary: string
  listLogoUrl?: string
  addedAt?: string
  publishUrl: string
}

export interface PageBuilderCmsCatalogList {
  items: PageBuilderCmsCatalog[]
  tree: PageBuilderCmsCatalog[]
}

export interface PageBuilderCmsContentList {
  pageIndex: number
  pageSize: number
  total: number
  totalPages: number
  items: PageBuilderCmsContentSummary[]
}

import type { PageBuilderTargetSelection } from './page-builder-target-selection'

export type PageBuilderCmsSelectionEntryPoint =
  | 'block-toolbar'
  | 'agent-flow'

export interface PageBuilderCmsSelectionTargetBlock {
  selector: string
}

export interface PageBuilderCmsSelectionRequestContext {
  entryPoint?: PageBuilderCmsSelectionEntryPoint
  targetSelection: PageBuilderTargetSelection
  targetBlock: PageBuilderCmsSelectionTargetBlock
}

export const PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION = 6

interface PageBuilderCmsSelectionResultBase {
  version: typeof PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION
  siteId: string
  targetSelection: PageBuilderTargetSelection
  targetBlock: PageBuilderCmsSelectionTargetBlock
}

export interface PageBuilderCmsCatalogsByParentSelectionResult extends PageBuilderCmsSelectionResultBase {
  selectionKind: 'catalogs'
  sourceType: 'catalogs-by-parent'
  selectionMode: 'children-of-parent'
  parentCatalogId: string
  snapshot: {
    parentCatalog: PageBuilderCmsCatalog
  }
}

export interface PageBuilderCmsCatalogsByIdsSelectionResult extends PageBuilderCmsSelectionResultBase {
  selectionKind: 'catalogs'
  sourceType: 'catalogs-by-ids'
  selectionMode: 'fixed-items'
  catalogIds: string[]
  snapshot: {
    catalogs: PageBuilderCmsCatalog[]
  }
}

export interface PageBuilderCmsContentsByCatalogSelectionResult extends PageBuilderCmsSelectionResultBase {
  selectionKind: 'contents'
  sourceType: 'contents-by-catalog'
  selectionMode: 'by-catalog'
  catalogId: string
  snapshot: {
    catalog: PageBuilderCmsCatalog
  }
}

export interface PageBuilderCmsContentsByIdsSelectionResult extends PageBuilderCmsSelectionResultBase {
  selectionKind: 'contents'
  sourceType: 'contents-by-ids'
  selectionMode: 'fixed-items'
  catalogId: string
  contentIds: string[]
  snapshot: {
    contents: PageBuilderCmsContentSummary[]
  }
}

export type PageBuilderCmsSelectionResult =
  | PageBuilderCmsCatalogsByParentSelectionResult
  | PageBuilderCmsCatalogsByIdsSelectionResult
  | PageBuilderCmsContentsByCatalogSelectionResult
  | PageBuilderCmsContentsByIdsSelectionResult
