import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
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
    expect(result.generatedHtml).toContain('<cms-catalog level="root" take="3">')
    expect(result.generatedHtml).toContain('<template v-slot:default="{ items }">')
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
        catalogId: 'news',
        pageSize: 6,
      },
      templateBody: '<article v-for="item in items" :key="item.id">{{ item.title }}</article>',
    })

    const html = readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')
    expect(result.blockId).toBe('pb_blk_generated')
    expect(result.generatedHtml).toContain('<cms-content catalog-id="news" page-size="6">')
    expect(html).toContain('data-proma-block-id="pb_blk_generated"')
    expect(html).toContain('<cms-content catalog-id="news" page-size="6">')
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
        catalogId: 'events',
        pageSize: 4,
      },
      templateBody: '<article v-for="item in items" :key="item.id">{{ item.title }}</article>',
    })

    const html = readFileSync(entryPath, 'utf-8')
    expect(result.blockId).toBe('pb_blk_news')
    expect(html).toContain('<h2>最新动态</h2>')
    expect(html).toContain('<p class="static-note">静态尾注</p>')
    expect(html).toContain('<cms-content catalog-id="events" page-size="4">')
    expect(html).not.toContain('<cms-content catalog-id="news"></cms-content>')
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
})
