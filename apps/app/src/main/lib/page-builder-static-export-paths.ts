import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir } from './config-paths'

const PAGE_BUILDER_EXPORTS_DIR_NAME = 'page-builder-exports'
const PAGE_BUILDER_EXPORT_TTL_MS = 60 * 60 * 1000

function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

export function getPageBuilderStaticExportsRootDir(): string {
  return ensureDir(join(getConfigDir(), PAGE_BUILDER_EXPORTS_DIR_NAME))
}

export function getPageBuilderStaticExportJobDir(jobId: string): string {
  return ensureDir(join(getPageBuilderStaticExportsRootDir(), jobId))
}

export function getPageBuilderStaticExportStagingDir(jobId: string): string {
  return ensureDir(join(getPageBuilderStaticExportJobDir(jobId), 'staging'))
}

export function getPageBuilderStaticExportPackagePath(jobId: string): string {
  return join(getPageBuilderStaticExportJobDir(jobId), 'package.zip')
}

export function getPageBuilderStaticExportReportPath(jobId: string): string {
  return join(getPageBuilderStaticExportJobDir(jobId), 'export-report.json')
}

export function getPageBuilderStaticExportTtlMs(): number {
  return PAGE_BUILDER_EXPORT_TTL_MS
}

export function cleanupExpiredPageBuilderStaticExportDirs(
  activeJobIds: Iterable<string>,
  now = Date.now(),
): void {
  const active = new Set(activeJobIds)
  const rootDir = getPageBuilderStaticExportsRootDir()

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    if (active.has(entry.name)) {
      continue
    }

    const jobDir = join(rootDir, entry.name)
    const maxAge = now - PAGE_BUILDER_EXPORT_TTL_MS
    if (entry.parentPath) {
      // no-op; Bun exposes parentPath on Dirent in some environments.
    }

    try {
      const stat = statSync(jobDir)
      if (stat.mtimeMs <= maxAge) {
        rmSync(jobDir, { recursive: true, force: true })
      }
    } catch {
      rmSync(jobDir, { recursive: true, force: true })
    }
  }
}
