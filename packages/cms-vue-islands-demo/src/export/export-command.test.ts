import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMockServerCmsClient } from '../runtime/server-cms-client'
import { exportDemoPages } from './export-command'

describe('exportDemoPages', () => {
  test('exports the performance page with SSR-rendered islands', async () => {
    const writtenPaths = await exportDemoPages({
      cmsClient: createMockServerCmsClient({ delay: false }),
    })
    const perfPagePath = writtenPaths.find((filePath) => filePath.endsWith('/perf-many-islands.html'))

    expect(perfPagePath).toBeDefined()

    const exportedHtml = readFileSync(
      perfPagePath ?? join(process.cwd(), 'packages/cms-vue-islands-demo/dist-demo/export/perf-many-islands.html'),
      'utf-8',
    )

    expect(exportedHtml).toContain('Many Islands Performance Demo')
    expect(exportedHtml).toContain('Launch Update')
    expect(exportedHtml).toContain('News')
    expect(exportedHtml).not.toContain('<cms-content')
    expect(exportedHtml).not.toContain('<cms-catalog')
  })
})
