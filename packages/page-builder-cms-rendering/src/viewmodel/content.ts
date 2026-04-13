import type { PageBuilderCmsContentSummary } from '@proma/shared'

export interface CmsContentItemViewModel {
  id: string
  catalogId: string
  title: string
  summary: string
  publishUrl: string
  listLogoUrl?: string
  addedAt?: string
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
  }
}
