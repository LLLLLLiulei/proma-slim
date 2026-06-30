import { spawnSync } from 'node:child_process'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

afterEach(() => {
  delete process.env.AI_PAGE_BUILDER_BASE_PATH
  delete process.env.PROMA_PAGE_BUILDER_CMS_RENDERING_PREVIEW_PATH
})

test('cms rendering preview asset URLs use the configured public base path and keep version queries', async () => {
  process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
  const module = await import('./page-builder-cms-rendering-preview.ts')

  const previewUrl = module.getPageBuilderCmsRenderingPreviewAssetUrl()
  const vueUrl = module.getPageBuilderCmsRenderingVueAssetUrl()

  expect(previewUrl).toStartWith('/pagebuilder/api/page-builder/cms-rendering-preview.js?v=')
  expect(vueUrl).toStartWith('/pagebuilder/api/page-builder/cms-rendering-vue.js?v=')
})

test('cms rendering preview reads a configured prebuilt asset', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'proma-cms-rendering-preview-'))
  const previewPath = join(tempDir, 'cms-rendering-preview.js')

  try {
    writeFileSync(previewPath, 'console.info("prebuilt-cms-rendering-preview")', 'utf-8')
    process.env.PROMA_PAGE_BUILDER_CMS_RENDERING_PREVIEW_PATH = previewPath

    const module = await import(`./page-builder-cms-rendering-preview.ts?prebuilt=${Date.now()}-${Math.random()}`)
    const script = await module.readPageBuilderCmsRenderingPreviewScript()

    expect(script).toBe('console.info("prebuilt-cms-rendering-preview")')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('cms rendering preview bundle excludes server-only linkedom dependency', () => {
  const result = spawnSync(
    'bun',
    [
      '-e',
      `
        import { readPageBuilderCmsRenderingPreviewScript } from './apps/app/src/main/lib/page-builder-cms-rendering-preview.ts'

        const script = await readPageBuilderCmsRenderingPreviewScript()
        console.log(JSON.stringify({
          hasReadyEvent: script.includes('proma:cms-rendering-ready'),
          hasReadyFlag: script.includes('__PROMA_CMS_RENDERING_PREVIEW_READY__'),
          hasLinkedom: script.includes('linkedom'),
          hasParseHtml: script.includes('parseHTML'),
        }))
      `,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf-8',
    },
  )

  expect(result.status).toBe(0)

  const output = JSON.parse(result.stdout.trim()) as {
    hasReadyEvent: boolean
    hasReadyFlag: boolean
    hasLinkedom: boolean
    hasParseHtml: boolean
  }

  expect(output.hasReadyEvent).toBe(true)
  expect(output.hasReadyFlag).toBe(true)
  expect(output.hasLinkedom).toBe(false)
  expect(output.hasParseHtml).toBe(false)
})

test('cms rendering preview bundle excludes shared root barrel side modules', () => {
  const result = spawnSync(
    'bun',
    [
      '-e',
      `
        import { readPageBuilderCmsRenderingPreviewScript } from './apps/app/src/main/lib/page-builder-cms-rendering-preview.ts'

        const script = await readPageBuilderCmsRenderingPreviewScript()
        console.log(JSON.stringify({
          hasSharedAgentToolMatching: script.includes('packages/shared/src/agent/tool-matching.ts'),
          hasSharedAgentAttachments: script.includes('packages/shared/src/constants/agent-attachments.ts'),
          hasSharedCmsAuthoringContract: script.includes('packages/shared/src/types/page-builder-cms-authoring-contract.ts'),
        }))
      `,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf-8',
    },
  )

  expect(result.status).toBe(0)

  const output = JSON.parse(result.stdout.trim()) as {
    hasSharedAgentToolMatching: boolean
    hasSharedAgentAttachments: boolean
    hasSharedCmsAuthoringContract: boolean
  }

  expect(output.hasSharedAgentToolMatching).toBe(false)
  expect(output.hasSharedAgentAttachments).toBe(false)
  expect(output.hasSharedCmsAuthoringContract).toBe(false)
})
