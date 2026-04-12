import type { PageBuilderCmsCatalog } from '@proma/shared'

export interface CmsCatalogItemViewModel {
  id: string
  name: string
  path: string
  parentId: string | null
  hasChild: boolean
  total: number
  contentType: string
  contentTypeName: string
  children: CmsCatalogItemViewModel[]
}

export function mapCatalog(record: PageBuilderCmsCatalog): CmsCatalogItemViewModel {
  return {
    id: record.id,
    name: record.name,
    path: record.path,
    parentId: record.parentId,
    hasChild: record.hasChild,
    total: record.total,
    contentType: record.contentType,
    contentTypeName: record.contentTypeName,
    children: record.children.map(mapCatalog),
  }
}
