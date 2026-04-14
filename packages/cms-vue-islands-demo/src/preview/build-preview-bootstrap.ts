import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { previewBootstrapAssetPath, previewBootstrapEntryPath } from '../shared/paths'

let previewBootstrapBuildPromise: Promise<string> | null = null

function formatBuildErrors(logs: Array<{ message?: string }>): string {
  return logs
    .map((log) => log.message?.trim())
    .filter((message): message is string => Boolean(message))
    .join('\n')
}

async function buildPreviewBootstrapBundle(): Promise<string> {
  mkdirSync(dirname(previewBootstrapAssetPath), { recursive: true })

  const result = await Bun.build({
    entrypoints: [previewBootstrapEntryPath],
    target: 'browser',
    format: 'iife',
    minify: false,
    sourcemap: 'none',
    define: {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
  })

  if (!result.success) {
    throw new Error(`Failed to build preview bootstrap bundle.\n${formatBuildErrors(result.logs)}`)
  }

  const bundledOutput = result.outputs[0]
  if (!bundledOutput) {
    throw new Error('Failed to build preview bootstrap bundle.\nNo build output was produced.')
  }

  writeFileSync(previewBootstrapAssetPath, await bundledOutput.text(), 'utf-8')

  return previewBootstrapAssetPath
}

export function ensurePreviewBootstrapBundle(): Promise<string> {
  if (!previewBootstrapBuildPromise) {
    previewBootstrapBuildPromise = buildPreviewBootstrapBundle()
  }

  return previewBootstrapBuildPromise
}
