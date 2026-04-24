import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PageBuilderCmsSelectionResult } from '@proma/shared'
import {
  PAGE_BUILDER_CMS_DECIDE_TOOL_NAME,
  buildPageBuilderCmsApplySkillInput,
  createPageBuilderBlockTargetSelection,
} from '@proma/shared'
import { CMS_TOOL_NAMES, buildCmsRuntimeToolBundle } from './cms-sdk-tools'
import { createPageBuilderCmsAutoAgentHandoff } from './page-builder-cms-auto-agent-handoff-service'
import { pageBuilderCmsBindingDecisionStore } from './page-builder-cms-binding-decision-store'
import { getWorkspacePreviewState } from './workspace-preview-service'
import { createAgentWorkspace } from './workspace-service'

type RegisteredTool = {
  inputSchema: { parse: (input: unknown) => unknown }
  handler: (args: unknown, extra: unknown) => Promise<unknown>
}

afterEach(() => {
  pageBuilderCmsBindingDecisionStore.reset()
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

function createGateway() {
  return {
    listCatalogs: async () => ({ items: [], tree: [] }),
    listContents: async () => ({ pageIndex: 0, pageSize: 20, total: 0, totalPages: 0, items: [] }),
  }
}

function getRegisteredTools(bundle: ReturnType<typeof buildCmsRuntimeToolBundle>) {
  return (bundle.mcpServer as {
    instance: {
      _registeredTools: Record<string, RegisteredTool>
    }
  }).instance._registeredTools
}

async function invokeTool<T>(tool: RegisteredTool, input: unknown): Promise<T> {
  const parsed = tool.inputSchema.parse(input)
  const result = await tool.handler(parsed, undefined) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0]!.text) as T
}

async function expectToolRejects(tool: RegisteredTool, input: unknown, message: string): Promise<void> {
  try {
    const parsed = tool.inputSchema.parse(input)
    await tool.handler(parsed, undefined)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(message)
    return
  }

  throw new Error(`expected tool to reject with ${message}`)
}

function expectToolInputSchemaRejects(tool: RegisteredTool, input: unknown): void {
  expect(() => tool.inputSchema.parse(input)).toThrow()
}

function prepareWorkspaceHtml(workspaceSlug: string, html: string): string {
  const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspaceSlug, 'workspace-files')
  mkdirSync(workspaceFilesDir, { recursive: true })
  const entryPath = join(workspaceFilesDir, 'index.html')
  writeFileSync(entryPath, html, 'utf-8')
  return entryPath
}

function createContentSelection(selector = '#latest-news'): Extract<PageBuilderCmsSelectionResult, { selectionKind: 'contents' }> {
  return {
    version: 6,
    siteId: '14',
    targetSelection: createPageBuilderBlockTargetSelection(selector),
    targetBlock: {
      selector,
    },
    selectionKind: 'contents',
    sourceType: 'contents-by-catalog',
    selectionMode: 'by-catalog',
    catalogId: 'news',
    snapshot: {
      catalog: {
        id: 'news',
        name: '新闻',
        parentId: null,
        path: '/news',
        contentType: 'article',
        contentTypeName: '文章',
        hasChild: false,
        total: 12,
        children: [],
      },
    },
  }
}

function registerContentHandoff(
  workspace: { id: string; slug: string },
  sessionId: string,
  selection = createContentSelection(),
  options?: {
    targetOuterHtml?: string
  },
): string {
  const handoffId = `handoff:${workspace.id}:${sessionId}`
  const revision = getWorkspacePreviewState(workspace as never).revision
  if (!revision) {
    throw new Error('missing preview revision in test fixture')
  }

  pageBuilderCmsBindingDecisionStore.registerHandoff({
    handoffId,
    workspaceId: workspace.id,
    sessionId,
    input: buildPageBuilderCmsApplySkillInput(selection, {
      handoffId,
      targetSnapshot: {
        kind: 'block',
        selector: '#latest-news',
        parentBlockSelector: '#latest-news',
        targetOuterHtml: options?.targetOuterHtml ?? '<section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section>',
      },
      authoringRevision: revision,
    }),
  })

  return handoffId
}

function createReadyContentDecision() {
  return {
    status: 'ready' as const,
    targetBlockKind: 'content-list' as const,
    supportedRenderModes: ['replace-current'] as const,
    renderMode: 'replace-current' as const,
    applyStrategy: 'replace-current' as const,
    mappingKind: 'catalog-content-list' as const,
    toolKind: 'content-list' as const,
    source: {
      siteId: '14',
      catalogId: 'news',
    },
  }
}

describe('cms sdk runtime tools', () => {
  test('includes the controlled cms decision and apply tools in the page-builder cms tool surface', () => {
    const workspace = createAgentWorkspace('CMS Tool Surface', { template: 'page-builder' })
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })

    expect(CMS_TOOL_NAMES).toEqual(expect.arrayContaining([
      'mcp__cms__list_catalogs',
      'mcp__cms__list_contents',
      PAGE_BUILDER_CMS_DECIDE_TOOL_NAME,
      'mcp__cms__apply_cms_binding',
    ]))
    expect(bundle.allowedTools).toEqual(expect.arrayContaining([
      PAGE_BUILDER_CMS_DECIDE_TOOL_NAME,
      'mcp__cms__apply_cms_binding',
    ]))
  })

  test('creates a ready decision and applies cms binding through decisionId', async () => {
    const workspace = createAgentWorkspace('CMS Tool Apply Flow', { template: 'page-builder' })
    const entryPath = prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    const decision = await invokeTool<{
      status: 'ready'
      decisionId: string
      summary: { component: 'cms-content'; toolKind: 'content-list' }
    }>(tools.decide_cms_binding!, {
      handoffId,
      decision: {
        status: 'ready',
        targetBlockKind: 'content-list',
        supportedRenderModes: ['replace-current'],
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-content-list',
        toolKind: 'content-list',
        source: {
          siteId: '14',
          catalogId: 'news',
        },
      },
    })

    expect(decision).toMatchObject({
      status: 'ready',
      summary: {
        component: 'cms-content',
        toolKind: 'content-list',
      },
    })
    expect(decision.decisionId).toBeTruthy()

    const applyResult = await invokeTool<{
      applied: true
      component: 'cms-content'
      previewState: { revision: string | null }
    }>(tools.apply_cms_binding!, {
      decisionId: decision.decisionId,
      templateBody: '<section class="news-list"><article v-for="item in items" :key="item.id">{{ item.title }}</article></section>',
    })

    expect(applyResult.component).toBe('cms-content')
    expect(applyResult.previewState.revision).toBeTruthy()
    expect(readFileSync(entryPath, 'utf-8')).toContain('<cms-content ')
    await expectToolRejects(tools.apply_cms_binding!, {
      decisionId: decision.decisionId,
      templateBody: '<section class="news-list"></section>',
    }, '已经成功使用')
  })

  test('rejects decision and apply access from a different session than the confirmed handoff', async () => {
    const workspace = createAgentWorkspace('CMS Tool Session Guard', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const foreignBundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-2',
    } as never)
    const foreignTools = getRegisteredTools(foreignBundle)

    await expectToolRejects(foreignTools.decide_cms_binding!, {
      handoffId,
      decision: createReadyContentDecision(),
    }, '当前会话')

    const ownerBundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    } as never)
    const ownerTools = getRegisteredTools(ownerBundle)
    const decision = await invokeTool<{ decisionId: string }>(ownerTools.decide_cms_binding!, {
      handoffId,
      decision: createReadyContentDecision(),
    })

    await expectToolRejects(foreignTools.apply_cms_binding!, {
      decisionId: decision.decisionId,
      templateBody: '<section class="news-list"></section>',
    }, '当前会话')
  })

  test('rejects apply requests that do not have a persisted decision', async () => {
    const workspace = createAgentWorkspace('CMS Tool Missing Decision', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"></section></body></html>',
    )
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.apply_cms_binding!, {
      decisionId: 'missing-decision',
      templateBody: '<section class="news-list"></section>',
    }, '未找到可用的 CMS binding decision')
  })

  test('rejects stale decisions after the page revision changes', async () => {
    const workspace = createAgentWorkspace('CMS Tool Stale Decision', { template: 'page-builder' })
    const entryPath = prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    const decision = await invokeTool<{ decisionId: string }>(tools.decide_cms_binding!, {
      handoffId,
      decision: {
        status: 'ready',
        targetBlockKind: 'content-list',
        supportedRenderModes: ['replace-current'],
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-content-list',
        toolKind: 'content-list',
        source: {
          siteId: '14',
          catalogId: 'news',
        },
      },
    })

    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><p>page changed</p></section></body></html>',
      'utf-8',
    )

    await expectToolRejects(tools.apply_cms_binding!, {
      decisionId: decision.decisionId,
      templateBody: '<section class="news-list"></section>',
    }, '当前页面已变化')
  })

  test('keeps the decision reusable when apply fails before a successful write', async () => {
    const workspace = createAgentWorkspace('CMS Tool Retry Decision', { template: 'page-builder' })
    const entryPath = prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    const decision = await invokeTool<{ decisionId: string }>(tools.decide_cms_binding!, {
      handoffId,
      decision: {
        status: 'ready',
        targetBlockKind: 'content-list',
        supportedRenderModes: ['replace-current'],
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-content-list',
        toolKind: 'content-list',
        source: {
          siteId: '14',
          catalogId: 'news',
        },
      },
    })

    await expectToolRejects(tools.apply_cms_binding!, {
      decisionId: decision.decisionId,
      templateBody: '<script>alert(1)</script>',
    }, '不能包含 <script> 或 <style>')

    const applyResult = await invokeTool<{ applied: true }>(tools.apply_cms_binding!, {
      decisionId: decision.decisionId,
      templateBody: '<section class="news-list"><article v-for="item in items" :key="item.id">{{ item.title }}</article></section>',
    })

    expect(applyResult.applied).toBe(true)
    expect(readFileSync(entryPath, 'utf-8')).toContain('<cms-content ')
  })

  test('rejects duplicate major containers when the decision plan preserves the outer shell', async () => {
    const workspace = createAgentWorkspace('CMS Tool Structure Guardrails', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news" class="news-shell"><h2>最新动态</h2><div class="news-grid-shell"></div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1', createContentSelection(), {
      targetOuterHtml: '<section id="latest-news" data-proma-block-id="pb_blk_news" class="news-shell"><h2>最新动态</h2><div class="news-grid-shell"></div></section>',
    })
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    const decision = await invokeTool<{ decisionId: string }>(tools.decide_cms_binding!, {
      handoffId,
      decision: createReadyContentDecision(),
    })

    await expectToolRejects(tools.apply_cms_binding!, {
      decisionId: decision.decisionId,
      templateBody: '<section class="news-grid"><article v-for="item in items" :key="item.id">{{ item.title }}</article></section>',
    }, 'templateBody 与当前保留外层壳层的结构计划冲突')
  })

  test('keeps non-ready decisions on the decision stage without mutating html', async () => {
    const workspace = createAgentWorkspace('CMS Tool Non Ready Flow', { template: 'page-builder' })
    const entryPath = prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const originalHtml = readFileSync(entryPath, 'utf-8')
    const selection = createContentSelection()
    const handoff = createPageBuilderCmsAutoAgentHandoff(workspace, {
      sessionId: 'session-1',
      selection,
      uiEntryPoint: 'block-toolbar',
    })
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    } as never)
    const tools = getRegisteredTools(bundle)

    const result = await invokeTool<{
      status: 'needs-clarification'
      clarification: {
        kind: 'content-presentation'
        question: string
        options: Array<{ label: string; value: string }>
      }
    }>(tools.decide_cms_binding!, {
      handoffId: handoff.requestId,
      decision: {
        status: 'needs-clarification',
        clarification: {
          kind: 'content-presentation',
          question: '保持单列还是改为双列？',
          options: [
            { label: '单列', value: 'single-column' },
          ],
        },
      },
    })

    expect(result).toEqual({
      status: 'needs-clarification',
      clarification: {
        kind: 'content-presentation',
        question: '保持单列还是改为双列？',
        options: [
          { label: '单列', value: 'single-column' },
        ],
      },
    })
    expect(readFileSync(entryPath, 'utf-8')).toBe(originalHtml)
  })

  test('keeps decide/apply tool inputs on the slim public contract', () => {
    const workspace = createAgentWorkspace('CMS Tool Slim Contract', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    } as never)
    const tools = getRegisteredTools(bundle)

    expectToolInputSchemaRejects(tools.decide_cms_binding!, {
      handoffId,
      decision: createReadyContentDecision(),
      selection: createContentSelection(),
    })
    expectToolInputSchemaRejects(tools.apply_cms_binding!, {
      decisionId: 'decision-1',
      templateBody: '<section class="news-list"></section>',
      siteId: '14',
    })
  })

  test('keeps decide_cms_binding public schema structured instead of degrading decision to unknown', () => {
    const workspace = createAgentWorkspace('CMS Tool Decision Schema Shape', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    } as never)
    const tools = getRegisteredTools(bundle) as Record<string, RegisteredTool & {
      inputSchema: {
        shape: {
          decision?: {
            constructor?: { name?: string }
          }
        }
      }
    }>

    expect(tools.decide_cms_binding?.inputSchema.shape.decision?.constructor?.name).not.toBe('ZodUnknown')
  })

  test('accepts a legacy JSON-string decision payload and normalizes it before persisting the decision', async () => {
    const workspace = createAgentWorkspace('CMS Tool Legacy Decision String', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    } as never)
    const tools = getRegisteredTools(bundle)

    const decision = await invokeTool<{
      status: 'ready'
      decisionId: string
      summary: { component: 'cms-content'; toolKind: 'content-list' }
    }>(tools.decide_cms_binding!, {
      handoffId,
      decision: JSON.stringify(createReadyContentDecision()),
    })

    expect(decision).toMatchObject({
      status: 'ready',
      summary: {
        component: 'cms-content',
        toolKind: 'content-list',
      },
    })
    expect(decision.decisionId).toBeTruthy()
  })

  test('returns a retry-oriented error when decision is provided as an invalid JSON string', async () => {
    const workspace = createAgentWorkspace('CMS Tool Invalid Decision String', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    } as never)
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.decide_cms_binding!, {
      handoffId,
      decision: '{"status":"ready"',
    }, '`decision` 必须是结构化对象')
    await expectToolRejects(tools.decide_cms_binding!, {
      handoffId,
      decision: '{"status":"ready"',
    }, '最小 ready 示例')
  })

  test('returns a retry-oriented error when decision is an object but does not match the decision contract', async () => {
    const workspace = createAgentWorkspace('CMS Tool Invalid Decision Object', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    } as never)
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.decide_cms_binding!, {
      handoffId,
      decision: {
        status: 'ready',
        toolKind: 'catalog-nav',
        source: {
          siteId: '14',
          catalogId: 'news',
        },
      },
    }, '`decision` 不符合合约')
    await expectToolRejects(tools.decide_cms_binding!, {
      handoffId,
      decision: {
        status: 'ready',
        toolKind: 'catalog-nav',
        source: {
          siteId: '14',
          catalogId: 'news',
        },
      },
    }, '最小 ready 示例')
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
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    const parsedCatalogArgs = tools.list_catalogs!.inputSchema.parse({
      siteId: '14',
      contentType: 'Image',
      searchKeyword: '首页',
    })
    await tools.list_catalogs!.handler(parsedCatalogArgs, undefined)

    const parsedContentArgs = tools.list_contents!.inputSchema.parse({
      siteId: '14',
      catalogId: '101',
      pageIndex: 1,
      pageSize: 10,
    })
    await tools.list_contents!.handler(parsedContentArgs, undefined)

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
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    const parsedCatalogArgs = tools.list_catalogs!.inputSchema.parse({
      siteId: '14',
      ids: ['102', '101'],
    })
    await tools.list_catalogs!.handler(parsedCatalogArgs, undefined)

    const parsedContentArgs = tools.list_contents!.inputSchema.parse({
      siteId: '14',
      catalogId: '101',
      ids: ['502', '501'],
    })
    await tools.list_contents!.handler(parsedContentArgs, undefined)

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

  test('rejects fixed content ids without catalogId at the sdk schema boundary', async () => {
    const workspace = createAgentWorkspace('CMS Tool Fixed Ids Validation', { template: 'page-builder' })
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.list_contents!, {
      siteId: '14',
      ids: ['502', '501'],
    }, '固定内容 ids 查询必须同时提供 catalogId')
  })
})
