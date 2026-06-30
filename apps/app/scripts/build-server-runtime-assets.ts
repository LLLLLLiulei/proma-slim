import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPageBuilderCmsRenderingPreviewScript } from '../src/main/lib/page-builder-cms-rendering-preview'
import { readPageBuilderPreviewBridgeScript } from '../src/main/lib/page-builder-preview-bridge'

const outputDir = process.argv[2]?.trim()
  ? process.argv[2]
  : fileURLToPath(new URL('../dist-server', import.meta.url))

mkdirSync(outputDir, { recursive: true })

writeFileSync(
  join(outputDir, 'page-builder-preview-bridge.js'),
  await readPageBuilderPreviewBridgeScript(),
  'utf-8',
)

writeFileSync(
  join(outputDir, 'cms-rendering-preview.js'),
  await readPageBuilderCmsRenderingPreviewScript(),
  'utf-8',
)
