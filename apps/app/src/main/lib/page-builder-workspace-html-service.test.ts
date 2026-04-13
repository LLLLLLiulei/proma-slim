import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createPageBuilderWorkspaceHtmlService } from './page-builder-workspace-html-service'
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
          '<section data-proma-block-id="pb_blk_news"><cms-content catalog-id="news"></cms-content></section>',
        )
      },
    })

    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toContain('<cms-content catalog-id="news"></cms-content>')
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
          '<section data-proma-block-id="pb_blk_news"><cms-content catalog-id="news"></cms-content></section>',
        )
      },
    })).toThrow('manifest write failed')

    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toBe(originalHtml)
    expect(existsSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'))).toBe(false)
  })
})
