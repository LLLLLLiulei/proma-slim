import { afterEach, describe, expect, test } from 'bun:test'
import type { PageBuilderCmsSelectionResult } from '@proma/shared'
import { buildPageBuilderCmsApplySkillInput, createPageBuilderBlockTargetSelection } from '@proma/shared'
import {
  createPageBuilderCmsBindingDecisionStore,
  PageBuilderCmsBindingDecisionStoreError,
} from './page-builder-cms-binding-decision-store'

function createCatalogSelection(): Extract<PageBuilderCmsSelectionResult, { selectionKind: 'catalogs' }> {
  return {
    version: 6,
    siteId: '14',
    targetSelection: createPageBuilderBlockTargetSelection('#main-nav'),
    targetBlock: {
      selector: '#main-nav',
    },
    selectionKind: 'catalogs',
    sourceType: 'catalogs-by-parent',
    selectionMode: 'children-of-parent',
    parentCatalogId: 'catalog-parent',
    snapshot: {
      parentCatalog: {
        id: 'catalog-parent',
        name: '栏目根节点',
        parentId: null,
        path: '/catalog-root',
        contentType: 'article',
        contentTypeName: '文章',
        hasChild: true,
        total: 8,
        children: [],
      },
    },
  }
}

function createStoreWithCatalogHandoff(currentRevision = 'rev-1') {
  const store = createPageBuilderCmsBindingDecisionStore()
  const selection = createCatalogSelection()
  store.registerHandoff({
    handoffId: 'handoff-1',
    workspaceId: 'workspace-1',
    sessionId: 'session-1',
    input: buildPageBuilderCmsApplySkillInput(selection, {
      handoffId: 'handoff-1',
      targetSnapshot: {
        kind: 'block',
        selector: '#main-nav',
        parentBlockSelector: '#main-nav',
        targetOuterHtml: '<nav id="main-nav"></nav>',
      },
      authoringRevision: currentRevision,
    }),
  })

  return store
}

function createStoreWithStructuredContentHandoff(currentRevision = 'rev-1') {
  const store = createPageBuilderCmsBindingDecisionStore()
  const selection: Extract<PageBuilderCmsSelectionResult, { selectionKind: 'contents' }> = {
    version: 6,
    siteId: '14',
    targetSelection: createPageBuilderBlockTargetSelection('#latest-news'),
    targetBlock: {
      selector: '#latest-news',
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
  store.registerHandoff({
    handoffId: 'handoff-structured',
    workspaceId: 'workspace-1',
    sessionId: 'session-1',
    input: buildPageBuilderCmsApplySkillInput(selection, {
      handoffId: 'handoff-structured',
      targetSnapshot: {
        kind: 'block',
        selector: '#latest-news',
        parentBlockSelector: '#latest-news',
        targetOuterHtml: '<section id="latest-news" class="news-shell"><h2>最新动态</h2><div class="news-grid-shell"></div></section>',
      },
      authoringRevision: currentRevision,
    }),
  })

  return store
}

afterEach(() => {
  // Test-local stores only; this hook keeps the file symmetric with other stateful suites.
})

describe('page-builder CMS binding decision store', () => {
  test('creates a persisted apply plan for ready decisions', () => {
    const store = createStoreWithCatalogHandoff()

    const result = store.createDecision({
      workspaceId: 'workspace-1',
      handoffId: 'handoff-1',
      sessionId: 'session-1',
      currentRevision: 'rev-1',
      decision: {
        status: 'ready',
        targetBlockKind: 'nav',
        supportedRenderModes: ['replace-current'],
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-nav',
        toolKind: 'catalog-nav',
        source: {
          siteId: '14',
          parentId: 'catalog-parent',
          take: 6,
        },
      },
    })

    expect(result).toMatchObject({
      status: 'ready',
      summary: {
        component: 'cms-catalog',
        toolKind: 'catalog-nav',
        targetBlockKind: 'nav',
        applyStrategy: 'replace-current',
      },
    })
    if (result.status !== 'ready') {
      throw new Error('expected ready decision result')
    }

    const record = store.readDecisionForApply({
      workspaceId: 'workspace-1',
      decisionId: result.decisionId,
      sessionId: 'session-1',
      currentRevision: 'rev-1',
    })
    expect(record.plan).toMatchObject({
      handoffId: 'handoff-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      component: 'cms-catalog',
      toolKind: 'catalog-nav',
      source: {
        siteId: '14',
        parentId: 'catalog-parent',
        take: 6,
        level: 'children',
      },
    })
  })

  test('persists preserved-shell structure guardrails for block targets that already own the major layout container', () => {
    const store = createStoreWithStructuredContentHandoff()

    const result = store.createDecision({
      workspaceId: 'workspace-1',
      handoffId: 'handoff-structured',
      sessionId: 'session-1',
      currentRevision: 'rev-1',
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

    if (result.status !== 'ready') {
      throw new Error('expected ready decision result')
    }

    const record = store.readDecisionForApply({
      workspaceId: 'workspace-1',
      decisionId: result.decisionId,
      sessionId: 'session-1',
      currentRevision: 'rev-1',
    })

    expect(record.plan.structureGuardrails).toEqual({
      shellMode: 'preserve-target-shell',
      majorContainerOwner: 'shell',
      shellSelector: '#latest-news',
      shellTagName: 'section',
      shellReason: 'existing-shell-major-container',
    })
  })

  test('passes through non-ready decisions without creating a persisted plan', () => {
    const store = createStoreWithCatalogHandoff()

    const result = store.createDecision({
      workspaceId: 'workspace-1',
      handoffId: 'handoff-1',
      sessionId: 'session-1',
      currentRevision: 'rev-1',
      decision: {
        status: 'needs-clarification',
        clarification: {
          kind: 'catalog-nav-scope',
          question: '一级平铺还是保留层级？',
          options: [
            { label: '平铺一级栏目', value: 'flat-top-level' },
          ],
        },
      },
    })

    expect(result).toEqual({
      status: 'needs-clarification',
      clarification: {
        kind: 'catalog-nav-scope',
        question: '一级平铺还是保留层级？',
        options: [
          { label: '平铺一级栏目', value: 'flat-top-level' },
        ],
      },
    })
  })

  test('rejects stale handoffs before a decision is created', () => {
    const store = createStoreWithCatalogHandoff('rev-1')

    expect(() => store.createDecision({
      workspaceId: 'workspace-1',
      handoffId: 'handoff-1',
      sessionId: 'session-1',
      currentRevision: 'rev-2',
      decision: {
        status: 'ready',
        targetBlockKind: 'nav',
        supportedRenderModes: ['replace-current'],
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-nav',
        toolKind: 'catalog-nav',
        source: {
          siteId: '14',
          parentId: 'catalog-parent',
        },
      },
    })).toThrow(PageBuilderCmsBindingDecisionStoreError)

    try {
      store.createDecision({
        workspaceId: 'workspace-1',
        handoffId: 'handoff-1',
        sessionId: 'session-1',
        currentRevision: 'rev-2',
        decision: {
          status: 'ready',
          targetBlockKind: 'nav',
          supportedRenderModes: ['replace-current'],
          renderMode: 'replace-current',
          applyStrategy: 'replace-current',
          mappingKind: 'catalog-nav',
          toolKind: 'catalog-nav',
          source: {
            siteId: '14',
            parentId: 'catalog-parent',
          },
        },
      })
    } catch (error) {
      expect(error).toBeInstanceOf(PageBuilderCmsBindingDecisionStoreError)
      expect((error as PageBuilderCmsBindingDecisionStoreError).code).toBe('handoff-stale')
    }
  })

  test('rejects creating a decision from a different session than the registered handoff', () => {
    const store = createStoreWithCatalogHandoff()

    expect(() => store.createDecision({
      workspaceId: 'workspace-1',
      handoffId: 'handoff-1',
      sessionId: 'session-2',
      currentRevision: 'rev-1',
      decision: {
        status: 'ready',
        targetBlockKind: 'nav',
        supportedRenderModes: ['replace-current'],
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-nav',
        toolKind: 'catalog-nav',
        source: {
          siteId: '14',
          parentId: 'catalog-parent',
        },
      },
    } as never)).toThrow('当前会话')
  })

  test('rejects conflicting ready-decision source fields', () => {
    const store = createStoreWithCatalogHandoff()

    expect(() => store.createDecision({
      workspaceId: 'workspace-1',
      handoffId: 'handoff-1',
      sessionId: 'session-1',
      currentRevision: 'rev-1',
      decision: {
        status: 'ready',
        targetBlockKind: 'nav',
        supportedRenderModes: ['replace-current'],
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-nav',
        toolKind: 'catalog-nav',
        source: {
          siteId: '14',
          parentId: 'catalog-parent',
          ids: ['catalog-a'],
        },
      },
    })).toThrow('不能混用 ids')
  })

  test('invalidates stale decisions and consumes successful ones', () => {
    const store = createStoreWithCatalogHandoff()
    const created = store.createDecision({
      workspaceId: 'workspace-1',
      handoffId: 'handoff-1',
      sessionId: 'session-1',
      currentRevision: 'rev-1',
      decision: {
        status: 'ready',
        targetBlockKind: 'nav',
        supportedRenderModes: ['replace-current'],
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-nav',
        toolKind: 'catalog-nav',
        source: {
          siteId: '14',
          parentId: 'catalog-parent',
        },
      },
    })
    if (created.status !== 'ready') {
      throw new Error('expected ready decision result')
    }

    expect(() => store.readDecisionForApply({
      workspaceId: 'workspace-1',
      decisionId: created.decisionId,
      sessionId: 'session-1',
      currentRevision: 'rev-2',
    } as never)).toThrow('原 decision 已失效')

    expect(() => store.readDecisionForApply({
      workspaceId: 'workspace-1',
      decisionId: created.decisionId,
      sessionId: 'session-1',
      currentRevision: 'rev-1',
    } as never)).toThrow('原 decision 已失效')

    const fresh = store.createDecision({
      workspaceId: 'workspace-1',
      handoffId: 'handoff-1',
      sessionId: 'session-1',
      currentRevision: 'rev-1',
      decision: {
        status: 'ready',
        targetBlockKind: 'nav',
        supportedRenderModes: ['replace-current'],
        renderMode: 'replace-current',
        applyStrategy: 'replace-current',
        mappingKind: 'catalog-nav',
        toolKind: 'catalog-nav',
        source: {
          siteId: '14',
          parentId: 'catalog-parent',
        },
      },
    })
    if (fresh.status !== 'ready') {
      throw new Error('expected ready decision result')
    }

    store.markDecisionApplied('workspace-1', fresh.decisionId)

    expect(() => store.readDecisionForApply({
      workspaceId: 'workspace-1',
      decisionId: fresh.decisionId,
      sessionId: 'session-2',
      currentRevision: 'rev-1',
    } as never)).toThrow('当前会话')

    expect(() => store.readDecisionForApply({
      workspaceId: 'workspace-1',
      decisionId: fresh.decisionId,
      sessionId: 'session-1',
      currentRevision: 'rev-1',
    } as never)).toThrow('已经成功使用')
  })
})
