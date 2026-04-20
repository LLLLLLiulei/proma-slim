import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  PageBuilderWorkspaceHtmlServiceError,
  createPageBuilderWorkspaceHtmlService,
} from './page-builder-workspace-html-service'
import { createAgentWorkspace } from './workspace-service'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

describe('page-builder workspace html service', () => {
  test('writes updated html, rebuilds manifest, and refreshes cms preview metadata', () => {
    const workspace = createAgentWorkspace('Workspace HTML Service', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="hero"><h1>Old</h1></section></body></html>',
      'utf-8',
    )

    const service = createPageBuilderWorkspaceHtmlService({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = service.mutate(workspace, {
      transform(currentHtml) {
        return currentHtml.replace(
          '<section id="hero"><h1>Old</h1></section>',
          '<section data-proma-block-id="pb_blk_news"><cms-content site-id="14" catalog-id="news"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content></section>',
        )
      },
    })

    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toContain('<cms-content site-id="14" catalog-id="news">')
    expect(result.previewState.hasCmsRendering).toBe(true)
    expect(result.previewState.requiresSameOrigin).toBe(true)
    expect(result.manifest.entries).toEqual([
      expect.objectContaining({
        blockId: 'pb_blk_news',
        component: 'cms-content',
      }),
    ])
    expect(readFileSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'), 'utf-8')).toContain('pb_blk_news')
  })

  test('rolls back html and manifest outputs when derived artifact writing fails', () => {
    const workspace = createAgentWorkspace('Workspace HTML Rollback', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const originalHtml = '<!doctype html><html><body><section id="hero"><h1>Old</h1></section></body></html>'

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), originalHtml, 'utf-8')

    const service = createPageBuilderWorkspaceHtmlService({
      now: () => '2026-04-13T00:00:00.000Z',
      writeManifest() {
        throw new Error('manifest write failed')
      },
    })

    expect(() => service.mutate(workspace, {
      transform(currentHtml) {
        return currentHtml.replace(
          '<section id="hero"><h1>Old</h1></section>',
          '<section data-proma-block-id="pb_blk_news"><cms-content site-id="14" catalog-id="news"><template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template></cms-content></section>',
        )
      },
    })).toThrow('manifest write failed')

    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toBe(originalHtml)
    expect(existsSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'))).toBe(false)
  })

  test('rejects blocking cms validation errors before writing html or manifest artifacts', () => {
    const workspace = createAgentWorkspace('Workspace HTML Validation', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const originalHtml = '<!doctype html><html><body><section id="hero"><h1>Old</h1></section></body></html>'

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), originalHtml, 'utf-8')

    const service = createPageBuilderWorkspaceHtmlService({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    expect(() => service.mutate(workspace, {
      transform() {
        return [
          '<!doctype html><html><body>',
          '<section data-proma-block-id="pb_blk_news">',
          '<cms-content catalog-id="news">',
          '  <template v-slot:default="{ items }"><style>.bad { color: red; }</style><article>{{ items.length }}</article></template>',
          '</cms-content>',
          '</section>',
          '</body></html>',
        ].join('')
      },
    })).toThrow(PageBuilderWorkspaceHtmlServiceError)

    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toBe(originalHtml)
    expect(existsSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'))).toBe(false)
  })

  test('fails closed on any blocking cms authoring validation error, not only dangerous tags', () => {
    const workspace = createAgentWorkspace('Workspace HTML Unknown Field', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const originalHtml = '<!doctype html><html><body><section id="hero"><h1>Old</h1></section></body></html>'

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), originalHtml, 'utf-8')

    const service = createPageBuilderWorkspaceHtmlService({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    expect(() => service.mutate(workspace, {
      transform() {
        return [
          '<!doctype html><html><body>',
          '<section data-proma-block-id="pb_blk_news">',
          '<cms-content site-id="14" catalog-id="news">',
          '  <template v-slot:default="{ items }">',
          '    <article v-for="item in items" :key="item.id"><a :href="item.url">{{ item.title }}</a></article>',
          '  </template>',
          '</cms-content>',
          '</section>',
          '</body></html>',
        ].join('')
      },
    })).toThrow(PageBuilderWorkspaceHtmlServiceError)

    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toBe(originalHtml)
    expect(existsSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'))).toBe(false)
  })

  test('rejects author-managed Vue importmap and bootstrap before writing html or manifest artifacts', () => {
    const workspace = createAgentWorkspace('Workspace HTML Vue Runtime', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const originalHtml = '<!doctype html><html><body><section id="hero"><h1>Old</h1></section></body></html>'

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), originalHtml, 'utf-8')

    const service = createPageBuilderWorkspaceHtmlService({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    expect(() => service.mutate(workspace, {
      transform() {
        return [
          '<!doctype html><html><head>',
          '<script type="importmap">{"imports":{"vue":"https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js"}}</script>',
          '<script type="module">',
          '  import { createApp } from "vue"',
          '  createApp({}).mount("#app")',
          '</script>',
          '</head><body>',
          '<section data-proma-block-id="pb_blk_news">',
          '<cms-content site-id="14" catalog-id="news">',
          '  <template v-slot:default="{ items }">',
          '    <article v-for="item in items" :key="item.id">{{ item.title }}</article>',
          '  </template>',
          '</cms-content>',
          '</section>',
          '</body></html>',
        ].join('')
      },
    })).toThrow(PageBuilderWorkspaceHtmlServiceError)

    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toBe(originalHtml)
    expect(existsSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'))).toBe(false)
  })

  test('strips runtime-only cms locator attrs before writing and reports info diagnostics', () => {
    const workspace = createAgentWorkspace('Workspace HTML Sanitization', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      entryPath,
      '<!doctype html><html><body><section id="hero"><h1>Old</h1></section></body></html>',
      'utf-8',
    )

    const service = createPageBuilderWorkspaceHtmlService({
      now: () => '2026-04-13T00:00:00.000Z',
    })

    const result = service.mutate(workspace, {
      transform() {
        return [
          '<!doctype html><html><body>',
          '<section data-proma-block-id="pb_blk_news">',
          '  <cms-content',
          '    data-proma-cms-source-id="cms-src-news"',
          '    data-proma-cms-island-id="cms-island-news"',
          '    data-proma-cms-island-html-path="index.html"',
          '    data-proma-cms-island-source-selector="#news > cms-content:nth-of-type(1)"',
          '    site-id="14"',
          '    catalog-id="news"',
          '  >',
          '    <template v-slot:default="{ items }"><article v-for="item in items" :key="item.id">{{ item.title }}</article></template>',
          '  </cms-content>',
          '</section>',
          '</body></html>',
        ].join('\n')
      },
    })

    const writtenHtml = readFileSync(entryPath, 'utf-8')
    expect(writtenHtml).toContain('<cms-content')
    expect(writtenHtml).not.toContain('data-proma-cms-source-id=')
    expect(writtenHtml).not.toContain('data-proma-cms-island-id=')
    expect(writtenHtml).not.toContain('data-proma-cms-island-html-path=')
    expect(result.validation.infos).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'info',
        code: 'RUNTIME_ONLY_ATTRIBUTE_STRIPPED',
        htmlPath: 'index.html',
        blockId: 'pb_blk_news',
      }),
    ]))
    expect(result.validation.errors).toHaveLength(0)
  })
})
