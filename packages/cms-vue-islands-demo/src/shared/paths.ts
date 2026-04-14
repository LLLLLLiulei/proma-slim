import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const repoRoot = resolve(packageRoot, '../..')
export const demoPagesDir = resolve(packageRoot, 'demo-pages')
export const distDemoDir = resolve(packageRoot, 'dist-demo')
export const exportOutputDir = resolve(distDemoDir, 'export')
export const previewAssetsDir = resolve(distDemoDir, 'preview-assets')
export const previewBootstrapEntryPath = resolve(packageRoot, 'src/preview/browser/preview-bootstrap.ts')
export const previewBootstrapAssetPath = resolve(previewAssetsDir, 'preview-bootstrap.js')
