import { spawnSync } from 'node:child_process'
import { expect, test } from 'bun:test'

test('cms rendering preview asset URLs use the configured public base path and keep version queries', async () => {
  process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
  const module = await import('./page-builder-cms-rendering-preview.ts')

  const previewUrl = module.getPageBuilderCmsRenderingPreviewAssetUrl()
  const vueUrl = module.getPageBuilderCmsRenderingVueAssetUrl()

  expect(previewUrl).toStartWith('/pagebuilder/api/page-builder/cms-rendering-preview.js?v=')
  expect(vueUrl).toStartWith('/pagebuilder/api/page-builder/cms-rendering-vue.js?v=')

  delete process.env.AI_PAGE_BUILDER_BASE_PATH
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
