import { spawnSync } from 'node:child_process'
import { expect, test } from 'bun:test'

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
