export interface PageBuilderCmsSettings {
  baseUrl: string
  currentSite: string
  zusid: string
}

export type PageBuilderCmsAssetKind = 'image' | 'video' | 'audio' | 'file'

export interface PageBuilderCmsAsset {
  kind: PageBuilderCmsAssetKind
  relativePath: string
  filename: string
  title?: string | null
  sizeLabel?: string | null
  width?: number | null
  height?: number | null
  durationSeconds?: number | null
}

export interface PageBuilderCmsChannel {
  id: string
  parentId: string | null
  siteId: string
  name: string
  alias: string | null
  path: string
  contentType: string | null
  contentTypeName: string | null
  channelType: string
  treeLevel: number
  total: number
  childCount: number
  hasChild: boolean
  link: string | null
  children: PageBuilderCmsChannel[]
}

export interface PageBuilderCmsContent {
  id: string
  catalogId: string
  mainCatalogId: string
  title: string
  summary: string | null
  publishDate: string | null
  publishUrl: string | null
  contentTypeId: string
  bodyText: string | null
  richTitle: string | null
  previewAsset: PageBuilderCmsAsset | null
  assets: PageBuilderCmsAsset[]
  mediaCounts: {
    images: number
    videos: number
    audios: number
    files: number
  }
  extendData: Record<string, unknown> | null
}

export interface PageBuilderCmsContentPage {
  total: number
  pageIndex: number
  pageSize: number
  items: PageBuilderCmsContent[]
}

export interface PageBuilderCmsAssetImportResult {
  relativePath: string
  workspaceRelativePath: string
  filename: string
  bytes: number
  mediaType: string
}

export type PageBuilderCmsDataSourceType =
  | 'channel-node'
  | 'channel-children'
  | 'content-item'
  | 'content-list'

export type PageBuilderCmsSelectionAction =
  | 'replace-data'
  | 'insert-above'
  | 'insert-below'
  | 'create-new-section'

export interface PageBuilderCmsSelectionItemSummary {
  id: string
  title: string
  summary?: string | null
  previewAsset?: PageBuilderCmsAsset | null
}

export interface PageBuilderCmsSelectionRequest {
  requestId: string
  sessionId: string
  workspaceId: string
  selector?: string | null
  action: PageBuilderCmsSelectionAction
  allowedSourceTypes: PageBuilderCmsDataSourceType[]
  allowedContentTypes?: string[]
  allowMultiple?: boolean
  presentationHint?: string | null
  title?: string | null
  description?: string | null
}

export interface PageBuilderCmsConfirmedSelection {
  sourceType: PageBuilderCmsDataSourceType
  stableId: string
  displayName: string
  selector?: string | null
  presentationHint?: string | null
  channelId?: string | null
  channelName?: string | null
  catalogId?: string | null
  contentId?: string | null
  contentTypeId?: string | null
  itemIds?: string[]
  items?: PageBuilderCmsSelectionItemSummary[]
}

export type PageBuilderCmsSelectionResponse =
  | {
    requestId: string
    status: 'confirmed'
    selection: PageBuilderCmsConfirmedSelection
  }
  | {
    requestId: string
    status: 'cancelled'
    reason?: 'user-cancelled' | 'session-ended' | 'aborted'
  }

export interface PageBuilderRequestCmsSelectionInput {
  selector?: string
  action?: PageBuilderCmsSelectionAction
  allowedSourceTypes?: PageBuilderCmsDataSourceType[]
  allowedContentTypes?: string[]
  allowMultiple?: boolean
  presentationHint?: string
  title?: string
  description?: string
}

export interface PageBuilderCmsListChannelsInput {
  search?: string
}

export interface PageBuilderCmsGetChannelChildrenInput {
  channelId: string
}

export interface PageBuilderCmsListContentsInput {
  catalogId: string
  title?: string
  pageIndex?: number
  pageSize?: number
}

export interface PageBuilderCmsGetContentDetailInput {
  catalogId: string
  contentId: string
}

export interface PageBuilderCmsImportAssetInput {
  relativePath: string
}
