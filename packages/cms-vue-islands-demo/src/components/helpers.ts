import { inject } from 'vue'
import type { CmsRuntimeClient, CmsSlotError } from '../runtime/cms-runtime-client'
import { CMS_RUNTIME_CLIENT_KEY, type CmsCatalogItemViewModel, type CmsContentItemViewModel } from '../runtime/cms-runtime-client'
import { normalizeLevel, toPositiveNumber } from '../runtime/view-models'

export function createCatalogQuery(props: Record<string, unknown>) {
  return {
    level: normalizeLevel(props.level),
    parentId: typeof props.parentId === 'string' && props.parentId ? props.parentId : undefined,
    contentType: typeof props.contentType === 'string' && props.contentType ? props.contentType : undefined,
    searchKeyword: typeof props.searchKeyword === 'string' && props.searchKeyword ? props.searchKeyword : undefined,
    take: toPositiveNumber(props.take),
  }
}

export function createContentQuery(props: Record<string, unknown>) {
  return {
    catalogId: String(props.catalogId ?? ''),
    contentSelectType:
      typeof props.contentSelectType === 'string' && props.contentSelectType
        ? props.contentSelectType
        : undefined,
    keyword: typeof props.keyword === 'string' && props.keyword ? props.keyword : undefined,
    title: typeof props.title === 'string' && props.title ? props.title : undefined,
    pageIndex: toPositiveNumber(props.pageIndex),
    pageSize: toPositiveNumber(props.pageSize),
  }
}

export function useInjectedCmsClient(): CmsRuntimeClient {
  const client = inject<CmsRuntimeClient | null>(CMS_RUNTIME_CLIENT_KEY, null)
  if (!client) {
    throw new Error('Missing CMS runtime client')
  }

  return client
}

export function renderCmsSlot<T extends CmsCatalogItemViewModel | CmsContentItemViewModel>(
  items: T[],
  loading: boolean,
  error: CmsSlotError | null,
  slots: Record<string, ((scope: Record<string, unknown>) => unknown) | undefined>,
) {
  const scope = {
    items,
    loading,
    error,
    empty: !loading && items.length === 0,
  }

  if (error && slots.error) {
    return slots.error({ error })
  }

  if (!loading && items.length === 0) {
    return slots.empty ? slots.empty(scope) : null
  }

  if (slots.default) {
    return slots.default(scope)
  }

  return null
}
