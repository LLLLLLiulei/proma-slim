import type { PageBuilderCmsContentSummary } from '@proma/shared'

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

export function mapContent(record: PageBuilderCmsContentSummary): CmsContentItemViewModel {
  return {
    id: record.id,
    catalogId: record.catalogId,
    title: record.title,
    summary: record.summary,
    publishUrl: record.publishUrl,
    listLogoUrl: record.listLogoUrl,
    addedAt: record.addedAt,
    shape: record.shape,
    assetCounts: record.assetCounts,
  }
}
