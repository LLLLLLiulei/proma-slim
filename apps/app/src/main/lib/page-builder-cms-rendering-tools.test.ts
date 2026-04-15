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
    expect(result.generatedHtml).toContain('<cms-catalog site-id="14" level="root" take="3">')
    expect(result.generatedHtml).toContain('<template v-slot:default="{ items, loading, error, empty }">')
    expect(result.generatedHtml).toContain('<template v-slot:empty="{ items, loading, error, empty }">')
    expect(result.generatedHtml).toContain('<template v-slot:error="{ items, loading, error, empty }">')
    expect(result.generatedHtml).toContain('<nav>')
    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toContain('data-proma-block-id="pb_blk_nav"')
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
    expect(result.generatedHtml).toContain('<cms-content site-id="14" catalog-id="news" page-size="6">')
    expect(result.generatedHtml).toContain('<section class="news-list">')
    expect(html).toContain('data-proma-block-id="pb_blk_generated"')
    expect(html).toContain('<cms-content site-id="14" catalog-id="news" page-size="6">')
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
        '<cms-content catalog-id="news"></cms-content>',
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
        selector: 'body > section:nth-of-type(1) > cms-content:nth-of-type(1)',
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
    expect(html).toContain('<h2>最新动态</h2>')
    expect(html).toContain('<p class="static-note">静态尾注</p>')
    expect(html).toContain('<cms-content site-id="14" catalog-id="events" page-size="4">')
    expect(html).not.toContain('<cms-content catalog-id="news"></cms-content>')
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
        '<section><cms-content catalog-id="nested"></cms-content></section>',
        '<cms-content catalog-id="a"></cms-content>',
        '<cms-content catalog-id="b"></cms-content>',
        '<cms-content catalog-id="c"></cms-content>',
        '<cms-content catalog-id="d"></cms-content>',
        '<cms-content catalog-id="e"></cms-content>',
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
        selector: 'body > main:nth-of-type(1) > cms-content:nth-of-type(4)',
        parentBlockSelector: 'body > main:nth-of-type(1) > cms-content:nth-of-type(4)',
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
    expect(html).toContain('<cms-content catalog-id="c"></cms-content>')
    expect(html).not.toContain('<cms-content catalog-id="d"></cms-content>')
    expect(html).toContain('<cms-content site-id="14" catalog-id="events" page-size="4">')
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
        selector: '#latest-news > cms-content:nth-of-type(1)',
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
    expect(html).toContain('<cms-content site-id="14" catalog-id="events" page-size="4">')
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
    expect(result.targetSelection).toMatchObject({
      kind: 'cms-island',
      selector: '#latest-news > cms-content:nth-of-type(1)',
      parentBlockSelector: '#latest-news > cms-content:nth-of-type(1)',
      component: 'cms-content',
      editBoundary: 'source-atomic',
    })
    expect(html).toContain('<p class="static-note">静态尾注</p>')
    expect(html).toContain('<cms-content site-id="14" catalog-id="events" page-size="4">')
    expect(html).not.toContain('<cms-content catalog-id="news">')
    expect(html).not.toContain('<cms-content catalog-id="news"><cms-content')
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
          selector: '.dup',
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

  test('rejects fixed content id style inputs that are outside the current runtime capability', () => {
    const workspace = createAgentWorkspace('CMS Apply Unsupported Input', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="latest-news"></section></body></html>',
      'utf-8',
    )

    const tools = createPageBuilderCmsRenderingTools()

    expect(() => tools.applyCmsBinding(workspace, {
      targetBlock: {
        selector: '#latest-news',
      },
      kind: 'content-list',
      source: {
        catalogId: 'news',
        contentIds: ['n-1'],
      } as never,
      templateBody: '<article></article>',
    })).toThrow(PageBuilderCmsBindingApplyError)
    expect(readFileSync(entryPath, 'utf-8')).not.toContain('cms-content')
    expect(existsSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'))).toBe(false)
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
