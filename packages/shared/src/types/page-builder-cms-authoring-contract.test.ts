import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const CONTRACT_PATH = fileURLToPath(new URL('./page-builder-cms-authoring-contract.ts', import.meta.url))

describe('page-builder CMS authoring contract', () => {
  test('exposes a canonical contract file from shared types', async () => {
    expect(existsSync(CONTRACT_PATH)).toBe(true)
    if (!existsSync(CONTRACT_PATH)) {
      return
    }

    const module = await import(pathToFileURL(CONTRACT_PATH).href) as {
      PAGE_BUILDER_CMS_AUTHORING_CONTRACT_VERSION: number
      PAGE_BUILDER_CMS_AUTHORING_CONTRACT: {
        slotScope: readonly string[]
        allowedSlotHelpers: readonly string[]
        forbiddenStructures: readonly string[]
        components: Record<string, {
          allowedProps: readonly string[]
          itemFields: readonly string[]
          itemFieldMeta: readonly {
            name: string
            type: string
            optional: boolean
            description: string
            recommendedUsage?: string
          }[]
        }>
      }
    }

    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT_VERSION).toBeGreaterThan(0)
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT_VERSION).toBe(5)
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT.slotScope).toEqual(['items', 'loading', 'error', 'empty'])
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT.allowedSlotHelpers).toEqual([])
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT.forbiddenStructures).toEqual(expect.arrayContaining([
      'nested-cms-islands',
      'dangerous-tags',
      'outer-slot-wrapper',
    ]))
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components['cms-catalog']).toEqual(expect.objectContaining({
      allowedProps: ['site-id', 'ids', 'level', 'parent-id', 'content-type', 'search-keyword', 'take'],
      itemFields: ['id', 'name', 'path', 'parentId', 'logoUrl', 'hasChild', 'total', 'contentType', 'contentTypeName', 'children'],
      itemFieldMeta: expect.arrayContaining([
        expect.objectContaining({
          name: 'path',
          type: 'string',
          optional: false,
          description: 'Catalog navigation URL.',
          recommendedUsage: expect.stringContaining('target="_blank"'),
        }),
        expect.objectContaining({
          name: 'logoUrl',
          type: 'string',
          optional: true,
          description: 'Optional catalog logo or thumbnail URL.',
        }),
      ]),
      recommendedLinkField: 'path',
      recommendedImageField: 'logoUrl',
    }))
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components['cms-content']).toEqual(expect.objectContaining({
      allowedProps: ['site-id', 'ids', 'catalog-id', 'keyword', 'page-index', 'page-size'],
      itemFields: ['id', 'catalogId', 'title', 'summary', 'publishUrl', 'listLogoUrl', 'addedAt'],
      itemFieldMeta: expect.arrayContaining([
        expect.objectContaining({
          name: 'publishUrl',
          type: 'string',
          optional: false,
          description: 'Content detail URL.',
          recommendedUsage: expect.stringContaining('target="_blank"'),
        }),
        expect.objectContaining({
          name: 'listLogoUrl',
          type: 'string',
          optional: true,
          description: 'Optional list thumbnail or cover image URL.',
        }),
        expect.objectContaining({ name: 'addedAt', type: 'string', optional: true }),
      ]),
    }))
  })

  test('builds a compact component digest for handoff and prompt guidance', async () => {
    expect(existsSync(CONTRACT_PATH)).toBe(true)
    if (!existsSync(CONTRACT_PATH)) {
      return
    }

    const module = await import(pathToFileURL(CONTRACT_PATH).href) as {
      buildPageBuilderCmsAuthoringDigest: (component: 'cms-catalog' | 'cms-content', sourceType: string) => {
        component: string
        sourceType: string
        allowedProps: string[]
        requiredProps: string[]
        slotScope: string[]
        itemFields: string[]
        itemFieldMeta: {
          name: string
          type: string
          optional: boolean
          description: string
          recommendedUsage?: string
        }[]
        recommendedLinkField?: string
        recommendedImageField?: string
        allowedSlotHelpers: string[]
        forbiddenStructures: string[]
      }
    }

    const digest = module.buildPageBuilderCmsAuthoringDigest('cms-content', 'contents-by-ids')
    expect(digest).toEqual({
      component: 'cms-content',
      sourceType: 'contents-by-ids',
      allowedProps: ['site-id', 'ids', 'catalog-id', 'keyword', 'page-index', 'page-size'],
      requiredProps: ['site-id', 'catalog-id', 'ids'],
      slotScope: ['items', 'loading', 'error', 'empty'],
      itemFields: ['id', 'catalogId', 'title', 'summary', 'publishUrl', 'listLogoUrl', 'addedAt'],
      itemFieldMeta: [
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
          recommendedUsage: 'Use :href="item.publishUrl" for content links; add target="_blank" rel="noopener noreferrer" when opening CMS destinations in a new window.',
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
      ],
      recommendedLinkField: 'publishUrl',
      recommendedImageField: 'listLogoUrl',
      allowedSlotHelpers: [],
      forbiddenStructures: ['nested-cms-islands', 'dangerous-tags', 'outer-slot-wrapper'],
    })
  })

  test('derives an ordinary existing-region digest from the same canonical contract', async () => {
    expect(existsSync(CONTRACT_PATH)).toBe(true)
    if (!existsSync(CONTRACT_PATH)) {
      return
    }

    const module = await import(pathToFileURL(CONTRACT_PATH).href) as {
      buildPageBuilderCmsOrdinaryAuthoringDigest: (component: 'cms-catalog' | 'cms-content', sourceType: string) => {
        mode: string
        component: string
        sourceType: string
        boundary: {
          editBoundary: string
          sourceFirst: boolean
          queryPropsChangeRequiresConfirmedApply: boolean
          runtimeOnlyAttrsAreNotAuthoringSurface: boolean
          vueSyntaxInsideSourceTagOnly: boolean
          nonCmsRegionsHtmlOnly: boolean
        }
      }
    }

    expect(module.buildPageBuilderCmsOrdinaryAuthoringDigest('cms-catalog', 'catalogs-by-parent')).toMatchObject({
      mode: 'ordinary-existing-region',
      component: 'cms-catalog',
      sourceType: 'catalogs-by-parent',
      boundary: {
        editBoundary: 'source-atomic',
        sourceFirst: true,
        queryPropsChangeRequiresConfirmedApply: true,
        runtimeOnlyAttrsAreNotAuthoringSurface: true,
        vueSyntaxInsideSourceTagOnly: true,
        nonCmsRegionsHtmlOnly: true,
      },
    })
  })

  test('infers sourceType from the existing cms source tag outer html', async () => {
    expect(existsSync(CONTRACT_PATH)).toBe(true)
    if (!existsSync(CONTRACT_PATH)) {
      return
    }

    const module = await import(pathToFileURL(CONTRACT_PATH).href) as {
      resolvePageBuilderCmsAuthoringSourceTypeFromSourceTag: (
        component: 'cms-catalog' | 'cms-content',
        sourceTagOuterHtml: string,
      ) => string
    }

    expect(module.resolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
      'cms-catalog',
      '<cms-catalog site-id="14" ids="nav-a,nav-b"></cms-catalog>',
    )).toBe('catalogs-by-ids')
    expect(module.resolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
      'cms-catalog',
      '<cms-catalog site-id="14" level="children" parent-id="7"></cms-catalog>',
    )).toBe('catalogs-by-parent')
    expect(module.resolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
      'cms-content',
      '<cms-content site-id="14" catalog-id="news" ids="c-1,c-2"></cms-content>',
    )).toBe('contents-by-ids')
    expect(module.resolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
      'cms-content',
      '<cms-content site-id="14" catalog-id="news" page-size="4"></cms-content>',
    )).toBe('contents-by-catalog')
  })

  test('keeps sourceType derivation conservative when source props are missing or conflicting', async () => {
    expect(existsSync(CONTRACT_PATH)).toBe(true)
    if (!existsSync(CONTRACT_PATH)) {
      return
    }

    const module = await import(pathToFileURL(CONTRACT_PATH).href) as {
      tryResolvePageBuilderCmsAuthoringSourceTypeFromSourceTag: (
        component: 'cms-catalog' | 'cms-content',
        sourceTagOuterHtml: string,
      ) => unknown
      resolvePageBuilderCmsAuthoringSourceTypeFromSourceTag: (
        component: 'cms-catalog' | 'cms-content',
        sourceTagOuterHtml: string,
      ) => string
    }

    expect(module.tryResolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
      'cms-content',
      '<cms-content catalog-id="news"></cms-content>',
    )).toEqual({
      status: 'unresolved',
      reason: 'missing-required-props',
      missingProps: ['site-id'],
    })

    expect(module.tryResolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
      'cms-content',
      '<cms-content site-id="14" catalog-id="news" ids="c-1" page-size="4"></cms-content>',
    )).toEqual({
      status: 'unresolved',
      reason: 'conflicting-source-props',
      conflictingProps: ['page-size'],
    })

    expect(() => module.resolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
      'cms-catalog',
      '<cms-catalog site-id="14" parent-id="7"></cms-catalog>',
    )).toThrow('Unable to resolve CMS authoring sourceType')
  })
})
