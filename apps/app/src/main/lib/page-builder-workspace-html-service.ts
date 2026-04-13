import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentWorkspace } from '@proma/shared'
import {
  scanCmsRenderingManifest,
  validateCmsRendering,
  type CmsRenderingManifest,
  type CmsRenderingValidationResult,
} from '@proma/page-builder-cms-rendering'
import {
  getWorkspaceCmsRenderingManifestPath,
  getWorkspaceFilesDir,
} from './config-paths'
import {
  getWorkspacePreviewState,
  type WorkspacePreviewState,
} from './workspace-preview-service'

type PageBuilderWorkspaceHtmlServiceErrorCode =
  | 'entry-missing'
  | 'postprocess-failed'

export class PageBuilderWorkspaceHtmlServiceError extends Error {
  code: PageBuilderWorkspaceHtmlServiceErrorCode

  constructor(code: PageBuilderWorkspaceHtmlServiceErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PageBuilderWorkspaceHtmlServiceError'
    this.code = code
  }
}

export interface PageBuilderWorkspaceHtmlMutationOptions {
  transform(currentHtml: string): string
  htmlPath?: string
}

export interface PageBuilderWorkspaceHtmlMutationResult {
  html: string
  changed: boolean
  manifest: CmsRenderingManifest
  validation: CmsRenderingValidationResult
  previewState: WorkspacePreviewState
}

export interface PageBuilderWorkspaceHtmlServiceOptions {
  now?: () => string
  getPreviewState?: (workspace: AgentWorkspace) => WorkspacePreviewState
  writeManifest?: (workspace: AgentWorkspace, manifest: CmsRenderingManifest) => void
}

export function createPageBuilderWorkspaceHtmlService(
  options: PageBuilderWorkspaceHtmlServiceOptions = {},
) {
  const resolveNow = options.now ?? (() => new Date().toISOString())
  const resolvePreviewState = options.getPreviewState ?? getWorkspacePreviewState
  const writeManifest = options.writeManifest ?? defaultWriteManifest

  return {
    mutate(
      workspace: AgentWorkspace,
      mutation: PageBuilderWorkspaceHtmlMutationOptions,
    ): PageBuilderWorkspaceHtmlMutationResult {
      const entryPath = join(getWorkspaceFilesDir(workspace.slug), mutation.htmlPath ?? 'index.html')
      if (!existsSync(entryPath)) {
        throw new PageBuilderWorkspaceHtmlServiceError('entry-missing', '预览入口不存在')
      }

      const manifestPath = getWorkspaceCmsRenderingManifestPath(workspace.slug)
      const currentHtml = readFileSync(entryPath, 'utf-8')
      const previousManifestRaw = existsSync(manifestPath)
        ? readFileSync(manifestPath, 'utf-8')
        : null

      const nextHtml = mutation.transform(currentHtml)
      const manifest = scanCmsRenderingManifest(nextHtml, {
        htmlPath: mutation.htmlPath ?? 'index.html',
        generatedAt: resolveNow(),
      })
      const validation = validateCmsRendering(nextHtml, {
        htmlPath: mutation.htmlPath ?? 'index.html',
      })
      const changed = nextHtml !== currentHtml

      try {
        if (changed) {
          writeFileSync(entryPath, nextHtml, 'utf-8')
        }

        writeManifest(workspace, manifest)

        return {
          html: nextHtml,
          changed,
          manifest,
          validation,
          previewState: resolvePreviewState(workspace),
        }
      } catch (error) {
        rollbackMutation(entryPath, currentHtml, changed, manifestPath, previousManifestRaw)
        throw new PageBuilderWorkspaceHtmlServiceError(
          'postprocess-failed',
          error instanceof Error ? error.message : String(error),
          { cause: error },
        )
      }
    },
  }
}

export const pageBuilderWorkspaceHtmlService = createPageBuilderWorkspaceHtmlService()

function defaultWriteManifest(workspace: AgentWorkspace, manifest: CmsRenderingManifest): void {
  writeFileSync(
    getWorkspaceCmsRenderingManifestPath(workspace.slug),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  )
}

function rollbackMutation(
  entryPath: string,
  previousHtml: string,
  htmlChanged: boolean,
  manifestPath: string,
  previousManifestRaw: string | null,
): void {
  try {
    if (htmlChanged) {
      writeFileSync(entryPath, previousHtml, 'utf-8')
    }

    if (previousManifestRaw === null) {
      rmSync(manifestPath, { force: true })
    } else {
      writeFileSync(manifestPath, previousManifestRaw, 'utf-8')
    }
  } catch {
    // Best-effort rollback only; the originating failure is more actionable.
  }
}
