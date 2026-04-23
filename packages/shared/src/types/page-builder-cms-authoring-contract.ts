import type { PageBuilderCmsSelectionResult } from './page-builder-cms'

export const PAGE_BUILDER_CMS_AUTHORING_CONTRACT_VERSION = 3

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

export interface PageBuilderCmsOrdinaryAuthoringBoundaryDigest {
  editBoundary: 'source-atomic'
  sourceFirst: true
  queryPropsChangeRequiresConfirmedApply: true
  runtimeOnlyAttrsAreNotAuthoringSurface: true
  vueSyntaxInsideSourceTagOnly: true
  nonCmsRegionsHtmlOnly: true
}

export interface PageBuilderCmsOrdinaryAuthoringDigest extends PageBuilderCmsAuthoringContractDigest {
  mode: 'ordinary-existing-region'
  boundary: PageBuilderCmsOrdinaryAuthoringBoundaryDigest
}

export type PageBuilderCmsAuthoringSourceTypeResolutionReason =
  | 'missing-required-props'
  | 'conflicting-source-props'

export type PageBuilderCmsAuthoringSourceTypeResolution =
  | {
      status: 'resolved'
      sourceType: PageBuilderCmsAuthoringSourceType
    }
  | {
      status: 'unresolved'
      reason: PageBuilderCmsAuthoringSourceTypeResolutionReason
      missingProps?: string[]
      conflictingProps?: string[]
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
const ORDINARY_AUTHORING_BOUNDARY: PageBuilderCmsOrdinaryAuthoringBoundaryDigest = {
  editBoundary: 'source-atomic',
  sourceFirst: true,
  queryPropsChangeRequiresConfirmedApply: true,
  runtimeOnlyAttrsAreNotAuthoringSurface: true,
  vueSyntaxInsideSourceTagOnly: true,
  nonCmsRegionsHtmlOnly: true,
}

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

function readCmsSourceTagAttribute(sourceTagOuterHtml: string, attributeName: string): string | null {
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = sourceTagOuterHtml.match(new RegExp(`\\b${escapedAttributeName}\\s*=\\s*"([^"]*)"`, 'i'))
  if (!match) {
    return null
  }

  const value = match[1]?.trim() ?? ''
  return value.length > 0 ? value : null
}

function findMissingRequiredProps(
  sourceTagOuterHtml: string,
  requiredProps: readonly string[],
): string[] {
  return requiredProps.filter((prop) => !readCmsSourceTagAttribute(sourceTagOuterHtml, prop))
}

function findPresentProps(
  sourceTagOuterHtml: string,
  props: readonly string[],
): string[] {
  return props.filter((prop) => Boolean(readCmsSourceTagAttribute(sourceTagOuterHtml, prop)))
}

export function tryResolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
  component: PageBuilderCmsAuthoringComponent,
  sourceTagOuterHtml: string,
): PageBuilderCmsAuthoringSourceTypeResolution {
  const ids = readCmsSourceTagAttribute(sourceTagOuterHtml, 'ids')

  if (component === 'cms-catalog') {
    if (ids) {
      const missingProps = findMissingRequiredProps(sourceTagOuterHtml, ['site-id', 'ids'])
      const conflictingProps = findPresentProps(sourceTagOuterHtml, ['level', 'parent-id', 'content-type', 'search-keyword'])

      if (conflictingProps.length > 0) {
        return {
          status: 'unresolved',
          reason: 'conflicting-source-props',
          conflictingProps,
        }
      }

      return missingProps.length > 0
        ? {
            status: 'unresolved',
            reason: 'missing-required-props',
            missingProps,
          }
        : {
            status: 'resolved',
            sourceType: 'catalogs-by-ids',
          }
    }

    const missingProps = findMissingRequiredProps(sourceTagOuterHtml, ['site-id', 'level', 'parent-id'])
    return missingProps.length > 0
      ? {
          status: 'unresolved',
          reason: 'missing-required-props',
          missingProps,
        }
      : {
          status: 'resolved',
          sourceType: 'catalogs-by-parent',
        }
  }

  if (ids) {
    const missingProps = findMissingRequiredProps(sourceTagOuterHtml, ['site-id', 'catalog-id', 'ids'])
    const conflictingProps = findPresentProps(sourceTagOuterHtml, ['keyword', 'page-index', 'page-size'])

    if (conflictingProps.length > 0) {
      return {
        status: 'unresolved',
        reason: 'conflicting-source-props',
        conflictingProps,
      }
    }

    return missingProps.length > 0
      ? {
          status: 'unresolved',
          reason: 'missing-required-props',
          missingProps,
        }
      : {
          status: 'resolved',
          sourceType: 'contents-by-ids',
        }
  }

  const missingProps = findMissingRequiredProps(sourceTagOuterHtml, ['site-id', 'catalog-id'])
  return missingProps.length > 0
    ? {
        status: 'unresolved',
        reason: 'missing-required-props',
        missingProps,
      }
    : {
        status: 'resolved',
        sourceType: 'contents-by-catalog',
      }
}

export function resolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
  component: PageBuilderCmsAuthoringComponent,
  sourceTagOuterHtml: string,
): PageBuilderCmsAuthoringSourceType {
  const result = tryResolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(component, sourceTagOuterHtml)
  if (result.status === 'resolved') {
    return result.sourceType
  }

  const details = result.reason === 'missing-required-props'
    ? `missing ${result.missingProps?.join(', ') ?? 'required props'}`
    : `conflicting ${result.conflictingProps?.join(', ') ?? 'source props'}`
  throw new Error(`Unable to resolve CMS authoring sourceType for ${component}: ${details}`)
}

export function buildPageBuilderCmsOrdinaryAuthoringDigest(
  component: PageBuilderCmsAuthoringComponent,
  sourceType: PageBuilderCmsAuthoringSourceType,
): PageBuilderCmsOrdinaryAuthoringDigest {
  return {
    mode: 'ordinary-existing-region',
    ...buildPageBuilderCmsAuthoringDigest(component, sourceType),
    boundary: { ...ORDINARY_AUTHORING_BOUNDARY },
  }
}
