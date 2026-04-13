import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { applyPageBuilderImageReplacement, savePageBuilderImageReplacement } from './page-builder-image-replacement-service'
import { createAgentWorkspace } from './workspace-service'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

describe('page-builder image replacement service', () => {
  test('updates the targeted img src by selector and child path', () => {
    const html = '<!doctype html><html><body><section id="hero"><div><img src="./assets/original.png" alt="旧图"></div></section></body></html>'

    const updated = applyPageBuilderImageReplacement(html, '#hero', {
      version: 1,
      tagName: 'img',
      childPath: [0, 0],
    }, './assets/replacement-banner.png')

    expect(updated).toContain('src="./assets/replacement-banner.png"')
    expect(updated).not.toContain('src="./assets/original.png"')
  })

  test('rejects selectors that do not resolve to a unique replacement target before writing', () => {
    const html = '<!doctype html><html><body><section class="hero"><img src="./assets/a.png"></section><section class="hero"><img src="./assets/b.png"></section></body></html>'

    expect(() => applyPageBuilderImageReplacement(html, '.hero', {
      version: 1,
      tagName: 'img',
      childPath: [0],
    }, './assets/replacement-banner.png')).toThrow('无法唯一定位')
  })

  test('savePageBuilderImageReplacement preserves cms preview metadata while updating the target image', async () => {
    const workspace = createAgentWorkspace('Image Replace CMS', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="hero"><img src="./assets/original.png" alt="旧图"></section><section data-proma-block-id="pb_blk_news"><cms-content catalog-id="news"></cms-content></section></body></html>',
      'utf-8',
    )

    const previewState = await savePageBuilderImageReplacement(workspace, {
      selector: '#hero',
      imageTargetDescriptor: {
        version: 1,
        tagName: 'img',
        childPath: [0],
      },
    }, new File(['image-bytes'], 'banner.png', { type: 'image/png' }))

    const nextHtml = readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')

    expect(nextHtml).toContain('./assets/page-builder-image-')
    expect(previewState.hasCmsRendering).toBe(true)
    expect(previewState.requiresSameOrigin).toBe(true)
  })
})
