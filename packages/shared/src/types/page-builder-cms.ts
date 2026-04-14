export interface PageBuilderCmsCatalogQuery {
  contentType?: string
  searchKeyword?: string
}

export interface PageBuilderCmsContentQuery {
  catalogId: string
  keyword?: string
  pageIndex?: number
  pageSize?: number
}

export interface PageBuilderCmsCatalog {
  id: string
  name: string
  parentId: string | null
  path: string
  contentType: string
  contentTypeName: string
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

export const PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION = 2

interface PageBuilderCmsSelectionResultBase {
  version: typeof PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION
  targetSelection: PageBuilderTargetSelection
  targetBlock: PageBuilderCmsSelectionTargetBlock
}

export interface PageBuilderCmsCatalogSelectionResult extends PageBuilderCmsSelectionResultBase {
  selectionKind: 'catalogs'
  sourceType: 'catalogs'
  selectionMode: 'single' | 'multiple'
  catalogIds: string[]
  snapshot: {
    catalogs: PageBuilderCmsCatalog[]
  }
}

export interface PageBuilderCmsFixedContentsSelectionResult extends PageBuilderCmsSelectionResultBase {
  selectionKind: 'contents'
  sourceType: 'contents-fixed'
  selectionMode: 'fixed-items'
  catalogIds: string[]
  contentIds: string[]
  snapshot: {
    contents: PageBuilderCmsContentSummary[]
  }
}

export type PageBuilderCmsSelectionResult =
  | PageBuilderCmsCatalogSelectionResult
  | PageBuilderCmsFixedContentsSelectionResult
