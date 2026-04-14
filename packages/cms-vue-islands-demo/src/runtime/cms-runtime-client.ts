export interface CmsCatalogItemViewModel {
  id: string
  name: string
  path: string
  parentId: string | null
  hasChild: boolean
  total: number
  contentType: string
  contentTypeName: string
}

export interface CmsContentItemViewModel {
  id: string
  catalogId: string
  title: string
  summary: string
  publishUrl: string
  listLogoUrl?: string
  addedAt?: string
  shape: string
  assetCounts: {
    images: number
    audios: number
    videos: number
    files: number
  }
}

export interface CmsRuntimeClient {
  listCatalogs(query?: {
    level?: string
    parentId?: string
    contentType?: string
    searchKeyword?: string
    take?: number
  }): Promise<{ items: CmsCatalogItemViewModel[] }>
  listContents(query: {
    catalogId: string
    contentSelectType?: string
    keyword?: string
    title?: string
    pageIndex?: number
    pageSize?: number
  }): Promise<{ items: CmsContentItemViewModel[]; total: number }>
}

export const CMS_RUNTIME_CLIENT_KEY = '__cms_runtime_client__'

export interface CmsSlotError {
  message: string
}
