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
    expect(source).toContain('slot 内部内容')
    expect(source).toContain('不要包含外层 <template v-slot:...> 包装')
    expect(source).toContain('不要根据 CMS 浏览弹框当前的分页大小推断页面绑定的 pageSize')
    expect(source).toContain('如需限制栏目数量应使用 take')
    expect(source).toContain('templateBody')
    expect(source).toContain('emptyTemplate')
    expect(source).toContain('errorTemplate')
  })

  test('forwards explicit siteId through the sdk list tools', async () => {
    const workspace = createAgentWorkspace('CMS Tool Site Context', { template: 'page-builder' })
    const catalogCalls: unknown[] = []
    const contentCalls: unknown[] = []
    const gateway = {
      listCatalogs: async (query: unknown) => {
        catalogCalls.push(query)
        return { items: [], tree: [] }
      },
      listContents: async (query: unknown) => {
        contentCalls.push(query)
        return { pageIndex: 0, pageSize: 20, total: 0, totalPages: 0, items: [] }
      },
    }

    const bundle = buildCmsRuntimeToolBundle(gateway as never, {
      workspace,
    })
    const tools = (bundle.mcpServer as {
      instance: {
        _registeredTools: Record<string, {
          inputSchema: { parse: (input: unknown) => unknown }
          handler: (args: unknown, extra: unknown) => Promise<unknown>
        }>
      }
    }).instance._registeredTools
    const listCatalogsTool = tools.list_catalogs!
    const listContentsTool = tools.list_contents!

    const parsedCatalogArgs = listCatalogsTool.inputSchema.parse({
      siteId: '14',
      contentType: 'Image',
      searchKeyword: '首页',
    })
    await listCatalogsTool.handler(parsedCatalogArgs, undefined)

    const parsedContentArgs = listContentsTool.inputSchema.parse({
      siteId: '14',
      catalogId: '101',
      pageIndex: 1,
      pageSize: 10,
    })
    await listContentsTool.handler(parsedContentArgs, undefined)

    expect(catalogCalls).toEqual([{
      siteId: '14',
      contentType: 'Image',
      searchKeyword: '首页',
    }])
    expect(contentCalls).toEqual([{
      siteId: '14',
      catalogId: '101',
      pageIndex: 1,
      pageSize: 10,
    }])
  })

  test('forwards ordered fixed ids through the sdk list tools', async () => {
    const workspace = createAgentWorkspace('CMS Tool Fixed Ids', { template: 'page-builder' })
    const catalogCalls: unknown[] = []
    const contentCalls: unknown[] = []
    const gateway = {
      listCatalogs: async (query: unknown) => {
        catalogCalls.push(query)
        return { items: [], tree: [] }
      },
      listContents: async (query: unknown) => {
        contentCalls.push(query)
        return { pageIndex: 0, pageSize: 20, total: 0, totalPages: 0, items: [] }
      },
    }

    const bundle = buildCmsRuntimeToolBundle(gateway as never, {
      workspace,
    })
    const tools = (bundle.mcpServer as {
      instance: {
        _registeredTools: Record<string, {
          inputSchema: { parse: (input: unknown) => unknown }
          handler: (args: unknown, extra: unknown) => Promise<unknown>
        }>
      }
    }).instance._registeredTools
    const listCatalogsTool = tools.list_catalogs!
    const listContentsTool = tools.list_contents!

    const parsedCatalogArgs = listCatalogsTool.inputSchema.parse({
      siteId: '14',
      ids: ['102', '101'],
    })
    await listCatalogsTool.handler(parsedCatalogArgs, undefined)

    const parsedContentArgs = listContentsTool.inputSchema.parse({
      siteId: '14',
      catalogId: '101',
      ids: ['502', '501'],
    })
    await listContentsTool.handler(parsedContentArgs, undefined)

    expect(catalogCalls).toEqual([{
      siteId: '14',
      ids: ['102', '101'],
    }])
    expect(contentCalls).toEqual([{
      siteId: '14',
      catalogId: '101',
      ids: ['502', '501'],
    }])
  })

  test('rejects fixed content ids without catalogId at the sdk schema boundary', () => {
    const workspace = createAgentWorkspace('CMS Tool Fixed Ids Validation', { template: 'page-builder' })
    const gateway = {
      listCatalogs: async () => ({ items: [], tree: [] }),
      listContents: async () => ({ pageIndex: 0, pageSize: 20, total: 0, totalPages: 0, items: [] }),
    }

    const bundle = buildCmsRuntimeToolBundle(gateway as never, {
      workspace,
    })
    const tools = (bundle.mcpServer as {
      instance: {
        _registeredTools: Record<string, {
          inputSchema: { parse: (input: unknown) => unknown }
          handler: (args: unknown, extra: unknown) => Promise<unknown>
        }>
      }
    }).instance._registeredTools
    const listContentsTool = tools.list_contents!

    const parsedArgs = listContentsTool.inputSchema.parse({
      siteId: '14',
      ids: ['502', '501'],
    })

    expect(() => listContentsTool.handler(parsedArgs, undefined)).toThrow('固定内容 ids 查询必须同时提供 catalogId')
  })
})
