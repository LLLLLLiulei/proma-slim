import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createAgentWorkspace } from './workspace-service'
import { CMS_TOOL_NAMES, buildCmsRuntimeToolBundle } from './cms-sdk-tools'

describe('cms sdk runtime tools', () => {
  test('includes the controlled cms apply tool in the page-builder cms tool surface', () => {
    const workspace = createAgentWorkspace('CMS Tool Surface', { template: 'page-builder' })
    const gateway = {
      listCatalogs: async () => ({ items: [], tree: [] }),
      listContents: async () => ({ pageIndex: 0, pageSize: 20, total: 0, totalPages: 0, items: [] }),
    }

    const bundle = buildCmsRuntimeToolBundle(gateway as never, {
      workspace,
    })

    expect(CMS_TOOL_NAMES).toEqual(expect.arrayContaining([
      'mcp__cms__list_catalogs',
      'mcp__cms__list_contents',
      'mcp__cms__apply_cms_binding',
    ]))
    expect(bundle.allowedTools).toEqual(expect.arrayContaining([
      'mcp__cms__apply_cms_binding',
    ]))
  })

  test('documents apply_cms_binding template fields as complete dynamic regions', () => {
    const source = readFileSync(fileURLToPath(new URL('./cms-sdk-tools.ts', import.meta.url)), 'utf-8')

    expect(source).toContain('complete dynamic region')
    expect(source).toContain('templateBody')
    expect(source).toContain('emptyTemplate')
    expect(source).toContain('errorTemplate')
  })
})
