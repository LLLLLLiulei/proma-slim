import type { PageBuilderCmsSelectionResult } from './page-builder-cms'

export const PAGE_BUILDER_CMS_AUTHORING_CONTRACT_VERSION = 2

export const PAGE_BUILDER_CMS_AUTHORING_SLOT_SCOPE = ['items', 'loading', 'error', 'empty'] as const
export const PAGE_BUILDER_CMS_AUTHORING_FORBIDDEN_STRUCTURES = [
  'nested-cms-islands',
  'dangerous-tags',
  'outer-slot-wrapper',
] as const

export type PageBuilderCmsAuthoringComponent = 'cms-catalog' | 'cms-content'
export type PageBuilderCmsAuthoringSourceType = PageBuilderCmsSelectionResult['sourceType']
export type PageBuilderCmsAuthoringFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'string|null'
  | 'catalog-item[]'

export interface PageBuilderCmsAuthoringSourceModeContract {
  sourceType: PageBuilderCmsAuthoringSourceType
  requiredProps: string[]
}

export interface PageBuilderCmsAuthoringFieldContract {
  name: string
  type: PageBuilderCmsAuthoringFieldType
  optional: boolean
  description: string
  recommendedUsage?: string
}

export interface PageBuilderCmsAuthoringComponentContract {
  component: PageBuilderCmsAuthoringComponent
  allowedProps: string[]
  itemFields: string[]
  itemFieldMeta: PageBuilderCmsAuthoringFieldContract[]
  sourceModes: Record<string, PageBuilderCmsAuthoringSourceModeContract>
  recommendedLinkField?: string
  recommendedImageField?: string
}

export interface PageBuilderCmsAuthoringContractDigest {
  component: PageBuilderCmsAuthoringComponent
  sourceType: PageBuilderCmsAuthoringSourceType
  allowedProps: string[]
  requiredProps: string[]
  slotScope: string[]
  itemFields: string[]
  itemFieldMeta: PageBuilderCmsAuthoringFieldContract[]
  recommendedLinkField?: string
  recommendedImageField?: string
  forbiddenStructures: string[]
}

export interface PageBuilderCmsAuthoringContract {
  version: typeof PAGE_BUILDER_CMS_AUTHORING_CONTRACT_VERSION
  slotScope: string[]
  forbiddenStructures: string[]
  legacySiteIdFallback: '1'
  components: Record<PageBuilderCmsAuthoringComponent, PageBuilderCmsAuthoringComponentContract>
}

const CMS_CATALOG_ALLOWED_PROPS = ['site-id', 'ids', 'level', 'parent-id', 'content-type', 'search-keyword', 'take'] as const
const CMS_CONTENT_ALLOWED_PROPS = ['site-id', 'ids', 'catalog-id', 'keyword', 'page-index', 'page-size'] as const

const CMS_CATALOG_ITEM_META: PageBuilderCmsAuthoringFieldContract[] = [
  {
    name: 'id',
    type: 'string',
    optional: false,
    description: 'Catalog identifier.',
    recommendedUsage: 'Use as the stable :key when iterating catalogs.',
  },
  {
    name: 'name',
    type: 'string',
    optional: false,
    description: 'Catalog display name.',
    recommendedUsage: 'Render as the visible catalog label.',
  },
  {
    name: 'path',
    type: 'string',
    optional: false,
    description: 'Catalog detail URL/path.',
    recommendedUsage: 'Use :href="item.path" for catalog links.',
  },
  {
    name: 'parentId',
    type: 'string|null',
    optional: false,
    description: 'Parent catalog identifier, or null for root catalogs.',
  },
  {
    name: 'logoUrl',
    type: 'string',
    optional: true,
    description: 'Optional catalog logo or thumbnail URL.',
    recommendedUsage: 'Guard with v-if before binding to <img :src>.',
  },
  {
    name: 'hasChild',
    type: 'boolean',
    optional: false,
    description: 'Whether the catalog has child catalogs.',
    recommendedUsage: 'Use for child-indicator UI or nested navigation affordances.',
  },
  {
    name: 'total',
    type: 'number',
    optional: false,
    description: 'Item count or total entries under the catalog.',
    recommendedUsage: 'Use for count badges when the current block design needs them.',
  },
  {
    name: 'contentType',
    type: 'string',
    optional: false,
    description: 'Internal content type code for the catalog.',
  },
  {
    name: 'contentTypeName',
    type: 'string',
    optional: false,
    description: 'Display name for the catalog content type.',
  },
  {
    name: 'children',
    type: 'catalog-item[]',
    optional: false,
    description: 'Child catalog list in the same catalog item shape.',
    recommendedUsage: 'Only use when the current structure explicitly needs nested catalogs.',
  },
]

const CMS_CONTENT_ITEM_META: PageBuilderCmsAuthoringFieldContract[] = [
  {
    name: 'id',
    type: 'string',
    optional: false,
    description: 'Content identifier.',
    recommendedUsage: 'Use as the stable :key when iterating content items.',
  },
  {
    name: 'catalogId',
    type: 'string',
    optional: false,
    description: 'Owning catalog identifier for the content item.',
  },
  {
    name: 'title',
    type: 'string',
    optional: false,
    description: 'Content title.',
    recommendedUsage: 'Use as the primary visible headline.',
  },
  {
    name: 'summary',
    type: 'string',
    optional: false,
    description: 'Content summary or excerpt.',
    recommendedUsage: 'Use for body preview text when the selected target already supports summary copy.',
  },
  {
    name: 'publishUrl',
    type: 'string',
    optional: false,
    description: 'Content detail URL.',
    recommendedUsage: 'Use :href="item.publishUrl" for content links.',
  },
  {
    name: 'listLogoUrl',
    type: 'string',
    optional: true,
    description: 'Optional list thumbnail or cover image URL.',
    recommendedUsage: 'Guard with v-if before binding to <img :src>.',
  },
  {
    name: 'addedAt',
    type: 'string',
    optional: true,
    description: 'Optional publish/add time string.',
    recommendedUsage: 'Render only when the current design needs date metadata and guard for absence.',
  },
]

const CMS_CATALOG_ITEM_FIELDS = CMS_CATALOG_ITEM_META.map((field) => field.name)
const CMS_CONTENT_ITEM_FIELDS = CMS_CONTENT_ITEM_META.map((field) => field.name)

export const PAGE_BUILDER_CMS_AUTHORING_CONTRACT: PageBuilderCmsAuthoringContract = {
  version: PAGE_BUILDER_CMS_AUTHORING_CONTRACT_VERSION,
  slotScope: [...PAGE_BUILDER_CMS_AUTHORING_SLOT_SCOPE],
  forbiddenStructures: [...PAGE_BUILDER_CMS_AUTHORING_FORBIDDEN_STRUCTURES],
  legacySiteIdFallback: '1',
  components: {
    'cms-catalog': {
      component: 'cms-catalog',
      allowedProps: [...CMS_CATALOG_ALLOWED_PROPS],
      itemFields: [...CMS_CATALOG_ITEM_FIELDS],
      itemFieldMeta: CMS_CATALOG_ITEM_META.map((field) => ({ ...field })),
      sourceModes: {
        'catalogs-by-parent': {
          sourceType: 'catalogs-by-parent',
          requiredProps: ['site-id', 'level', 'parent-id'],
        },
        'catalogs-by-ids': {
          sourceType: 'catalogs-by-ids',
          requiredProps: ['site-id', 'ids'],
        },
      },
      recommendedLinkField: 'path',
    },
    'cms-content': {
      component: 'cms-content',
      allowedProps: [...CMS_CONTENT_ALLOWED_PROPS],
      itemFields: [...CMS_CONTENT_ITEM_FIELDS],
      itemFieldMeta: CMS_CONTENT_ITEM_META.map((field) => ({ ...field })),
      sourceModes: {
        'contents-by-catalog': {
          sourceType: 'contents-by-catalog',
          requiredProps: ['site-id', 'catalog-id'],
        },
        'contents-by-ids': {
          sourceType: 'contents-by-ids',
          requiredProps: ['site-id', 'catalog-id', 'ids'],
        },
      },
      recommendedLinkField: 'publishUrl',
      recommendedImageField: 'listLogoUrl',
    },
  },
}

export function resolvePageBuilderCmsAuthoringComponent(
  selection: Pick<PageBuilderCmsSelectionResult, 'selectionKind'>,
): PageBuilderCmsAuthoringComponent {
  return selection.selectionKind === 'catalogs' ? 'cms-catalog' : 'cms-content'
}

export function buildPageBuilderCmsAuthoringDigest(
  component: PageBuilderCmsAuthoringComponent,
  sourceType: PageBuilderCmsAuthoringSourceType,
): PageBuilderCmsAuthoringContractDigest {
  const componentContract = PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components[component]
  const sourceMode = componentContract.sourceModes[sourceType]

  if (!sourceMode) {
    throw new Error(`Unsupported CMS authoring sourceType "${sourceType}" for ${component}`)
  }

  return {
    component,
    sourceType,
    allowedProps: [...componentContract.allowedProps],
    requiredProps: [...sourceMode.requiredProps],
    slotScope: [...PAGE_BUILDER_CMS_AUTHORING_CONTRACT.slotScope],
    itemFields: [...componentContract.itemFields],
    itemFieldMeta: componentContract.itemFieldMeta.map((field) => ({ ...field })),
    ...(componentContract.recommendedLinkField ? { recommendedLinkField: componentContract.recommendedLinkField } : {}),
    ...(componentContract.recommendedImageField ? { recommendedImageField: componentContract.recommendedImageField } : {}),
    forbiddenStructures: [...PAGE_BUILDER_CMS_AUTHORING_CONTRACT.forbiddenStructures],
  }
}
