import type {
  PageBuilderCmsCatalogList,
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
} from '@proma/shared'
import type { InjectionKey } from 'vue'
import type { CmsCatalogItemViewModel } from '../viewmodel/catalog'
import type { CmsContentItemViewModel } from '../viewmodel/content'

export interface CmsRuntimeClient {
  listCatalogs(query?: PageBuilderCmsCatalogQuery): Promise<PageBuilderCmsCatalogList>
  listContents(query: PageBuilderCmsContentQuery): Promise<PageBuilderCmsContentList>
}

export interface CmsSlotError {
  message: string
}

export interface CmsSlotScope<TItem> {
  items: TItem[]
  loading: boolean
  error: CmsSlotError | null
  empty: boolean
}

export type CmsComponentItemViewModel = CmsCatalogItemViewModel | CmsContentItemViewModel

export const CMS_RUNTIME_CLIENT_KEY: InjectionKey<CmsRuntimeClient> = Symbol(
  'page-builder-cms-rendering.cms-runtime-client',
)
