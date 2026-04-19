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
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT_VERSION).toBe(2)
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT.slotScope).toEqual(['items', 'loading', 'error', 'empty'])
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT.forbiddenStructures).toEqual(expect.arrayContaining([
      'nested-cms-islands',
      'dangerous-tags',
      'outer-slot-wrapper',
    ]))
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components['cms-catalog']).toEqual(expect.objectContaining({
      allowedProps: ['site-id', 'ids', 'level', 'parent-id', 'content-type', 'search-keyword', 'take'],
      itemFields: ['id', 'name', 'path', 'parentId', 'logoUrl', 'hasChild', 'total', 'contentType', 'contentTypeName', 'children'],
      itemFieldMeta: expect.arrayContaining([
        expect.objectContaining({ name: 'path', type: 'string', optional: false }),
        expect.objectContaining({ name: 'logoUrl', type: 'string', optional: true }),
      ]),
    }))
    expect(module.PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components['cms-content']).toEqual(expect.objectContaining({
      allowedProps: ['site-id', 'ids', 'catalog-id', 'keyword', 'page-index', 'page-size'],
      itemFields: ['id', 'catalogId', 'title', 'summary', 'publishUrl', 'listLogoUrl', 'addedAt'],
      itemFieldMeta: expect.arrayContaining([
        expect.objectContaining({ name: 'publishUrl', type: 'string', optional: false }),
        expect.objectContaining({ name: 'listLogoUrl', type: 'string', optional: true }),
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
      ],
      recommendedLinkField: 'publishUrl',
      recommendedImageField: 'listLogoUrl',
      forbiddenStructures: ['nested-cms-islands', 'dangerous-tags', 'outer-slot-wrapper'],
    })
  })
})
