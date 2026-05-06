import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AgentWorkspace } from '@ai-page-builder/shared'
import {
  scanCmsRenderingManifest,
  validateCmsRendering,
  type CmsRenderingManifest,
  type CmsRenderingValidationResult,
} from '@ai-page-builder/page-builder-cms-rendering'
import { getWorkspaceCmsRenderingManifestPath, getWorkspaceFilesDir } from './config-paths'
import { getWorkspacePreviewState, type WorkspacePreviewState } from './workspace-preview-service'
import {
  mergeCmsRenderingSanitizationDiagnostics,
  sanitizeRuntimeOnlyCmsAuthoringHtml,
} from './page-builder-cms-authoring-sanitizer'

const PAGE_BUILDER_ENTRY_FILE = 'index.html'

export interface PageBuilderAgentHtmlSnapshot {
  entryExists: boolean
  entryHtml: string | null
  manifestRaw: string | null
}

export interface PageBuilderAgentHtmlGuardrailsResult {
  status: 'unchanged' | 'validated' | 'invalid'
  validation: CmsRenderingValidationResult
  manifest: CmsRenderingManifest | null
  previewState: WorkspacePreviewState
}

export interface FinalizePageBuilderAgentHtmlGuardrailsOptions {
  now?: () => string
}

export function capturePageBuilderAgentHtmlSnapshot(
  workspace: AgentWorkspace,
): PageBuilderAgentHtmlSnapshot {
  const entryPath = join(getWorkspaceFilesDir(workspace.slug), PAGE_BUILDER_ENTRY_FILE)
  const manifestPath = getWorkspaceCmsRenderingManifestPath(workspace.slug)

  return {
    entryExists: existsSync(entryPath),
    entryHtml: existsSync(entryPath) ? readFileSync(entryPath, 'utf-8') : null,
    manifestRaw: existsSync(manifestPath) ? readFileSync(manifestPath, 'utf-8') : null,
  }
}

export function finalizePageBuilderAgentHtmlGuardrails(
  workspace: AgentWorkspace,
  snapshot: PageBuilderAgentHtmlSnapshot,
  options: FinalizePageBuilderAgentHtmlGuardrailsOptions = {},
): PageBuilderAgentHtmlGuardrailsResult {
  const now = options.now ?? (() => new Date().toISOString())
  const entryPath = join(getWorkspaceFilesDir(workspace.slug), PAGE_BUILDER_ENTRY_FILE)
  const manifestPath = getWorkspaceCmsRenderingManifestPath(workspace.slug)
  const entryExists = existsSync(entryPath)
  const currentManifestRaw = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf-8') : null
  const sanitizedSnapshotHtml = snapshot.entryHtml === null
    ? null
    : sanitizeRuntimeOnlyCmsAuthoringHtml(snapshot.entryHtml, PAGE_BUILDER_ENTRY_FILE).html

  if (!entryExists) {
    if (!snapshot.entryExists && currentManifestRaw === snapshot.manifestRaw) {
      return {
        status: 'unchanged',
        validation: createEmptyValidationResult(true),
        manifest: null,
        previewState: getWorkspacePreviewState(workspace),
      }
    }

    return {
      status: 'invalid',
      validation: createEmptyValidationResult(false),
      manifest: null,
      previewState: getWorkspacePreviewState(workspace),
    }
  }

  const currentHtmlRaw = readFileSync(entryPath, 'utf-8')
  const sanitization = sanitizeRuntimeOnlyCmsAuthoringHtml(currentHtmlRaw, PAGE_BUILDER_ENTRY_FILE)
  const currentHtml = sanitization.html
  if (currentHtml !== currentHtmlRaw) {
    writeFileSync(entryPath, currentHtml, 'utf-8')
  }

  const htmlChanged = currentHtml !== sanitizedSnapshotHtml
  const manifestChanged = currentManifestRaw !== snapshot.manifestRaw

  if (!htmlChanged && !manifestChanged) {
    const manifest = scanCmsRenderingManifest(currentHtml, {
      htmlPath: PAGE_BUILDER_ENTRY_FILE,
      generatedAt: now(),
    })
    const validation = mergeCmsRenderingSanitizationDiagnostics(
      validateCmsRendering(currentHtml, {
        htmlPath: PAGE_BUILDER_ENTRY_FILE,
      }),
      sanitization.diagnostics,
    )

    return {
      status: 'unchanged',
      validation,
      manifest,
      previewState: getWorkspacePreviewState(workspace),
    }
  }

  const validation = mergeCmsRenderingSanitizationDiagnostics(
    validateCmsRendering(currentHtml, {
      htmlPath: PAGE_BUILDER_ENTRY_FILE,
    }),
    sanitization.diagnostics,
  )

  if (validation.errors.length > 0) {
    return {
      status: 'invalid',
      validation,
      manifest: null,
      previewState: getWorkspacePreviewState(workspace),
    }
  }

  const manifest = scanCmsRenderingManifest(currentHtml, {
    htmlPath: PAGE_BUILDER_ENTRY_FILE,
    generatedAt: now(),
  })
  mkdirSync(getWorkspaceFilesDir(workspace.slug), { recursive: true })
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  return {
    status: 'validated',
    validation,
    manifest,
    previewState: getWorkspacePreviewState(workspace),
  }
}

function createEmptyValidationResult(valid: boolean): CmsRenderingValidationResult {
  return {
    valid,
    diagnostics: [],
    errors: [],
    warnings: [],
    infos: [],
  }
}
