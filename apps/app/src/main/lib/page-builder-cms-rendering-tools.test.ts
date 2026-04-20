import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createAgentWorkspace } from './workspace-service'
import {
  PageBuilderCmsBindingApplyError,
  createPageBuilderCmsRenderingTools,
} from './page-builder-cms-rendering-tools'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

describe('page-builder cms rendering apply tool', () => {
  test('applies catalog-nav bindings through the html mutation pipeline and preserves block ids', () => {
    const workspace = createAgentWorkspace('CMS Apply Nav', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="main-nav" data-proma-block-id="pb_blk_nav"><div>placeholder</div></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#main-nav',
      },
      kind: 'catalog-nav',
      source: {
        siteId: '14',
        level: 'root',
        take: 3,
      },
      templateBody: '<nav><a v-for="item in items" :key="item.id" :href="item.path">{{ item.name }}</a></nav>',
      emptyTemplate: '<p>暂无栏目</p>',
      errorTemplate: '<p>{{ error.message }}</p>',
    })

    expect(result).toMatchObject({
      applied: true,
      blockId: 'pb_blk_nav',
      component: 'cms-catalog',
      manifest: {
        entryCount: 1,
        entry: expect.objectContaining({
          blockId: 'pb_blk_nav',
          sourceSelectorSnapshot: '#main-nav > cms-catalog:nth-of-type(1)',
          parentBlockSelectorSnapshot: '#main-nav',
          component: 'cms-catalog',
          props: {
            siteId: '14',
            level: 'root',
            take: '3',
          },
        }),
      },
      previewState: {
        hasCmsRendering: true,
        requiresSameOrigin: true,
      },
    })
    expect(result.generatedHtml).toContain('<cms-catalog ')
    expect(result.generatedHtml).not.toContain('data-proma-cms-source-id="')
    expect(result.generatedHtml).toContain('site-id="14" level="root" take="3"')
    expect(result.generatedHtml).toContain('<template v-slot:default="{ items, loading, error, empty }">')
    expect(result.generatedHtml).toContain('<template v-slot:empty="{ items, loading, error, empty }">')
    expect(result.generatedHtml).toContain('<template v-slot:error="{ items, loading, error, empty }">')
    expect(result.generatedHtml).toContain('<nav>')
    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toContain('data-proma-block-id="pb_blk_nav"')
    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).not.toContain('data-proma-cms-source-id=')
    expect(readFileSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'), 'utf-8')).toContain('pb_blk_nav')
  })

  test('assigns a block id when the target block does not have one', () => {
    const workspace = createAgentWorkspace('CMS Apply Content', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="latest-news"><div>placeholder</div></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
      createBlockId: () => 'pb_blk_generated',
    })

    const result = tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
        pageSize: 6,
      },
      templateBody: '<section class="news-list"><article v-for="item in items" :key="item.id">{{ item.title }}</article></section>',
    })

    const html = readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')
    expect(result.blockId).toBe('pb_blk_generated')
    expect(result.generatedHtml).toContain('<cms-content ')
    expect(result.generatedHtml).not.toContain('data-proma-cms-source-id=')
    expect(result.generatedHtml).toContain('site-id="14" catalog-id="news" page-size="6"')
    expect(result.generatedHtml).toContain('<section class="news-list">')
    expect(html).toContain('data-proma-block-id="pb_blk_generated"')
    expect(html).not.toContain('data-proma-cms-source-id=')
    expect(html).toContain('site-id="14" catalog-id="news" page-size="6"')
  })

  test('applies catalog-nav parent-source bindings with children-level props only', () => {
    const workspace = createAgentWorkspace('CMS Apply Parent Catalogs', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="catalog-nav" data-proma-block-id="pb_blk_catalogs"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#catalog-nav',
      },
      kind: 'catalog-nav',
      source: {
        siteId: '14',
        parentId: '7',
      } as never,
      templateBody: '<nav><a v-for="item in items" :key="item.id" :href="item.path">{{ item.name }}</a></nav>',
    })

    expect(result.generatedHtml).toContain('<cms-catalog ')
    expect(result.generatedHtml).toContain('site-id="14" level="children" parent-id="7"')
    expect(result.generatedHtml).not.toContain('ids=')
    expect(result.generatedHtml).not.toContain('content-type=')
    expect(result.generatedHtml).not.toContain('search-keyword=')
  })

  test('applies catalog-nav fixed-id bindings and keeps ordered ids in html and manifest props', () => {
    const workspace = createAgentWorkspace('CMS Apply Fixed Catalogs', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="catalog-grid" data-proma-block-id="pb_blk_catalog_grid"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#catalog-grid',
      },
      kind: 'catalog-nav',
      source: {
        siteId: '14',
        ids: ['cat-b', 'cat-a'],
      } as never,
      templateBody: '<section class="catalog-grid"><article v-for="item in items" :key="item.id">{{ item.name }}</article></section>',
    })

    expect(result.generatedHtml).toContain('<cms-catalog ')
    expect(result.generatedHtml).not.toContain('data-proma-cms-source-id=')
    expect(result.generatedHtml).toContain('site-id="14" ids="cat-b,cat-a"')
    expect(result.generatedHtml).not.toContain('level=')
    expect(result.generatedHtml).not.toContain('parent-id=')
    expect(result.manifest.entry?.props).toEqual(expect.objectContaining({
      siteId: '14',
      ids: ['cat-b', 'cat-a'],
    }))
  })

  test('documents template fields as the place for the complete dynamic region structure', () => {
    const source = readFileSync(fileURLToPath(new URL('./page-builder-cms-rendering-tools.ts', import.meta.url)), 'utf-8')

    expect(source).toContain('complete dynamic region')
    expect(source).toContain('templateBody')
    expect(source).toContain('emptyTemplate')
    expect(source).toContain('errorTemplate')
  })

  test('replaces only the selected cms-island source tag when the target selection is source-atomic', () => {
    const workspace = createAgentWorkspace('CMS Apply Island Replace', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      [
        '<!doctype html><html><body>',
        '<section id="latest-news" data-proma-block-id="pb_blk_news">',
        '<h2>最新动态</h2>',
        '<cms-content data-proma-cms-source-id="cms-src-news" site-id="14" catalog-id="news"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content>',
        '<p class="static-note">静态尾注</p>',
        '</section>',
        '</body></html>',
      ].join(''),
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = tools.applyCmsBinding(workspace, {
      targetSelection: {
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: 'body > section:nth-of-type(1) > cms-content:nth-of-type(1)',
        parentBlockSelector: 'body > section:nth-of-type(1)',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      },
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'events',
        pageSize: 4,
      },
      templateBody: '<article v-for="item in items" :key="item.id">{{ item.title }}</article>',
    })

    const html = readFileSync(entryPath, 'utf-8')
    expect(result.blockId).toBe('pb_blk_news')
    expect(result.targetSelection).toMatchObject({
      kind: 'cms-island',
      htmlPath: 'index.html',
      sourceSelector: 'body > section:nth-of-type(1) > cms-content:nth-of-type(1)',
    })
    expect(result.manifest.entry).toMatchObject({
      sourceSelectorSnapshot: '#latest-news > cms-content:nth-of-type(1)',
      parentBlockSelectorSnapshot: '#latest-news',
    })
    expect(result.generatedHtml).not.toContain('data-proma-cms-source-id=')
    expect(html).toContain('<h2>最新动态</h2>')
    expect(html).toContain('<p class="static-note">静态尾注</p>')
    expect(html).not.toContain('data-proma-cms-source-id=')
    expect(html).toContain('site-id="14" catalog-id="events" page-size="4"')
    expect(html).not.toContain('catalog-id="news"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content>')
  })

  test('does not persist host-managed cms source ids when binding cms content into a static block', () => {
    const workspace = createAgentWorkspace('CMS Apply New Source Id', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><div>placeholder</div></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'events',
      },
      templateBody: '<article v-for="item in items" :key="item.id">{{ item.title }}</article>',
    })

    const html = readFileSync(entryPath, 'utf-8')
    expect(result.generatedHtml).not.toContain('data-proma-cms-source-id=')
    expect(result.manifest.entry).toMatchObject({
      sourceSelectorSnapshot: '#latest-news > cms-content:nth-of-type(1)',
      parentBlockSelectorSnapshot: '#latest-news',
      component: 'cms-content',
      props: expect.objectContaining({
        siteId: '14',
        catalogId: 'events',
      }),
    })
    expect(html).not.toContain('data-proma-cms-source-id=')
  })

  test('resolves cms-island nth-of-type selectors against direct siblings instead of earlier nested cms tags', () => {
    const workspace = createAgentWorkspace('CMS Apply Island Nth Of Type', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      [
        '<!doctype html><html><body><main>',
        '<section><cms-content site-id="14" catalog-id="nested"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content></section>',
        '<cms-content site-id="14" catalog-id="a"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content>',
        '<cms-content site-id="14" catalog-id="b"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content>',
        '<cms-content site-id="14" catalog-id="c"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content>',
        '<cms-content site-id="14" catalog-id="d"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content>',
        '<cms-content site-id="14" catalog-id="e"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content>',
        '</main></body></html>',
      ].join(''),
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    tools.applyCmsBinding(workspace, {
      targetSelection: {
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: 'body > main:nth-of-type(1) > cms-content:nth-of-type(4)',
        parentBlockSelector: 'body > main:nth-of-type(1)',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      },
      targetBlock: {
        selector: 'body > main:nth-of-type(1) > cms-content:nth-of-type(4)',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'events',
        pageSize: 4,
      },
      templateBody: '<article v-for="item in items" :key="item.id">{{ item.title }}</article>',
    })

    const html = readFileSync(entryPath, 'utf-8')
    expect(html).toContain('catalog-id="c"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content>')
    expect(html).not.toContain('catalog-id="d"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content>')
    expect(html).not.toContain('data-proma-cms-source-id=')
    expect(html).toContain('site-id="14" catalog-id="events" page-size="4"')
  })

  test('accepts stringified cms-island targetSelection payloads from the SDK tool layer', () => {
    const workspace = createAgentWorkspace('CMS Apply Stringified Target Selection', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"><cms-content catalog-id="news"></cms-content></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = tools.applyCmsBinding(workspace, {
      targetSelection: JSON.stringify({
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: '#latest-news > cms-content:nth-of-type(1)',
        parentBlockSelector: '#latest-news',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      }) as never,
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'events',
        pageSize: 4,
      },
      templateBody: '<article v-for="item in items" :key="item.id">{{ item.title }}</article>',
    })

    const html = readFileSync(entryPath, 'utf-8')
    expect(result.blockId).toBe('pb_blk_news')
    expect(html).not.toContain('data-proma-cms-source-id=')
    expect(html).toContain('site-id="14" catalog-id="events" page-size="4"')
    expect(html).not.toContain('<cms-content catalog-id="news"></cms-content>')
  })

  test('upgrades an omitted targetSelection to source-atomic replacement when targetBlock selector already points at a cms island', () => {
    const workspace = createAgentWorkspace('CMS Apply Implicit Island Replace', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      [
        '<!doctype html><html><body>',
        '<section id="latest-news" data-proma-block-id="pb_blk_news">',
        '<cms-content catalog-id="news">',
        '  <template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template>',
        '</cms-content>',
        '<p class="static-note">静态尾注</p>',
        '</section>',
        '</body></html>',
      ].join(''),
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news > cms-content:nth-of-type(1)',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'events',
        pageSize: 4,
      },
      templateBody: '<article v-for="item in items" :key="item.id">{{ item.title }}</article>',
    })

    const html = readFileSync(entryPath, 'utf-8')
    expect(result.blockId).toBe('pb_blk_news')
    expect(result.targetSelection).toMatchObject({
      kind: 'cms-island',
      htmlPath: 'index.html',
      sourceSelector: '#latest-news > cms-content:nth-of-type(1)',
      parentBlockSelector: '#latest-news',
      component: 'cms-content',
      editBoundary: 'source-atomic',
    })
    expect(result.manifest.entry).toMatchObject({
      blockId: 'pb_blk_news',
      component: 'cms-content',
      props: expect.objectContaining({
        siteId: '14',
        catalogId: 'events',
        pageSize: '4',
      }),
    })
    expect(html).toContain('<p class="static-note">静态尾注</p>')
    expect(html).not.toContain('data-proma-cms-source-id=')
    expect(html).toContain('site-id="14" catalog-id="events" page-size="4"')
    expect(html).not.toContain('<cms-content catalog-id="news">')
    expect(html).not.toContain('<cms-content catalog-id="news"><cms-content')
  })

  test('returns the manifest entry for the replaced cms island instead of the first island in the same block', () => {
    const workspace = createAgentWorkspace('CMS Apply Correct Manifest Entry', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      [
        '<!doctype html><html><body>',
        '<section id="news-block" data-proma-block-id="pb_blk_news">',
        '<cms-catalog site-id="1" ids="nav-a">',
        '  <template v-slot:default="{ items }"><nav>{{ items.length }}</nav></template>',
        '</cms-catalog>',
        '<cms-content catalog-id="legacy-news">',
        '  <template v-slot:default="{ items }"><div>{{ items.length }}</div></template>',
        '</cms-content>',
        '</section>',
        '</body></html>',
      ].join(''),
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = tools.applyCmsBinding(workspace, {
      targetSelection: {
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: '#news-block > cms-content:nth-of-type(1)',
        parentBlockSelector: '#news-block',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      },
      targetBlock: {
        selector: '#news-block',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'events',
      },
      templateBody: '<article v-for="item in items" :key="item.id">{{ item.title }}</article>',
    })

    expect(result.manifest.entryCount).toBe(2)
    expect(result.manifest.entry).toMatchObject({
      blockId: 'pb_blk_news',
      component: 'cms-content',
      props: expect.objectContaining({
        siteId: '14',
        catalogId: 'events',
      }),
    })
    expect(result.manifest.entry?.component).not.toBe('cms-catalog')
  })

  test('rejects selectors that do not uniquely resolve to a target block', () => {
    const workspace = createAgentWorkspace('CMS Apply Duplicate Blocks', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section class="news"></section><section class="news"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '.news',
      },
      kind: 'catalog-nav',
      source: {
        siteId: '14',
        level: 'root',
      },
      templateBody: '<nav></nav>',
    })).toThrow(PageBuilderCmsBindingApplyError)
  })

  test('rejects cms-island source selectors that do not uniquely resolve', () => {
    const workspace = createAgentWorkspace('CMS Apply Duplicate Islands', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      [
        '<!doctype html><html><body>',
        '<section id="news-a" data-proma-block-id="pb_blk_a"><cms-content class="dup" catalog-id="a"></cms-content></section>',
        '<section id="news-b" data-proma-block-id="pb_blk_b"><cms-content class="dup" catalog-id="b"></cms-content></section>',
        '</body></html>',
      ].join(''),
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    try {
      tools.applyCmsBinding(workspace, {
        targetSelection: {
          kind: 'cms-island',
          htmlPath: 'index.html',
          sourceSelector: '.dup',
          parentBlockSelector: '#news-a',
          component: 'cms-content',
          editBoundary: 'source-atomic',
        },
        targetBlock: {
          selector: '#news-a',
        },
        kind: 'content-list',
        source: {
          siteId: '14',
          catalogId: 'news',
        },
        templateBody: '<article></article>',
      })
      throw new Error('expected applyCmsBinding to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(PageBuilderCmsBindingApplyError)
      expect(error).toMatchObject({
        code: 'selector-not-unique',
      })
    }
  })

  test('fails closed when cms locator fields point to different source targets', () => {
    const workspace = createAgentWorkspace('CMS Apply Locator Conflict', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      [
        '<!doctype html><html><body>',
        '<section id="news-a" data-proma-block-id="pb_blk_a"><cms-content data-proma-cms-source-id="cms-src-a" catalog-id="a"></cms-content></section>',
        '<section id="news-b" data-proma-block-id="pb_blk_b"><cms-content data-proma-cms-source-id="cms-src-b" catalog-id="b"></cms-content></section>',
        '</body></html>',
      ].join(''),
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetSelection: {
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: '#news-b > cms-content:nth-of-type(1)',
        parentBlockSelector: '#news-a',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      },
      targetBlock: {
        selector: '#news-a',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
      },
      templateBody: '<article></article>',
    })).toThrow('目标 CMS 组件不属于当前区块')
  })

  test('applies fixed content ids through content-list bindings', () => {
    const workspace = createAgentWorkspace('CMS Apply Fixed Contents', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    const result = tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
        ids: ['n-2', 'n-1'],
      } as never,
      templateBody: '<article></article>',
    })

    expect(result.generatedHtml).toContain('<cms-content ')
    expect(result.generatedHtml).not.toContain('data-proma-cms-source-id=')
    expect(result.generatedHtml).toContain('site-id="14" catalog-id="news" ids="n-2,n-1"')
    expect(readFileSync(entryPath, 'utf-8')).toContain('site-id="14" catalog-id="news" ids="n-2,n-1"')
  })

  test('rejects fixed ids mixed with paging or keyword query props for cms bindings', () => {
    const workspace = createAgentWorkspace('CMS Apply Mixed Source', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news"></section><section id="catalog-nav"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
        ids: ['n-1'],
        pageSize: 3,
      } as never,
      templateBody: '<article></article>',
    })).toThrow(PageBuilderCmsBindingApplyError)

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#catalog-nav',
      },
      kind: 'catalog-nav',
      source: {
        siteId: '14',
        parentId: '7',
        ids: ['cat-1'],
      } as never,
      templateBody: '<nav></nav>',
    })).toThrow(PageBuilderCmsBindingApplyError)

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-content')
    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-catalog')
  })

  test('rejects catalog-nav bindings that try to use pageSize and tells callers to use take', () => {
    const workspace = createAgentWorkspace('CMS Apply Catalog Page Size', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="catalog-nav"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#catalog-nav',
      },
      kind: 'catalog-nav',
      source: {
        siteId: '14',
        level: 'children',
        parentId: '7',
        pageSize: 6,
      } as never,
      templateBody: '<nav></nav>',
    })).toThrow('catalog-nav 不支持 source.pageSize；如需限制栏目数量请使用 source.take')

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-catalog')
  })

  test('rejects template fields that already contain nested cms islands', () => {
    const workspace = createAgentWorkspace('CMS Apply Nested Island Template', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="nav" data-proma-block-id="pb_blk_nav"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetSelection: {
        kind: 'block',
        selector: '#nav',
        parentBlockSelector: '#nav',
        editBoundary: 'block',
      },
      targetBlock: {
        selector: '#nav',
      },
      kind: 'catalog-nav',
      source: {
        siteId: '14',
        level: 'children',
        parentId: '7',
      },
      templateBody: [
        '<cms-catalog level="children" parent-id="7">',
        '  <template v-slot:default="{ items }">',
        '    <ul><li v-for="item in items" :key="item.id">{{ item.name }}</li></ul>',
        '  </template>',
        '</cms-catalog>',
      ].join('\n'),
    })).toThrow(PageBuilderCmsBindingApplyError)

    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).not.toContain('<cms-catalog level="children" parent-id="7">\n<cms-catalog')
  })

  test('rejects template fields that include outer slot template wrappers instead of slot inner content', () => {
    const workspace = createAgentWorkspace('CMS Apply Nested Slot Template', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
        pageSize: 3,
      },
      templateBody: [
        '<template #default="{ items, loading, error, empty }">',
        '  <section class="news-list">',
        '    <article v-for="item in items" :key="item.id">{{ item.title }}</article>',
        '  </section>',
        '</template>',
      ].join('\n'),
    })).toThrow('templateBody 只能传入 slot 内部内容')

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-content')
  })

  test('rejects dangerous tags inside cms template fields before writing html', () => {
    const workspace = createAgentWorkspace('CMS Apply Dangerous Template', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
      },
      templateBody: '<section><style>.bad { color: red; }</style><article></article></section>',
    })).toThrow('templateBody 不能包含 <script> 或 <style>')

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-content')
  })

  test('rejects template fields that reference unsupported cms item fields before writing html', () => {
    const workspace = createAgentWorkspace('CMS Apply Unknown Item Field', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
      },
      templateBody: '<section><article v-for="item in items" :key="item.id"><a :href="item.url">{{ item.title }}</a></article></section>',
    })).toThrow('templateBody 引用了当前 CMS contract 不支持的字段')

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-content')
  })

  test('rejects template fields that reference undeclared cms slot variables before writing html', () => {
    const workspace = createAgentWorkspace('CMS Apply Unknown Slot Variable', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
      },
      templateBody: '<section><article v-for="item in slotProps.items" :key="item.id">{{ item.title }}</article></section>',
    })).toThrow('templateBody 引用了当前 CMS contract 未声明的 slot 变量')

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-content')
  })

  test('rejects template fields that contain invalid Vue event expressions before writing html', () => {
    const workspace = createAgentWorkspace('CMS Apply Invalid Vue Event Expression', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
      },
      templateBody: '<section><article v-for="item in items" :key="item.id" @click="item.publishUrl && window.location.href=item.publishUrl">{{ item.title }}</article></section>',
    })).toThrow('templateBody 包含不合法的 Vue 模板语法')

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-content')
  })

  test('rejects template fields that contain raw html event attributes before writing html', () => {
    const workspace = createAgentWorkspace('CMS Apply Inline Html Event Attribute', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news" data-proma-block-id="pb_blk_news"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        siteId: '14',
        catalogId: 'news',
      },
      templateBody: '<section><img v-if="items[0]?.listLogoUrl" :src="items[0].listLogoUrl" onerror="this.style.display=\'none\'"></section>',
    })).toThrow('templateBody 不能包含原生 HTML 事件属性')

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-content')
  })

  test('rejects CMS apply inputs that omit siteId when generating new cms tags', () => {
    const workspace = createAgentWorkspace('CMS Apply Missing Site', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="main-nav"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#main-nav',
      },
      kind: 'catalog-nav',
      source: {
        level: 'root',
      },
      templateBody: '<nav></nav>',
    })).toThrow('source.siteId 不能为空')

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-catalog')
  })

  test('rejects CMS apply inputs that use a non-integer or non-positive siteId', () => {
    const workspace = createAgentWorkspace('CMS Apply Invalid Site', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="main-nav"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#main-nav',
      },
      kind: 'catalog-nav',
      source: {
        siteId: 'abc',
        level: 'root',
      },
      templateBody: '<nav></nav>',
    })).toThrow('source.siteId 必须是大于等于 1 的整数')

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#main-nav',
      },
      kind: 'catalog-nav',
      source: {
        siteId: 0,
        level: 'root',
      },
      templateBody: '<nav></nav>',
    })).toThrow('source.siteId 必须是大于等于 1 的整数')

    expect(readFileSync(entryPath, 'utf-8')).not.toContain('<cms-catalog')
  })
})
