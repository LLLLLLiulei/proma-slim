import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export interface CmsRenderingPreviewBuildPaths {
  bootstrapEntryPath: string
  sourceRootPath: string
  vueRuntimePath: string
}

export function getCmsRenderingPreviewBuildPaths(): CmsRenderingPreviewBuildPaths {
  const require = createRequire(import.meta.url)

  return {
    bootstrapEntryPath: fileURLToPath(new URL('./cms-rendering-preview-bootstrap.ts', import.meta.url)),
    sourceRootPath: fileURLToPath(new URL('../', import.meta.url)),
    vueRuntimePath: require.resolve('vue/dist/vue.esm-browser.prod.js'),
  }
}
