import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'

test('app can import cms rendering preview helpers from the package preview subpath', async () => {
  const module = await import('@proma/page-builder-cms-rendering/preview')

  expect(typeof module.detectCmsRenderingUsage).toBe('function')
  expect(typeof module.injectCmsRenderingPreview).toBe('function')
})

test('app can import cms rendering preview build paths from the package subpath', async () => {
  const module = await import('@proma/page-builder-cms-rendering/preview/build-paths')

  expect(typeof module.getCmsRenderingPreviewBuildPaths).toBe('function')

  const paths = module.getCmsRenderingPreviewBuildPaths()

  expect(paths.bootstrapEntryPath.endsWith('cms-rendering-preview-bootstrap.ts')).toBe(true)
  expect(paths.sourceRootPath.endsWith('/src/')).toBe(true)
  expect(paths.vueRuntimePath.endsWith('vue.esm-browser.prod.js')).toBe(true)
  expect(existsSync(paths.bootstrapEntryPath)).toBe(true)
  expect(existsSync(paths.sourceRootPath)).toBe(true)
  expect(existsSync(paths.vueRuntimePath)).toBe(true)
})
