import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getCmsRenderingPreviewBuildPaths } from '@ai-page-builder/page-builder-cms-rendering/preview/build-paths'

interface CmsRenderingPreviewBuildLog {
  message?: string
}

interface CmsRenderingPreviewBuildOutput {
  text(): Promise<string>
}

interface CmsRenderingPreviewBuildResult {
  success: boolean
  logs: CmsRenderingPreviewBuildLog[]
  outputs: CmsRenderingPreviewBuildOutput[]
}

interface BunBuildApi {
  build(options: {
    entrypoints: string[]
    target: 'browser'
    format: 'esm'
    minify: boolean
    sourcemap: 'none'
    external: string[]
  }): Promise<CmsRenderingPreviewBuildResult>
}

function resolveCmsRenderingPreviewEntryPath(): string {
  return getCmsRenderingPreviewBuildPaths().bootstrapEntryPath
}

function resolveCmsRenderingSourceRoot(): string {
  return getCmsRenderingPreviewBuildPaths().sourceRootPath
}

function resolveBundledVueAssetPath(): string {
  const configuredPath = process.env.PROMA_PAGE_BUILDER_CMS_RENDERING_VUE_PATH?.trim()
  if (configuredPath) {
    return configuredPath
  }

  return getCmsRenderingPreviewBuildPaths().vueRuntimePath
}

function collectRevisionEntries(dir: string, rootDir: string, entries: string[]): void {
  const children = readdirSync(dir, { withFileTypes: true })
  for (const child of children) {
    const fullPath = join(dir, child.name)

    if (child.isDirectory()) {
      collectRevisionEntries(fullPath, rootDir, entries)
      continue
    }

    if (!child.isFile()) {
      continue
    }

    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    const relativePath = fullPath.slice(rootDir.length + 1)
    entries.push(`${relativePath}:${stat.size}:${stat.mtimeMs}`)
  }
}

function getCmsRenderingPreviewVersion(): string {
  const rootDir = resolveCmsRenderingSourceRoot()
  const revisionEntries: string[] = []
  collectRevisionEntries(rootDir, rootDir, revisionEntries)
  revisionEntries.sort((left, right) => left.localeCompare(right))

  return createHash('sha1').update(revisionEntries.join('\n')).digest('hex')
}

function getCmsRenderingVueVersion(): string {
  const vueScript = readPageBuilderCmsRenderingVueScript()
  return createHash('sha1').update(vueScript).digest('hex')
}

export function getPageBuilderCmsRenderingPreviewAssetUrl(): string {
  return `/api/page-builder/cms-rendering-preview.js?v=${getCmsRenderingPreviewVersion()}`
}

export function getPageBuilderCmsRenderingVueAssetUrl(): string {
  return `/api/page-builder/cms-rendering-vue.js?v=${getCmsRenderingVueVersion()}`
}

export async function readPageBuilderCmsRenderingPreviewScript(): Promise<string> {
  const entryPath = resolveCmsRenderingPreviewEntryPath()
  if (!existsSync(entryPath)) {
    throw new Error(`CMS rendering preview bootstrap 不存在: ${entryPath}`)
  }

  const result = await (Bun as typeof Bun & BunBuildApi).build({
    entrypoints: [entryPath],
    target: 'browser',
    format: 'esm',
    minify: false,
    sourcemap: 'none',
    external: ['vue'],
  })

  if (!result.success) {
    const message = result.logs
      .map((log: CmsRenderingPreviewBuildLog) => log.message?.trim())
      .filter((value: string | undefined): value is string => Boolean(value))
      .join('\n')
    throw new Error(`构建 CMS rendering preview bootstrap 失败。\n${message}`)
  }

  const bundledOutput = result.outputs[0]
  if (!bundledOutput) {
    throw new Error('构建 CMS rendering preview bootstrap 失败。未生成输出。')
  }

  return await bundledOutput.text()
}

export function readPageBuilderCmsRenderingVueScript(): string {
  const sourcePath = resolveBundledVueAssetPath()
  if (!existsSync(sourcePath)) {
    throw new Error(`CMS rendering Vue 运行时脚本不存在: ${sourcePath}`)
  }

  return readFileSync(sourcePath, 'utf-8')
}
