import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PageBuilderCmsSelectionResult } from '@proma/shared'
import { createPageBuilderBlockTargetSelection } from '@proma/shared'
import { CmsGatewayError } from './cms-gateway'
import {
  createPageBuilderCmsAutoAgentHandoff,
  PageBuilderCmsAutoAgentHandoffServiceError,
} from './page-builder-cms-auto-agent-handoff-service'
import { createAgentWorkspace } from './workspace-service'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

function prepareWorkspaceHtml(workspaceSlug: string, html: string) {
  const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspaceSlug, 'workspace-files')
  mkdirSync(workspaceFilesDir, { recursive: true })
  writeFileSync(join(workspaceFilesDir, 'index.html'), html, 'utf-8')
}

function createContentsByCatalogSelection(): Extract<PageBuilderCmsSelectionResult, { selectionKind: 'contents'; sourceType: 'contents-by-catalog' }> {
  return {
    version: 6,
    siteId: '14',
    targetSelection: createPageBuilderBlockTargetSelection('#latest-news'),
    targetBlock: {
      selector: '#latest-news',
    },
    selectionKind: 'contents',
    sourceType: 'contents-by-catalog',
    selectionMode: 'by-catalog',
    catalogId: 'catalog-1',
    snapshot: {
      catalog: {
        id: 'catalog-1',
        name: '树节点栏目',
        parentId: null,
        path: '',
        contentType: '',
        contentTypeName: '',
        hasChild: false,
        total: 0,
        children: [],
      },
    },
  }
}

describe('page-builder CMS auto handoff service', () => {
  test('refreshes authoritative source context for contents-by-catalog before building the handoff payload', async () => {
    const workspace = createAgentWorkspace('CMS Handoff Authority', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )

    const listCatalogsCalls: unknown[] = []
    const listContentsCalls: unknown[] = []
    const handoff = await createPageBuilderCmsAutoAgentHandoff(workspace, {
      sessionId: 'session-1',
      selection: createContentsByCatalogSelection(),
      uiEntryPoint: 'block-toolbar',
    }, {
      cmsGateway: {
        async listCatalogs(query) {
          listCatalogsCalls.push(query)
          return {
            items: [{
              id: 'catalog-1',
              name: '权威栏目',
              parentId: null,
              path: '/news',
              contentType: 'Article',
              contentTypeName: '文章',
              hasChild: false,
              total: 21,
              children: [],
            }],
            tree: [],
          }
        },
        async listContents(query) {
          listContentsCalls.push(query)
          return {
            pageIndex: 0,
            pageSize: 1,
            total: 21,
            totalPages: 21,
            items: [{
              id: 'content-1',
              catalogId: 'catalog-1',
              title: '最新动态',
              summary: '摘要',
              publishUrl: 'https://example.com/news/1',
            }],
          }
        },
      },
    })

    expect(listCatalogsCalls).toEqual([{
      siteId: '14',
      ids: ['catalog-1'],
    }])
    expect(listContentsCalls).toEqual([{
      siteId: '14',
      catalogId: 'catalog-1',
      pageIndex: 0,
      pageSize: 1,
    }])
    expect(handoff.composedUserMessage).toContain('"authoritativeSource"')
    expect(handoff.composedUserMessage).toContain('"name":"权威栏目"')
    expect(handoff.composedUserMessage).toContain('"total":21')
    expect(handoff.composedUserMessage).toContain('"name":"树节点栏目"')
  })

  test('fails closed when authoritative source refresh cannot resolve the selected catalog', async () => {
    const workspace = createAgentWorkspace('CMS Handoff Authority Missing Catalog', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )

    await expect(createPageBuilderCmsAutoAgentHandoff(workspace, {
      sessionId: 'session-1',
      selection: createContentsByCatalogSelection(),
    }, {
      cmsGateway: {
        async listCatalogs() {
          return {
            items: [],
            tree: [],
          }
        },
        async listContents() {
          throw new Error('should not reach contents probe when catalog is missing')
        },
      },
    })).rejects.toMatchObject({
      name: 'PageBuilderCmsAutoAgentHandoffServiceError',
      code: 'source-refresh-failed',
    } satisfies Partial<PageBuilderCmsAutoAgentHandoffServiceError>)
  })

  test('maps CMS gateway config failures to cms-unavailable during authoritative refresh', async () => {
    const workspace = createAgentWorkspace('CMS Handoff Config Failure', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )

    await expect(createPageBuilderCmsAutoAgentHandoff(workspace, {
      sessionId: 'session-1',
      selection: createContentsByCatalogSelection(),
    }, {
      cmsGateway: {
        async listCatalogs() {
          throw new CmsGatewayError('config', 'CMS 浏览暂不可用，请先完成宿主 CMS 配置')
        },
        async listContents() {
          throw new Error('should not reach contents probe when config is invalid')
        },
      },
    })).rejects.toMatchObject({
      name: 'PageBuilderCmsAutoAgentHandoffServiceError',
      code: 'cms-unavailable',
      message: 'CMS 浏览暂不可用，请先完成宿主 CMS 配置',
    } satisfies Partial<PageBuilderCmsAutoAgentHandoffServiceError>)
  })

  test('maps upstream CMS gateway refresh failures away from cms-unavailable', async () => {
    const workspace = createAgentWorkspace('CMS Handoff Upstream Failure', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )

    await expect(createPageBuilderCmsAutoAgentHandoff(workspace, {
      sessionId: 'session-1',
      selection: createContentsByCatalogSelection(),
    }, {
      cmsGateway: {
        async listCatalogs() {
          throw new CmsGatewayError('upstream', 'CMS 资源请求失败（HTTP 502）')
        },
        async listContents() {
          throw new Error('should not reach contents probe when upstream listCatalogs fails')
        },
      },
    })).rejects.toMatchObject({
      name: 'PageBuilderCmsAutoAgentHandoffServiceError',
      code: 'source-refresh-upstream',
      message: 'CMS 资源请求失败（HTTP 502）',
    } satisfies Partial<PageBuilderCmsAutoAgentHandoffServiceError>)
  })

  test('maps invalid CMS gateway refresh requests away from cms-unavailable', async () => {
    const workspace = createAgentWorkspace('CMS Handoff Invalid Refresh Request', { template: 'page-builder' })
    prepareWorkspaceHtml(
      workspace.slug,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
    )

    await expect(createPageBuilderCmsAutoAgentHandoff(workspace, {
      sessionId: 'session-1',
      selection: createContentsByCatalogSelection(),
    }, {
      cmsGateway: {
        async listCatalogs() {
          throw new CmsGatewayError('invalid_request', 'siteId 不能为空')
        },
        async listContents() {
          throw new Error('should not reach contents probe when listCatalogs request is invalid')
        },
      },
    })).rejects.toMatchObject({
      name: 'PageBuilderCmsAutoAgentHandoffServiceError',
      code: 'source-refresh-invalid-request',
      message: 'siteId 不能为空',
    } satisfies Partial<PageBuilderCmsAutoAgentHandoffServiceError>)
  })
})
