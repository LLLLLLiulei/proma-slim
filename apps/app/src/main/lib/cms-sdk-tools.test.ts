import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PageBuilderCmsSelectionResult } from '@ai-page-builder/shared'
import {
  PAGE_BUILDER_CMS_DECIDE_TOOL_NAME,
  buildPageBuilderCmsApplySkillInput,
  createPageBuilderBlockTargetSelection,
} from '@ai-page-builder/shared'
import { CmsGatewayError } from './cms-gateway'
import { CMS_TOOL_NAMES, buildCmsRuntimeToolBundle } from './cms-sdk-tools'
import { createPageBuilderCmsAutoAgentHandoff } from './page-builder-cms-auto-agent-handoff-service'
import { pageBuilderCmsBindingDecisionStore } from './page-builder-cms-binding-decision-store'
import { PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE } from './page-builder-cms-rendering-tools'
import { getWorkspacePreviewState } from './workspace-preview-service'
import { createAgentWorkspace } from './workspace-service'

type RegisteredTool = {
  description?: string
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

function getSdkToolCallHandler(bundle: ReturnType<typeof buildCmsRuntimeToolBundle>) {
  const requestHandlers = (bundle.mcpServer as {
    instance: {
      server: {
        _requestHandlers: Map<string, (
          request: {
            method: 'tools/call'
            params: {
              name: string
              arguments?: unknown
            }
          },
          extra: unknown,
        ) => Promise<{
          content?: Array<{ text?: string }>
          isError?: boolean
        }>>
      }
    }
  }).instance.server._requestHandlers

  const handler = requestHandlers.get('tools/call')
  if (!handler) {
    throw new Error('missing sdk tools/call handler in test fixture')
  }

  return handler
}

async function invokeTool<T>(tool: RegisteredTool, input: unknown): Promise<T> {
  const parsed = tool.inputSchema.parse(input)
  const result = await tool.handler(parsed, undefined) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0]!.text) as T
}

async function invokeSdkToolCall(
  bundle: ReturnType<typeof buildCmsRuntimeToolBundle>,
  toolName: string,
  input: unknown,
) {
  const handler = getSdkToolCallHandler(bundle)
  return handler({
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: input,
    },
  }, undefined)
}

async function getToolErrorMessage(tool: RegisteredTool, input: unknown): Promise<string> {
  try {
    const parsed = tool.inputSchema.parse(input)
    await tool.handler(parsed, undefined)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    return (error as Error).message
  }

  throw new Error('expected tool to reject')
}

async function getSdkToolCallErrorMessage(
  bundle: ReturnType<typeof buildCmsRuntimeToolBundle>,
  toolName: string,
  input: unknown,
): Promise<string> {
  const result = await invokeSdkToolCall(bundle, toolName, input)
  expect(result.isError).toBe(true)
  return result.content?.[0]?.text ?? ''
}

async function expectToolRejects(tool: RegisteredTool, input: unknown, message: string | string[]): Promise<void> {
  const errorMessage = await getToolErrorMessage(tool, input)
  const expectedMessages = Array.isArray(message) ? message : [message]
  for (const expectedMessage of expectedMessages) {
    expect(errorMessage).toContain(expectedMessage)
  }
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

  test('documents cms mcp argument shapes with fixed-id examples and forbidden slot-keyed payloads', () => {
    const workspace = createAgentWorkspace('CMS Tool Docs', { template: 'page-builder' })
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    expect(tools.list_catalogs?.description).toContain('ids 为栏目 ID 数组')
    expect(tools.list_catalogs?.description).toContain('不能与 contentType 或 searchKeyword 混用')
    expect(tools.list_catalogs?.description).toContain('未传 siteId 时仅查询工具会使用默认站点 1')
    expect(tools.list_catalogs?.description).toContain('{"siteId":"1","ids":["16","17"]}')

    expect(tools.list_contents?.description).toContain('栏目分页查询')
    expect(tools.list_contents?.description).toContain('固定内容查询')
    expect(tools.list_contents?.description).toContain('ids 必须是 string[]')
    expect(tools.list_contents?.description).toContain('固定 ids 模式不能传 keyword、pageIndex 或 pageSize')
    expect(tools.list_contents?.description).toContain('pageSize 仅用于本次查询分页')
    expect(tools.list_contents?.description).toContain('未传 siteId 时仅查询工具会使用默认站点 1')
    expect(tools.list_contents?.description).toContain('{"siteId":"1","catalogId":"16","ids":["257","254","251"]}')

    expect(tools.decide_cms_binding?.description).toContain('"ids":["257","254","251"]')
    expect(tools.decide_cms_binding?.description).toContain('不要使用 {"item":[...]}')
    expect(tools.decide_cms_binding?.description).toContain('supportedRenderModes 始终是 ["replace-current"]')
    expect(tools.decide_cms_binding?.description).toContain('不要使用 {"item":"replace-current"}')

    expect(tools.apply_cms_binding?.description).toContain('自动生成外层 cms-catalog / cms-content')
    expect(tools.apply_cms_binding?.description).toContain('只提供 slot 内部内容')
    expect(tools.apply_cms_binding?.description).toContain('保留现有外层壳层')
    expect(tools.apply_cms_binding?.description).not.toContain('Prefer the cms-* tag as the source root')

    expect(PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE).toContain('The tool generates the outer cms-catalog/cms-content source tag')
    expect(PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE).toContain('If the current decision preserves an existing outer shell')
    expect(PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE).not.toContain('Prefer the cms-* tag as the source root')
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
    }, [
      '该 CMS binding decision 已经成功使用',
      '重新执行 `mcp__cms__decide_cms_binding`',
      '不要重复使用当前 decisionId',
    ])
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
    }, [
      '当前会话与该 CMS handoff 不匹配',
      '重新创建 handoff',
      '不要直接调用 `mcp__cms__apply_cms_binding`',
    ])

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
    }, [
      '当前会话与该 CMS binding decision 不匹配',
      '重新执行 `mcp__cms__decide_cms_binding`',
      '不要重复使用当前 decisionId',
    ])
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
    }, [
      '未找到可用的 CMS binding decision',
      '重新执行 `mcp__cms__decide_cms_binding`',
      '不要重复使用当前 decisionId',
    ])
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
    }, [
      '当前页面已变化，原 decision 已失效',
      '重新执行 `mcp__cms__decide_cms_binding`',
      '不要重复使用当前 decisionId',
    ])
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
    }, [
      'templateBody 不能包含 <script> 或 <style>',
      '修正模板字段或工具参数后重试',
      '不要跳过校验直接写页面',
    ])

    const applyResult = await invokeTool<{ applied: true }>(tools.apply_cms_binding!, {
      decisionId: decision.decisionId,
      templateBody: '<section class="news-list"><article v-for="item in items" :key="item.id">{{ item.title }}</article></section>',
    })

    expect(applyResult.applied).toBe(true)
    expect(readFileSync(entryPath, 'utf-8')).toContain('<!-- PROMA CMS REGION: 该 cms-content 是宿主管理的 CMS binding source tag；不要为这个区域再次引入整页 Vue runtime；不要添加 Vue CDN、importmap、createApp、Vue.createApp 或 app.mount(...)；Vue 模板语法只允许出现在这个 CMS 标签内部的 slot templates 中；如需更换 CMS 数据来源或 binding props，请重新走已确认的 CMS apply 流程，不要直接手写改绑。 -->')
    expect(readFileSync(entryPath, 'utf-8')).toContain('<!-- PROMA CMS SLOT AUTHORING: 宿主管理该 CMS 标签运行时；不要在这里补整页 Vue runtime；只在下方 slot templates 中编写 Vue 模板和字段渲染。 -->')
    expect(readFileSync(entryPath, 'utf-8')).toContain('不要为这个区域再次引入整页 Vue runtime')
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
    }, [
      'templateBody 与当前保留外层壳层的结构计划冲突',
      '修正模板字段或工具参数后重试',
      '不要跳过校验直接写页面',
    ])
  })

  test('keeps non-ready decisions on the decision stage without mutating html', async () => {
    const workspace = createAgentWorkspace('CMS Tool Non Ready Flow', { template: 'page-builder' })
    const entryPath = prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const originalHtml = readFileSync(entryPath, 'utf-8')
    const selection = createContentSelection()
    const handoff = await createPageBuilderCmsAutoAgentHandoff(workspace, {
      sessionId: 'session-1',
      selection,
      uiEntryPoint: 'block-toolbar',
    }, {
      cmsGateway: {
        listCatalogs: async () => ({
          items: [{
            id: 'news',
            name: '新闻',
            parentId: null,
            path: '/news',
            contentType: 'article',
            contentTypeName: '文章',
            hasChild: false,
            total: 12,
            children: [],
          }],
          tree: [],
        }),
        listContents: async () => ({
          pageIndex: 0,
          pageSize: 1,
          total: 0,
          totalPages: 0,
          items: [],
        }),
      },
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
    const errorMessage = await getToolErrorMessage(tools.decide_cms_binding!, {
      handoffId,
      decision: '{"status":"ready"',
    })
    expect(errorMessage).toContain('按工具文档中的 ready 示例修正')
    expect(errorMessage).not.toContain('最小 ready 示例')
    expect(errorMessage).not.toContain('"targetBlockKind":"content-list"')
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
    const errorMessage = await getToolErrorMessage(tools.decide_cms_binding!, {
      handoffId,
      decision: {
        status: 'ready',
        toolKind: 'catalog-nav',
        source: {
          siteId: '14',
          catalogId: 'news',
        },
      },
    })
    expect(errorMessage).toContain('校验摘要')
    expect(errorMessage).toContain('按工具文档中的 ready 示例修正')
    expect(errorMessage).not.toContain('最小 ready 示例')
    expect(errorMessage).not.toContain('"targetBlockKind":"content-list"')
  })

  test('returns concrete decision field fixes for slot-keyed render modes and fixed content ids', async () => {
    const workspace = createAgentWorkspace('CMS Tool Slot-Keyed Decision Error', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    const errorMessage = await getToolErrorMessage(tools.decide_cms_binding!, {
      handoffId,
      decision: {
        status: 'ready',
        targetBlockKind: 'content-list',
        supportedRenderModes: {
          item: 'replace-current',
        },
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-content-list',
        toolKind: 'content-list',
        source: {
          siteId: '1',
          catalogId: '16',
          ids: {
            item: ['257', '254', '251'],
          },
        },
      },
    })

    expect(errorMessage).toContain('supportedRenderModes 应为 ["replace-current"]')
    expect(errorMessage).toContain('source.ids 应为 string[]')
    expect(errorMessage).toContain('不要使用 {"item":...} 包装')
    expect(errorMessage).toContain('请修正 decision 对象后重新调用 `mcp__cms__decide_cms_binding`')
    expect(errorMessage).not.toContain('另有')
    expect(errorMessage).not.toContain('修正 `handoffId`')
  })

  test('keeps concrete decision field fixes while preserving other validation issues', async () => {
    const workspace = createAgentWorkspace('CMS Tool Combined Decision Error', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    const errorMessage = await getToolErrorMessage(tools.decide_cms_binding!, {
      handoffId,
      decision: {
        status: 'ready',
        supportedRenderModes: {
          item: 'replace-current',
        },
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-content-list',
        toolKind: 'content-list',
        source: {
          siteId: '1',
          ids: {
            item: ['257', '254'],
          },
        },
      },
    })

    expect(errorMessage).toContain('supportedRenderModes 应为 ["replace-current"]')
    expect(errorMessage).toContain('source.ids 应为 string[]')
    expect(errorMessage).toContain('字段 targetBlockKind')
    expect(errorMessage).toContain('字段 source.catalogId')
  })

  test('rejects duplicate supportedRenderModes instead of accepting a loose array', async () => {
    const workspace = createAgentWorkspace('CMS Tool Duplicate Render Modes', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.decide_cms_binding!, {
      handoffId,
      decision: {
        ...createReadyContentDecision(),
        supportedRenderModes: ['replace-current', 'replace-current'],
      },
    }, [
      'supportedRenderModes 必须严格等于 ["replace-current"]',
      '请修正 decision 对象后重新调用 `mcp__cms__decide_cms_binding`',
    ])
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
    }, [
      '固定内容 ids 查询必须同时提供 catalogId',
      '修正 tool 参数后重试',
      '不要在不改动参数的情况下重复提交同一次调用',
    ])
  })

  test('rejects fixed catalog ids mixed with query filters before calling the gateway', async () => {
    const workspace = createAgentWorkspace('CMS Tool Catalog Fixed Ids Mixed Query Validation', { template: 'page-builder' })
    const catalogCalls: unknown[] = []
    const gateway = {
      listCatalogs: async (query: unknown) => {
        catalogCalls.push(query)
        return { items: [], tree: [] }
      },
      listContents: async () => ({ pageIndex: 0, pageSize: 20, total: 0, totalPages: 0, items: [] }),
    }
    const bundle = buildCmsRuntimeToolBundle(gateway as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.list_catalogs!, {
      siteId: '14',
      ids: ['16', '17'],
      searchKeyword: '新闻',
    }, [
      '固定栏目 ids 查询不能与 contentType 或 searchKeyword 混用',
      '正确形态：{"siteId":"...","ids":["..."]}',
    ])
    expect(catalogCalls).toEqual([])
  })

  test('rejects fixed content ids mixed with paging or search parameters before calling the gateway', async () => {
    const workspace = createAgentWorkspace('CMS Tool Fixed Ids Mixed Query Validation', { template: 'page-builder' })
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.list_contents!, {
      siteId: '14',
      catalogId: '101',
      ids: ['502', '501'],
      pageSize: 20,
    }, [
      '固定 ids 模式不要传 keyword、pageIndex 或 pageSize',
      '正确形态：{"catalogId":"...","ids":["..."]}',
    ])
  })

  test('rewrites sdk schema validation failures for list tools into guided cms errors', async () => {
    const workspace = createAgentWorkspace('CMS Tool SDK Validation Guidance', { template: 'page-builder' })
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })

    const errorMessage = await getSdkToolCallErrorMessage(bundle, 'list_contents', {
      siteId: '14',
      ids: '501',
    })

    expect(errorMessage).toContain('CMS tool 输入不合法')
    expect(errorMessage).toContain('ids 必须是 string[]')
    expect(errorMessage).toContain('正确形态：{"siteId":"...","catalogId":"...","ids":["..."]}')
    expect(errorMessage).toContain('修正 tool 参数后重试')
    expect(errorMessage).toContain('不要在不改动参数的情况下重复提交同一次调用')
    expect(errorMessage).not.toContain('MCP error -32602')
    expect(errorMessage).not.toContain('Input validation error')
    expect(errorMessage).not.toContain('"expected"')
    expect(errorMessage).not.toContain('"path"')
  })

  test('rewrites sdk schema validation failures for apply tools into guided cms errors', async () => {
    const workspace = createAgentWorkspace('CMS Tool SDK Apply Validation Guidance', { template: 'page-builder' })
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })

    const errorMessage = await getSdkToolCallErrorMessage(bundle, 'apply_cms_binding', {
      decisionId: 123,
      templateBody: 456,
    })

    expect(errorMessage).toContain('CMS apply 输入不合法')
    expect(errorMessage).toContain('修正模板字段或工具参数后重试')
    expect(errorMessage).toContain('不要跳过校验直接写页面')
    expect(errorMessage).not.toContain('MCP error -32602')
    expect(errorMessage).not.toContain('Input validation error')
    expect(errorMessage).not.toContain('"expected"')
    expect(errorMessage).not.toContain('"path"')
  })

  test('returns upstream auth guidance for list tools without leaking secrets', async () => {
    const workspace = createAgentWorkspace('CMS Tool Auth Guidance', { template: 'page-builder' })
    const gateway = {
      async listCatalogs() {
        throw new CmsGatewayError(
          'auth',
          '401 Unauthorized: Authorization Bearer raw-secret-token username=test-user password=test-pass',
        )
      },
      async listContents() {
        return { pageIndex: 0, pageSize: 20, total: 0, totalPages: 0, items: [] }
      },
    }

    const bundle = buildCmsRuntimeToolBundle(gateway as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    const errorMessage = await getToolErrorMessage(tools.list_catalogs!, { siteId: '14' })
    expect(errorMessage).toContain('CMS 上游鉴权或权限检查失败')
    expect(errorMessage).toContain('检查 CMS 配置或权限')
    expect(errorMessage).toContain('不要伪造栏目、内容、`handoffId`、`decisionId`')
    expect(errorMessage).not.toContain('raw-secret-token')
    expect(errorMessage).not.toContain('password=test-pass')
    expect(errorMessage).not.toContain('username=test-user')
  })

  test('returns upstream retry guidance for list tools on transient gateway failures', async () => {
    const workspace = createAgentWorkspace('CMS Tool Upstream Guidance', { template: 'page-builder' })
    const gateway = {
      async listCatalogs() {
        throw new CmsGatewayError('upstream', 'CMS 资源请求失败（HTTP 502）')
      },
      async listContents() {
        return { pageIndex: 0, pageSize: 20, total: 0, totalPages: 0, items: [] }
      },
    }

    const bundle = buildCmsRuntimeToolBundle(gateway as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.list_catalogs!, { siteId: '14' }, [
      'CMS 上游请求失败',
      '仅在确认上游 CMS 已恢复后稍后重试',
      '不要伪造栏目、内容、`handoffId`、`decisionId`',
    ])
  })

  test('returns handoff recovery guidance when decide_cms_binding cannot find the handoff context', async () => {
    const workspace = createAgentWorkspace('CMS Tool Missing Handoff Guidance', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.decide_cms_binding!, {
      handoffId: 'missing-handoff',
      decision: createReadyContentDecision(),
    }, [
      '未找到可用的 CMS handoff 上下文',
      '重新发起 CMS handoff',
      '不要猜测 `handoffId`',
    ])
  })

  test('returns handoff refresh guidance when decide_cms_binding sees a stale handoff', async () => {
    const workspace = createAgentWorkspace('CMS Tool Stale Handoff Guidance', { template: 'page-builder' })
    const entryPath = prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const handoffId = registerContentHandoff(workspace, 'session-1')
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><p>page changed</p></section></body></html>',
      'utf-8',
    )
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.decide_cms_binding!, {
      handoffId,
      decision: createReadyContentDecision(),
    }, [
      '当前页面已发生变化',
      '重新发起 CMS handoff',
      '不要猜测 `handoffId`',
    ])
  })

  test('returns authoring revision guidance when apply_cms_binding cannot read the current revision', async () => {
    const workspace = createAgentWorkspace('CMS Tool Missing Revision Guidance', { template: 'page-builder' })
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.apply_cms_binding!, {
      decisionId: 'decision-1',
      templateBody: '<section class="news-list"></section>',
    }, [
      '无法读取当前页面 revision',
      '重新获取最新作者态上下文',
      '不要猜测 revision',
    ])
  })

  test('falls back to a guarded default message for unexpected apply errors', async () => {
    const workspace = createAgentWorkspace('CMS Tool Default Apply Guidance', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)
    const originalReadDecisionForApply = pageBuilderCmsBindingDecisionStore.readDecisionForApply

    pageBuilderCmsBindingDecisionStore.readDecisionForApply = (() => {
      throw new Error('unexpected apply failure at /Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/cms-sdk-tools.ts password=test-pass Authorization Bearer raw-secret-token')
    }) as typeof pageBuilderCmsBindingDecisionStore.readDecisionForApply

    try {
      const errorMessage = await getToolErrorMessage(tools.apply_cms_binding!, {
        decisionId: 'decision-1',
        templateBody: '<section class="news-list"></section>',
      })
      expect(errorMessage).toContain('CMS 工具执行失败')
      expect(errorMessage).toContain('停止当前 CMS 调用链并交由宿主侧进一步排查')
      expect(errorMessage).toContain('不要伪造缺失上下文')
      expect(errorMessage).not.toContain('/Users/liu/Documents/work/learning/Proma')
      expect(errorMessage).not.toContain('/Users/liu')
      expect(errorMessage).not.toContain('raw-secret-token')
      expect(errorMessage).not.toContain('password=test-pass')
    } finally {
      pageBuilderCmsBindingDecisionStore.readDecisionForApply = originalReadDecisionForApply
    }
  })

  test('truncates verbose cms tool errors and omits fenced code blocks from the returned guidance', async () => {
    const workspace = createAgentWorkspace('CMS Tool Verbose Error Guidance', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)
    const originalReadDecisionForApply = pageBuilderCmsBindingDecisionStore.readDecisionForApply

    pageBuilderCmsBindingDecisionStore.readDecisionForApply = (() => {
      throw new Error([
        'unexpected apply failure',
        '```html',
        '<section class="very-long-debug-snippet"><article data-debug="1">debug</article></section>',
        '</html>',
        '```',
        '<div class="another-very-long-debug-snippet">'.repeat(20),
      ].join('\n'))
    }) as typeof pageBuilderCmsBindingDecisionStore.readDecisionForApply

    try {
      const errorMessage = await getToolErrorMessage(tools.apply_cms_binding!, {
        decisionId: 'decision-1',
        templateBody: '<section class="news-list"></section>',
      })
      expect(errorMessage).toContain('[代码片段已省略]')
      expect(errorMessage).not.toContain('very-long-debug-snippet')
      expect(errorMessage.length).toBeLessThan(360)
    } finally {
      pageBuilderCmsBindingDecisionStore.readDecisionForApply = originalReadDecisionForApply
    }
  })

  test('compresses verbose slot template wrappers from cms tool errors before returning guidance', async () => {
    const workspace = createAgentWorkspace('CMS Tool Template Wrapper Error Guidance', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )
    const bundle = buildCmsRuntimeToolBundle(createGateway() as never, {
      workspace,
      sessionId: 'session-1',
    })
    const tools = getRegisteredTools(bundle)
    const originalReadDecisionForApply = pageBuilderCmsBindingDecisionStore.readDecisionForApply

    pageBuilderCmsBindingDecisionStore.readDecisionForApply = (() => {
      throw new Error([
        'unexpected apply failure',
        '<template v-slot:default="{ items, loading, error, empty }">',
        '<section class="slot-debug-snippet"><article v-for="item in items" :key="item.id">{{ item.title }}</article></section>'.repeat(8),
        '</template>',
      ].join('\n'))
    }) as typeof pageBuilderCmsBindingDecisionStore.readDecisionForApply

    try {
      const errorMessage = await getToolErrorMessage(tools.apply_cms_binding!, {
        decisionId: 'decision-1',
        templateBody: '<section class="news-list"></section>',
      })
      expect(errorMessage).toContain('[模板片段已省略]')
      expect(errorMessage).not.toContain('slot-debug-snippet')
      expect(errorMessage).not.toContain('v-slot:default')
      expect(errorMessage.length).toBeLessThan(360)
    } finally {
      pageBuilderCmsBindingDecisionStore.readDecisionForApply = originalReadDecisionForApply
    }
  })
})
