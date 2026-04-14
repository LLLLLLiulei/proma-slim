import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { previewBootstrapAssetPath } from '../shared/paths'
import { ensurePreviewBootstrapBundle } from './build-preview-bootstrap'

describe('ensurePreviewBootstrapBundle', () => {
  test('builds a browser bootstrap bundle for preview islands', async () => {
    rmSync(previewBootstrapAssetPath, { force: true })

    const outputPath = await ensurePreviewBootstrapBundle()

    expect(outputPath).toBe(previewBootstrapAssetPath)
    expect(existsSync(outputPath)).toBe(true)

    const builtAsset = readFileSync(outputPath, 'utf-8')
    expect(builtAsset).toContain('cms-catalog')
    expect(builtAsset).toContain('cms-content')
  })
})
