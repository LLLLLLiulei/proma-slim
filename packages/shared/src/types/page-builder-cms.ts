export interface PageBuilderCmsCatalogQuery {
  contentType?: string
  searchKeyword?: string
}

export interface PageBuilderCmsContentQuery {
  catalogId: string
  contentSelectType?: string
  keyword?: string
  title?: string
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

export interface PageBuilderCmsAssetCounts {
  images: number
  audios: number
  videos: number
  files: number
}

export interface PageBuilderCmsAssetHint {
  url?: string
  title?: string
  name?: string
  type?: string
}

export type PageBuilderCmsContentShape =
  | 'single-article'
  | 'gallery'
  | 'video'
  | 'file'
  | 'audio'
  | 'mixed'

export interface PageBuilderCmsContentSummary {
  id: string
  catalogId: string
  title: string
  summary: string
  listLogoUrl?: string
  addedAt?: string
  publishUrl: string
  shape: PageBuilderCmsContentShape
  assetCounts: PageBuilderCmsAssetCounts
  assetHints: {
    images: PageBuilderCmsAssetHint[]
    audios: PageBuilderCmsAssetHint[]
    videos: PageBuilderCmsAssetHint[]
    files: PageBuilderCmsAssetHint[]
  }
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
