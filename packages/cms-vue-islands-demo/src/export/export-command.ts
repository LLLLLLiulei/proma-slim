import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CmsRuntimeClient } from '../runtime/cms-runtime-client'
import { createMockServerCmsClient } from '../runtime/server-cms-client'
import { readDemoPage } from '../shared/demo-pages'
import { demoPagesDir, exportOutputDir } from '../shared/paths'
import { renderIslandsSsr } from './render-islands-ssr'

export async function exportDemoPages(options?: { cmsClient?: CmsRuntimeClient }): Promise<string[]> {
  const pageNames = readdirSync(demoPagesDir)
    .filter((entry) => entry.endsWith('.html'))
    .sort((left, right) => left.localeCompare(right))

  rmSync(exportOutputDir, { recursive: true, force: true })
  mkdirSync(exportOutputDir, { recursive: true })

  const cmsClient = options?.cmsClient ?? createMockServerCmsClient()
  const writtenPaths: string[] = []

  for (const pageName of pageNames) {
    const renderedHtml = await renderIslandsSsr({
      html: readDemoPage(pageName),
      cmsClient,
    })
    const outputPath = join(exportOutputDir, pageName)
    writeFileSync(outputPath, renderedHtml, 'utf-8')
    writtenPaths.push(outputPath)
  }

  return writtenPaths
}
