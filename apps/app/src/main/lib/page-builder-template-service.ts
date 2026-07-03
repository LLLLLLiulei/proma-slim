import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pipeline } from 'node:stream/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { unzipSync, Zip, ZipDeflate } from 'fflate'
import { parseHTML } from 'linkedom'
import type {
  AgentWorkspace,
  PageBuilderTemplateDetail,
  PageBuilderTemplateImportResponse,
  PageBuilderTemplateListResponse,
  PageBuilderTemplateManifestV1,
  PageBuilderTemplateRenameRequest,
  PageBuilderTemplateRenameResponse,
  PageBuilderTemplateSaveRequest,
  PageBuilderTemplateSaveResponse,
  PageBuilderTemplateSourceProject,
  PageBuilderTemplateSummary,
  PageBuilderTemplateUseResponse,
  PageBuilderTemplateValidationIssue,
  PageBuilderTemplateValidationReport,
  PageBuilderStaticExportReport,
} from '@ai-page-builder/shared'
import { createFileResponse } from '../http/file-response'
import { getUserPageBuilderTemplatesDir, getWorkspaceFilesDir } from './config-paths'
import { createAgentSession } from './agent-session-manager'
import { buildPageBuilderPublicUrl } from './page-builder-public-url'
import { deletePageBuilderProject } from './page-builder-project-service'
import {
  PageBuilderStaticExportServiceError,
  pageBuilderStaticExportService,
} from './page-builder-static-export-service'
import { getWorkspacePreviewState } from './workspace-preview-service'
import { createAgentWorkspace } from './workspace-service'

const require = createRequire(import.meta.url)

interface StreamZipEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  encrypted: boolean
  size: number
}

interface StreamZipAsyncArchive {
  entries(): Promise<Record<string, StreamZipEntry>>
  entryData(entry: string | StreamZipEntry): Promise<Buffer>
  stream(entry: string | StreamZipEntry): Promise<NodeJS.ReadableStream>
  close(): Promise<void>
}

const StreamZip = require('node-stream-zip') as {
  async: new (config: {
    file: string
    storeEntries?: boolean
    skipEntryNameValidation?: boolean
  }) => StreamZipAsyncArchive
}

const TEMPLATE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const TEMPLATE_ENTRY = 'workspace-files/index.html' as const
const DEFAULT_TEMPLATE_IMPORT_MAX_ZIP_MB = 100
const DEFAULT_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB = 500
const TEMPLATE_PREVIEW_CSP = "sandbox allow-scripts allow-forms allow-popups allow-same-origin; frame-ancestors 'self'"

export class PageBuilderTemplateServiceError extends Error {
  constructor(
    readonly code:
      | 'not-found'
      | 'forbidden'
      | 'invalid-input'
      | 'entry-missing'
      | 'export-active'
      | 'export-failed'
      | 'cms-marker-present'
      | 'validation-failed'
      | 'remote-runtime-dependency'
      | 'resource-download-failed'
      | 'sensitive-data-present'
      | 'unsafe-file'
      | 'instantiate-failed'
      | 'size-limit',
    message: string,
  ) {
    super(message)
    this.name = 'PageBuilderTemplateServiceError'
  }
}

interface RegisteredTemplate {
  manifest: PageBuilderTemplateManifestV1
  templateDir: string
  workspaceFilesDir: string
}

interface TemplatePreviewFile {
  filePath: string
  isHtml: boolean
}

interface PageBuilderTemplateSaveContext {
  sourceMode: PageBuilderTemplateSourceProject['sourceMode']
  cmsProjectId?: string
  cmsSiteId?: string
  cmsExternalRecordId?: string
}

interface NormalizedTemplateSaveInput {
  name: string
  description?: string
  tags?: string[]
}

interface PageBuilderTemplateInstantiateOptions {
  projectName: string
}

interface PageBuilderTemplateListOptions {
  name?: string
}

interface PageBuilderTemplateImportLimits {
  maxZipBytes: number
  maxUncompressedBytes: number
}

interface NormalizedZipEntry {
  entry: StreamZipEntry
  name: string
}

interface ImportSiteRoot {
  root: string
  entryFile: string
}

interface TemplateImportReport {
  version: 1
  sourceFileName: string
  importedAt: string
  entryRoot: string
  entryFile: string
  originalZipSize: number
  uncompressedSize: number
}

interface TemplateDownloadEntry {
  archivePath: string
  content?: Uint8Array
  filePath?: string
}

interface TemplateDownloadArtifact {
  fallbackFileName: string
  fileName: string
  stream: ReadableStream<Uint8Array>
}

function warnInvalidTemplate(templateDir: string, reason: string): void {
  console.warn(`[PageBuilder 模板库] 跳过非法模板: ${templateDir} (${reason})`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readOptionalString(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}

function readPositiveMegabytesEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return fallback
  }

  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function megabytesToBytes(value: number): number {
  return Math.floor(value * 1024 * 1024)
}

function normalizeSearchKeyword(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

export function getPageBuilderTemplateImportLimits(): PageBuilderTemplateImportLimits {
  return {
    maxZipBytes: megabytesToBytes(readPositiveMegabytesEnv(
      'AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB',
      DEFAULT_TEMPLATE_IMPORT_MAX_ZIP_MB,
    )),
    maxUncompressedBytes: megabytesToBytes(readPositiveMegabytesEnv(
      'AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB',
      DEFAULT_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB,
    )),
  }
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const items = value
    .map((item) => readOptionalString(item))
    .filter((item): item is string => Boolean(item))

  return items.length > 0 ? items : undefined
}

function readSourceProject(value: unknown): PageBuilderTemplateSourceProject | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const sourceMode = readOptionalString(value.sourceMode)
  return {
    ...(readOptionalString(value.workspaceId) ? { workspaceId: readOptionalString(value.workspaceId) } : {}),
    ...(readOptionalString(value.workspaceName) ? { workspaceName: readOptionalString(value.workspaceName) } : {}),
    ...(sourceMode === 'standalone' || sourceMode === 'cms-integrated' ? { sourceMode } : {}),
    ...(readOptionalString(value.exportedAt) ? { exportedAt: readOptionalString(value.exportedAt) } : {}),
    ...(readOptionalString(value.cmsProjectId) ? { cmsProjectId: readOptionalString(value.cmsProjectId) } : {}),
    ...(readOptionalString(value.cmsSiteId) ? { cmsSiteId: readOptionalString(value.cmsSiteId) } : {}),
    ...(readOptionalString(value.cmsExternalRecordId) ? { cmsExternalRecordId: readOptionalString(value.cmsExternalRecordId) } : {}),
  }
}

function parseTemplateManifest(templateDir: string, dirName: string): PageBuilderTemplateManifestV1 | null {
  const manifestPath = join(templateDir, 'template.json')
  if (!existsSync(manifestPath)) {
    warnInvalidTemplate(templateDir, '缺少 template.json')
    return null
  }

  let manifestJson: unknown
  try {
    manifestJson = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    warnInvalidTemplate(templateDir, 'template.json 不是合法 JSON')
    return null
  }

  if (!isRecord(manifestJson)) {
    warnInvalidTemplate(templateDir, 'template.json 必须是对象')
    return null
  }

  const id = readOptionalString(manifestJson.id)
  const name = readOptionalString(manifestJson.name)
  const createdAt = readOptionalString(manifestJson.createdAt)

  if (manifestJson.version !== 1) {
    warnInvalidTemplate(templateDir, 'version 必须为 1')
    return null
  }

  if (!id || id !== dirName || !TEMPLATE_ID_PATTERN.test(id)) {
    warnInvalidTemplate(templateDir, 'id 不合法或与目录名不一致')
    return null
  }

  if (!name) {
    warnInvalidTemplate(templateDir, 'name 不能为空')
    return null
  }

  if (manifestJson.sourceKind !== 'saved-project') {
    warnInvalidTemplate(templateDir, 'sourceKind 必须为 saved-project')
    return null
  }

  if (manifestJson.entry !== TEMPLATE_ENTRY) {
    warnInvalidTemplate(templateDir, `entry 必须为 ${TEMPLATE_ENTRY}`)
    return null
  }

  const workspaceFilesDir = join(templateDir, 'workspace-files')
  if (!existsSync(workspaceFilesDir) || !lstatSync(workspaceFilesDir).isDirectory()) {
    warnInvalidTemplate(templateDir, 'workspace-files 必须是普通目录')
    return null
  }

  if (!createdAt) {
    warnInvalidTemplate(templateDir, 'createdAt 不能为空')
    return null
  }

  const entryPath = join(templateDir, TEMPLATE_ENTRY)
  if (!existsSync(entryPath) || !lstatSync(entryPath).isFile() || !statSync(entryPath).isFile()) {
    warnInvalidTemplate(templateDir, '入口文件不存在')
    return null
  }

  return {
    version: 1,
    id,
    name,
    ...(readOptionalString(manifestJson.description) ? { description: readOptionalString(manifestJson.description) } : {}),
    ...(readStringArray(manifestJson.tags) ? { tags: readStringArray(manifestJson.tags) } : {}),
    ...(readOptionalString(manifestJson.category) ? { category: readOptionalString(manifestJson.category) } : {}),
    sourceKind: 'saved-project',
    entry: TEMPLATE_ENTRY,
    createdAt,
    ...(readSourceProject(manifestJson.sourceProject) ? { sourceProject: readSourceProject(manifestJson.sourceProject) } : {}),
  }
}

function isWithinRoot(rootDir: string, targetPath: string): boolean {
  return targetPath === rootDir || targetPath.startsWith(`${rootDir}${sep}`)
}

function formatTemplateTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ]

  const [year, ...rest] = parts
  return `${year}${rest.map((part) => String(part).padStart(2, '0')).join('')}`
}

function normalizeSaveInput(input: PageBuilderTemplateSaveRequest): NormalizedTemplateSaveInput {
  if (!isRecord(input)) {
    throw new PageBuilderTemplateServiceError('invalid-input', '请求体必须是 JSON 对象')
  }

  const name = readOptionalString(input.name)
  if (!name) {
    throw new PageBuilderTemplateServiceError('invalid-input', '模板名称不能为空')
  }

  return {
    name,
    ...(readOptionalString(input.description) ? { description: readOptionalString(input.description) } : {}),
    ...(readStringArray(input.tags) ? { tags: readStringArray(input.tags) } : {}),
  }
}

function normalizeRenameInput(input: PageBuilderTemplateRenameRequest): Pick<NormalizedTemplateSaveInput, 'name'> {
  if (!isRecord(input)) {
    throw new PageBuilderTemplateServiceError('invalid-input', '请求体必须是 JSON 对象')
  }

  const name = readOptionalString(input.name)
  if (!name) {
    throw new PageBuilderTemplateServiceError('invalid-input', '模板名称不能为空')
  }

  return { name }
}

export function mayContainCmsAuthoringMarkers(sourceHtml: string): boolean {
  if (!mayNeedCmsAuthoringMarkerScan(sourceHtml)) {
    return false
  }

  const { document } = parseHTML(sourceHtml)
  if (document.querySelector('cms-content, cms-catalog')) {
    return true
  }

  return Array.from(document.querySelectorAll('script')).some(isCmsPreviewRuntimeScript)
}

function mayNeedCmsAuthoringMarkerScan(sourceHtml: string): boolean {
  return /<cms-(?:content|catalog)\b/i.test(sourceHtml)
    || sourceHtml.includes('data-proma-cms-rendering-')
    || sourceHtml.includes('__PROMA_CMS_RENDERING_PREVIEW__')
    || sourceHtml.includes('cms-rendering-preview.js')
}

function isCmsPreviewRuntimeScript(script: Element): boolean {
  for (const attribute of Array.from(script.attributes)) {
    if (attribute.name.startsWith('data-proma-cms-rendering-')) {
      return true
    }
  }

  const src = script.getAttribute('src')
  return Boolean(src?.includes('cms-rendering-preview.js'))
    || script.textContent.includes('__PROMA_CMS_RENDERING_PREVIEW__')
}

function collectFiles(rootDir: string, predicate: (filePath: string) => boolean): string[] {
  if (!existsSync(rootDir)) {
    return []
  }

  const result: string[] = []
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const filePath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectFiles(filePath, predicate))
      continue
    }

    if (entry.isFile() && predicate(filePath)) {
      result.push(filePath)
    }
  }

  return result
}

function collectTemplateDownloadEntries(
  workspaceFilesDir: string,
  currentDir: string,
  rootRealPath: string,
): TemplateDownloadEntry[] {
  const result: TemplateDownloadEntry[] = []

  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const filePath = join(currentDir, entry.name)
    const fileStat = lstatSync(filePath)

    if (fileStat.isSymbolicLink() || (!fileStat.isDirectory() && !fileStat.isFile())) {
      throw new PageBuilderTemplateServiceError('forbidden', '模板包含不支持的文件类型，无法下载')
    }

    const resolvedPath = realpathSync(filePath)
    if (!isWithinRoot(rootRealPath, resolvedPath)) {
      throw new PageBuilderTemplateServiceError('forbidden', '非法模板路径')
    }

    if (fileStat.isDirectory()) {
      result.push(...collectTemplateDownloadEntries(workspaceFilesDir, filePath, rootRealPath))
      continue
    }

    const workspaceRelativePath = relative(workspaceFilesDir, filePath).replace(/\\/g, '/')
    if (!workspaceRelativePath || workspaceRelativePath.split('/').includes('..')) {
      throw new PageBuilderTemplateServiceError('forbidden', '非法模板路径')
    }

    result.push({
      archivePath: `workspace-files/${workspaceRelativePath}`,
      filePath,
    })
  }

  return result
}

function createPortableTemplateManifest(manifest: PageBuilderTemplateManifestV1): PageBuilderTemplateManifestV1 {
  return {
    version: 1,
    id: manifest.id,
    name: manifest.name,
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(manifest.tags ? { tags: manifest.tags } : {}),
    ...(manifest.category ? { category: manifest.category } : {}),
    sourceKind: manifest.sourceKind,
    entry: manifest.entry,
    createdAt: manifest.createdAt,
  }
}

function buildTemplateDownloadFileName(template: RegisteredTemplate): string {
  return `${template.manifest.name || template.manifest.id}.zip`
}

function buildTemplateDownloadFallbackFileName(template: RegisteredTemplate): string {
  return `${template.manifest.id}.zip`
}

async function pushDownloadEntry(zipEntry: ZipDeflate, entry: TemplateDownloadEntry): Promise<void> {
  if (entry.content) {
    zipEntry.push(entry.content, true)
    return
  }

  if (!entry.filePath) {
    zipEntry.push(new Uint8Array(), true)
    return
  }

  for await (const chunk of createReadStream(entry.filePath)) {
    zipEntry.push(chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk)))
  }
  zipEntry.push(new Uint8Array(), true)
}

function createTemplateZipStream(entries: TemplateDownloadEntry[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          controller.error(error)
          return
        }

        if (chunk) {
          controller.enqueue(chunk)
        }

        if (final) {
          controller.close()
        }
      })

      try {
        for (const entry of entries) {
          const zipEntry = new ZipDeflate(entry.archivePath, { level: 6 })
          zip.add(zipEntry)
          await pushDownloadEntry(zipEntry, entry)
        }
        zip.end()
      } catch (error) {
        zip.terminate()
        controller.error(error)
      }
    },
  })
}

function safeRelativePath(rootDir: string, filePath: string): string {
  return relative(rootDir, filePath).replace(/\\/g, '/')
}

function isRemoteRuntimeUrl(value: string | null): boolean {
  if (!value) {
    return false
  }

  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed)
}

function containsSensitiveData(content: string): boolean {
  return /(?:cookie|session|token|access[_-]?session|secret)\s*[:=]\s*["'][^"']+["']/i.test(content)
}

function normalizeUploadedZipBaseName(fileName: string): string {
  const normalized = basename(fileName || '导入模板').replace(/\.zip$/i, '').trim()
  return normalized || '导入模板'
}

function normalizeZipEntryPath(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/').replace(/^\.\//, '')
  if (
    normalized.startsWith('/')
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.includes('\0')
  ) {
    throw new PageBuilderTemplateServiceError('forbidden', '压缩包包含非法路径，已拒绝导入')
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '..')) {
    throw new PageBuilderTemplateServiceError('forbidden', '压缩包包含非法路径，已拒绝导入')
  }

  return parts.join('/')
}

function isIgnoredZipEntry(entryName: string): boolean {
  const parts = entryName.split('/')
  return parts[0] === '__MACOSX' || parts.some((part) => part === '.DS_Store')
}

function getEntryOutputRelativePath(entryName: string, root: string): string | null {
  if (!root) {
    return entryName || null
  }

  if (entryName === root) {
    return null
  }

  const prefix = `${root}/`
  return entryName.startsWith(prefix) ? entryName.slice(prefix.length) : null
}

function dirnamePosix(entryName: string): string {
  const index = entryName.lastIndexOf('/')
  return index === -1 ? '' : entryName.slice(0, index)
}

function basenamePosix(entryName: string): string {
  const index = entryName.lastIndexOf('/')
  return index === -1 ? entryName : entryName.slice(index + 1)
}

function findImportSiteRoot(entries: NormalizedZipEntry[]): ImportSiteRoot {
  const fileNames = entries
    .filter(({ entry }) => entry.isFile)
    .map(({ name }) => name)

  if (fileNames.includes('index.html')) {
    return { root: '', entryFile: 'index.html' }
  }

  if (fileNames.includes('workspace-files/index.html')) {
    return { root: 'workspace-files', entryFile: 'workspace-files/index.html' }
  }

  const topLevel = new Set(
    entries
      .map(({ name }) => name.split('/')[0])
      .filter((part): part is string => Boolean(part)),
  )
  if (topLevel.size === 1) {
    const [root] = Array.from(topLevel)
    if (root && fileNames.includes(`${root}/index.html`)) {
      return { root, entryFile: `${root}/index.html` }
    }
  }

  const indexFiles = fileNames.filter((name) => basenamePosix(name).toLowerCase() === 'index.html')
  if (indexFiles.length === 1) {
    const entryFile = indexFiles[0]!
    return { root: dirnamePosix(entryFile), entryFile }
  }

  if (indexFiles.length > 1) {
    throw new PageBuilderTemplateServiceError('invalid-input', '压缩包中存在多个 index.html，无法自动判断模板入口')
  }

  throw new PageBuilderTemplateServiceError('invalid-input', '压缩包中未找到 index.html，无法导入为模板')
}

function createValidationReport(issues: PageBuilderTemplateValidationIssue[], generatedAt: string): PageBuilderTemplateValidationReport {
  return {
    version: 1,
    generatedAt,
    ok: issues.length === 0,
    issues,
  }
}

export function isValidPageBuilderTemplateId(templateId: string): boolean {
  return TEMPLATE_ID_PATTERN.test(templateId)
}

export class PageBuilderTemplateService {
  async saveWorkspaceAsTemplate(
    workspace: AgentWorkspace,
    input: PageBuilderTemplateSaveRequest,
    context: PageBuilderTemplateSaveContext,
  ): Promise<PageBuilderTemplateSaveResponse> {
    if (workspace.template !== 'page-builder') {
      throw new PageBuilderTemplateServiceError('invalid-input', '仅支持 PageBuilder 工作区另存模板')
    }

    const normalizedInput = normalizeSaveInput(input)
    const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
    const sourceEntryPath = join(workspaceFilesDir, 'index.html')
    if (!existsSync(sourceEntryPath) || !lstatSync(sourceEntryPath).isFile()) {
      throw new PageBuilderTemplateServiceError('entry-missing', '当前项目没有可另存的页面')
    }

    const sourceMode = context.sourceMode === 'cms-integrated' ? 'cms-integrated' : 'standalone'

    const templatesRoot = getUserPageBuilderTemplatesDir()
    const createdAtMs = Date.now()
    const createdAt = new Date(createdAtMs).toISOString()
    const exportedAt = createdAt
    const templateId = this.createUniqueTemplateId(templatesRoot, createdAtMs)
    const finalTemplateDir = join(templatesRoot, templateId)
    const tempTemplateDir = join(templatesRoot, `.tmp-${templateId}-${process.pid}-${randomUUID().replace(/-/g, '').slice(0, 8)}`)
    const templateWorkspaceFilesDir = join(tempTemplateDir, 'workspace-files')
    const reportsDir = join(tempTemplateDir, 'reports')
    const sourceDir = join(tempTemplateDir, 'source')

    try {
      mkdirSync(templateWorkspaceFilesDir, { recursive: true })
      mkdirSync(reportsDir, { recursive: true })
      mkdirSync(sourceDir, { recursive: true })

      const artifact = await pageBuilderStaticExportService.exportWorkspaceStaticPackage(workspace, {
        downloadCmsRemoteAssets: true,
      })
      this.unpackStaticExportPackage(artifact.filePath, templateWorkspaceFilesDir)

      const staticExportReportContent = readFileSync(artifact.reportPath, 'utf-8')
      writeFileSync(join(reportsDir, 'static-export-report.json'), staticExportReportContent, 'utf-8')
      const staticExportReport = JSON.parse(staticExportReportContent) as PageBuilderStaticExportReport

      rmSync(join(templateWorkspaceFilesDir, '.proma', 'cms-rendering-manifest.json'), { force: true })

      const sourceProject: PageBuilderTemplateSourceProject = {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        sourceMode,
        exportedAt,
        ...(context.cmsProjectId ? { cmsProjectId: context.cmsProjectId } : {}),
        ...(context.cmsSiteId ? { cmsSiteId: context.cmsSiteId } : {}),
        ...(context.cmsExternalRecordId ? { cmsExternalRecordId: context.cmsExternalRecordId } : {}),
      }
      const manifest: PageBuilderTemplateManifestV1 = {
        version: 1,
        id: templateId,
        name: normalizedInput.name,
        ...(normalizedInput.description ? { description: normalizedInput.description } : {}),
        ...(normalizedInput.tags ? { tags: normalizedInput.tags } : {}),
        sourceKind: 'saved-project',
        entry: TEMPLATE_ENTRY,
        createdAt,
        sourceProject,
      }

      writeFileSync(join(sourceDir, 'source-project.json'), JSON.stringify(sourceProject, null, 2), 'utf-8')
      writeFileSync(join(tempTemplateDir, 'template.json'), JSON.stringify(manifest, null, 2), 'utf-8')

      const validationReport = this.validateTemplateOutput(tempTemplateDir, templateWorkspaceFilesDir, staticExportReport, createdAt)
      writeFileSync(join(reportsDir, 'template-validation-report.json'), JSON.stringify(validationReport, null, 2), 'utf-8')
      if (!validationReport.ok) {
        throw this.createValidationError(validationReport.issues)
      }

      renameSync(tempTemplateDir, finalTemplateDir)

      return {
        template: this.toSummary({
          manifest,
          templateDir: finalTemplateDir,
          workspaceFilesDir: join(finalTemplateDir, 'workspace-files'),
        }),
      }
    } catch (error) {
      rmSync(tempTemplateDir, { recursive: true, force: true })

      if (error instanceof PageBuilderTemplateServiceError) {
        throw error
      }

      if (error instanceof PageBuilderStaticExportServiceError) {
        if (error.code === 'entry-missing') {
          throw new PageBuilderTemplateServiceError('entry-missing', '当前项目没有可另存的页面')
        }

        if (error.code === 'export-active') {
          throw new PageBuilderTemplateServiceError('export-active', error.message)
        }

        throw new PageBuilderTemplateServiceError('export-failed', error.message)
      }

      throw error
    }
  }

  async importTemplateZip(file: File): Promise<PageBuilderTemplateImportResponse> {
    if (!(file instanceof File)) {
      throw new PageBuilderTemplateServiceError('invalid-input', 'multipart 请求缺少 file 字段')
    }

    const limits = getPageBuilderTemplateImportLimits()
    if (file.size > limits.maxZipBytes) {
      throw new PageBuilderTemplateServiceError('size-limit', '模板压缩包超过大小限制')
    }

    const templatesRoot = getUserPageBuilderTemplatesDir()
    const createdAtMs = Date.now()
    const createdAt = new Date(createdAtMs).toISOString()
    const templateId = this.createUniqueTemplateId(templatesRoot, createdAtMs, 'tpl_imported')
    const tempSuffix = `${process.pid}-${randomUUID().replace(/-/g, '').slice(0, 8)}`
    const tempZipPath = join(templatesRoot, `.tmp-${templateId}-${tempSuffix}.zip`)
    const finalTemplateDir = join(templatesRoot, templateId)
    const tempTemplateDir = join(templatesRoot, `.tmp-${templateId}-${tempSuffix}`)
    const templateWorkspaceFilesDir = join(tempTemplateDir, 'workspace-files')
    const reportsDir = join(tempTemplateDir, 'reports')
    let zip: StreamZipAsyncArchive | null = null

    try {
      writeFileSync(tempZipPath, Buffer.from(await file.arrayBuffer()))
      mkdirSync(templateWorkspaceFilesDir, { recursive: true })
      mkdirSync(reportsDir, { recursive: true })

      zip = new StreamZip.async({
        file: tempZipPath,
        storeEntries: true,
        skipEntryNameValidation: true,
      })
      const entries = this.normalizeZipEntries(Object.values(await zip.entries()))
      const siteRoot = findImportSiteRoot(entries)
      const extractableEntries: Array<NormalizedZipEntry & { outputRelativePath: string }> = []
      for (const item of entries) {
        if (!item.entry.isFile) {
          continue
        }

        const outputRelativePath = getEntryOutputRelativePath(item.name, siteRoot.root)
        if (!outputRelativePath) {
          continue
        }

        extractableEntries.push({
          ...item,
          outputRelativePath,
        })
      }

      let uncompressedSize = 0
      for (const item of extractableEntries) {
        uncompressedSize += item.entry.size
        if (uncompressedSize > limits.maxUncompressedBytes) {
          throw new PageBuilderTemplateServiceError('size-limit', '模板解压后内容超过大小限制')
        }
      }

      const workspaceRoot = resolve(templateWorkspaceFilesDir)
      for (const item of extractableEntries) {
        const targetPath = resolve(templateWorkspaceFilesDir, item.outputRelativePath)
        if (!isWithinRoot(workspaceRoot, targetPath)) {
          throw new PageBuilderTemplateServiceError('forbidden', '压缩包包含非法路径，已拒绝导入')
        }

        mkdirSync(dirname(targetPath), { recursive: true })
        await pipeline(await zip.stream(item.entry), createWriteStream(targetPath))
      }

      if (!existsSync(join(templateWorkspaceFilesDir, 'index.html'))) {
        throw new PageBuilderTemplateServiceError('invalid-input', '压缩包中未找到 index.html，无法导入为模板')
      }

      const templateName = await this.resolveImportedTemplateName(zip, entries, siteRoot.root, file.name)
      const manifest: PageBuilderTemplateManifestV1 = {
        version: 1,
        id: templateId,
        name: templateName,
        sourceKind: 'saved-project',
        entry: TEMPLATE_ENTRY,
        createdAt,
        sourceProject: {
          sourceMode: 'standalone',
          exportedAt: createdAt,
        },
      }
      const report: TemplateImportReport = {
        version: 1,
        sourceFileName: file.name,
        importedAt: createdAt,
        entryRoot: siteRoot.root,
        entryFile: siteRoot.entryFile,
        originalZipSize: file.size,
        uncompressedSize,
      }

      writeFileSync(join(tempTemplateDir, 'template.json'), JSON.stringify(manifest, null, 2), 'utf-8')
      writeFileSync(join(reportsDir, 'template-import-report.json'), JSON.stringify(report, null, 2), 'utf-8')
      renameSync(tempTemplateDir, finalTemplateDir)

      return {
        template: this.toSummary({
          manifest,
          templateDir: finalTemplateDir,
          workspaceFilesDir: join(finalTemplateDir, 'workspace-files'),
        }),
      }
    } catch (error) {
      rmSync(tempTemplateDir, { recursive: true, force: true })

      if (error instanceof PageBuilderTemplateServiceError) {
        throw error
      }

      throw new PageBuilderTemplateServiceError('invalid-input', '模板压缩包无法解析或不受支持')
    } finally {
      try {
        await zip?.close()
      } catch {
        // Ignore cleanup failures after import errors.
      }
      rmSync(tempZipPath, { force: true })
    }
  }

  instantiateTemplateProject(
    templateId: string,
    options: PageBuilderTemplateInstantiateOptions,
  ): PageBuilderTemplateUseResponse {
    const projectName = readOptionalString(options.projectName)
    if (!projectName) {
      throw new PageBuilderTemplateServiceError('invalid-input', '项目名称不能为空')
    }

    const template = this.resolveTemplate(templateId)
    let workspace: ReturnType<typeof createAgentWorkspace> | null = null

    try {
      workspace = createAgentWorkspace(projectName, { template: 'page-builder' })
      const targetWorkspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
      rmSync(targetWorkspaceFilesDir, { recursive: true, force: true })
      mkdirSync(targetWorkspaceFilesDir, { recursive: true })

      this.copyTemplateWorkspaceFiles(template.workspaceFilesDir, targetWorkspaceFilesDir)
      rmSync(join(targetWorkspaceFilesDir, '.proma', 'cms-rendering-manifest.json'), { force: true })

      const session = createAgentSession(undefined, undefined, workspace.id)
      const previewState = getWorkspacePreviewState(workspace)

      return {
        workspace,
        session,
        previewState,
      }
    } catch (error) {
      if (workspace) {
        this.rollbackInstantiatedProject(workspace.id)
      }

      if (error instanceof PageBuilderTemplateServiceError) {
        throw error
      }

      const message = error instanceof Error ? error.message : String(error)
      throw new PageBuilderTemplateServiceError('instantiate-failed', `创建模板项目失败: ${message}`)
    }
  }

  listTemplates(options: PageBuilderTemplateListOptions = {}): PageBuilderTemplateListResponse {
    const nameKeyword = normalizeSearchKeyword(options.name)
    const templates = this.scanTemplates()
      .map((template) => this.toSummary(template))
      .filter((template) => (
        nameKeyword ? template.name.toLowerCase().includes(nameKeyword) : true
      ))
      .sort((left, right) => {
        const timeDiff = Date.parse(right.createdAt) - Date.parse(left.createdAt)
        return Number.isNaN(timeDiff) || timeDiff === 0
          ? left.id.localeCompare(right.id)
          : timeDiff
      })

    return { templates }
  }

  getTemplate(templateId: string): PageBuilderTemplateDetail {
    const template = this.resolveTemplate(templateId)
    return this.toDetail(template)
  }

  renameTemplate(templateId: string, input: PageBuilderTemplateRenameRequest): PageBuilderTemplateRenameResponse {
    const template = this.resolveTemplate(templateId)
    const normalizedInput = normalizeRenameInput(input)
    const manifestPath = join(template.templateDir, 'template.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>
    manifest.name = normalizedInput.name
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

    return {
      template: this.toSummary({
        ...template,
        manifest: {
          ...template.manifest,
          name: normalizedInput.name,
        },
      }),
    }
  }

  deleteTemplate(templateId: string): void {
    const template = this.resolveTemplate(templateId)
    const rootRealPath = realpathSync(getUserPageBuilderTemplatesDir())
    const templateRealPath = realpathSync(template.templateDir)
    if (!isWithinRoot(rootRealPath, templateRealPath)) {
      throw new PageBuilderTemplateServiceError('forbidden', '非法模板路径')
    }

    rmSync(template.templateDir, { recursive: true, force: true })
  }

  createDownloadResponse(templateId: string): Response {
    const artifact = this.createDownloadArtifact(templateId)
    return new Response(artifact.stream, {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': `attachment; filename="${artifact.fallbackFileName}"; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
        'content-type': 'application/zip',
      },
    })
  }

  createPreviewResponse(templateId: string, requestPath: string): Response {
    const template = this.resolveTemplate(templateId)
    const previewFile = this.resolvePreviewFile(template, requestPath)

    if (previewFile.isHtml) {
      return new Response(readFileSync(previewFile.filePath, 'utf-8'), {
        headers: {
          'cache-control': 'no-store',
          'content-security-policy': TEMPLATE_PREVIEW_CSP,
          'content-type': 'text/html; charset=utf-8',
        },
      })
    }

    return createFileResponse(previewFile.filePath, {
      headers: {
        'cache-control': 'no-store',
      },
    })
  }

  private createDownloadArtifact(templateId: string): TemplateDownloadArtifact {
    const template = this.resolveTemplate(templateId)
    const manifest = createPortableTemplateManifest(template.manifest)
    const entries: TemplateDownloadEntry[] = [{
      archivePath: 'template.json',
      content: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    }]
    const workspaceRootRealPath = realpathSync(template.workspaceFilesDir)
    entries.push(...collectTemplateDownloadEntries(
      template.workspaceFilesDir,
      template.workspaceFilesDir,
      workspaceRootRealPath,
    ))

    return {
      fallbackFileName: buildTemplateDownloadFallbackFileName(template),
      fileName: buildTemplateDownloadFileName(template),
      stream: createTemplateZipStream(entries),
    }
  }

  private scanTemplates(): RegisteredTemplate[] {
    const rootDir = getUserPageBuilderTemplatesDir()
    const children = readdirSync(rootDir, { withFileTypes: true })
    const templates: RegisteredTemplate[] = []
    const seenIds = new Set<string>()

    for (const child of children) {
      if (!child.isDirectory()) {
        continue
      }

      const templateDir = join(rootDir, child.name)
      if (!lstatSync(templateDir).isDirectory()) {
        continue
      }

      const manifest = parseTemplateManifest(templateDir, child.name)
      if (!manifest) {
        continue
      }

      if (seenIds.has(manifest.id)) {
        warnInvalidTemplate(templateDir, '模板 id 重复')
        continue
      }

      seenIds.add(manifest.id)
      templates.push({
        manifest,
        templateDir,
        workspaceFilesDir: join(templateDir, 'workspace-files'),
      })
    }

    return templates
  }

  private copyTemplateWorkspaceFiles(sourceDir: string, targetDir: string): void {
    const sourceRealPath = realpathSync(sourceDir)

    for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
      const sourcePath = join(sourceDir, entry.name)
      const targetPath = join(targetDir, entry.name)
      const sourceStat = lstatSync(sourcePath)

      if (sourceStat.isSymbolicLink() || (!sourceStat.isDirectory() && !sourceStat.isFile())) {
        throw new PageBuilderTemplateServiceError('unsafe-file', '模板包含不支持的文件类型，无法创建项目')
      }

      const resolvedSourcePath = realpathSync(sourcePath)
      if (!isWithinRoot(sourceRealPath, resolvedSourcePath)) {
        throw new PageBuilderTemplateServiceError('forbidden', '非法模板路径')
      }

      if (sourceStat.isDirectory()) {
        mkdirSync(targetPath, { recursive: true })
        this.copyTemplateWorkspaceFiles(sourcePath, targetPath)
        continue
      }

      mkdirSync(dirname(targetPath), { recursive: true })
      copyFileSync(sourcePath, targetPath)
    }
  }

  private rollbackInstantiatedProject(workspaceId: string): void {
    try {
      deletePageBuilderProject(workspaceId)
    } catch (error) {
      console.warn('[PageBuilder 模板库] 回滚模板项目失败:', error)
    }
  }

  private createUniqueTemplateId(templatesRoot: string, timestamp: number, prefix = 'tpl_saved'): string {
    const timestampPart = formatTemplateTimestamp(timestamp)

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = randomUUID().replace(/-/g, '').slice(0, 8)
      const templateId = `${prefix}_${timestampPart}_${suffix}`
      if (!existsSync(join(templatesRoot, templateId))) {
        return templateId
      }
    }

    throw new PageBuilderTemplateServiceError('export-failed', '无法生成唯一模板 ID')
  }

  private normalizeZipEntries(entries: StreamZipEntry[]): NormalizedZipEntry[] {
    const normalizedEntries: NormalizedZipEntry[] = []
    const seen = new Set<string>()

    for (const entry of entries) {
      const normalizedName = normalizeZipEntryPath(entry.name)
      if (!normalizedName || isIgnoredZipEntry(normalizedName)) {
        continue
      }

      if (!entry.isDirectory && !entry.isFile) {
        throw new PageBuilderTemplateServiceError('forbidden', '压缩包包含不支持的文件类型，已拒绝导入')
      }

      if (entry.encrypted) {
        throw new PageBuilderTemplateServiceError('invalid-input', '暂不支持加密压缩包')
      }

      if (entry.isFile && seen.has(normalizedName)) {
        throw new PageBuilderTemplateServiceError('invalid-input', '压缩包包含重复文件路径，无法导入')
      }

      if (entry.isFile) {
        seen.add(normalizedName)
      }

      normalizedEntries.push({
        entry,
        name: normalizedName,
      })
    }

    return normalizedEntries
  }

  private async resolveImportedTemplateName(
    zip: StreamZipAsyncArchive,
    entries: NormalizedZipEntry[],
    siteRoot: string,
    fileName: string,
  ): Promise<string> {
    const candidates = Array.from(new Set([
      'template.json',
      siteRoot ? `${siteRoot}/template.json` : null,
    ].filter((value): value is string => Boolean(value))))

    for (const candidate of candidates) {
      const manifestEntry = entries.find((entry) => entry.name === candidate && entry.entry.isFile)
      if (!manifestEntry) {
        continue
      }

      try {
        const manifest = JSON.parse((await zip.entryData(manifestEntry.entry)).toString('utf-8')) as unknown
        if (isRecord(manifest)) {
          const name = readOptionalString(manifest.name)
          if (name) {
            return name
          }
        }
      } catch {
        // Invalid imported template metadata should not block arbitrary static zip imports.
      }
    }

    return normalizeUploadedZipBaseName(fileName)
  }

  private unpackStaticExportPackage(packagePath: string, targetDir: string): void {
    const entries = unzipSync(new Uint8Array(readFileSync(packagePath)))
    const root = resolve(targetDir)

    for (const [entryName, content] of Object.entries(entries)) {
      const normalizedName = entryName.replace(/\\/g, '/').replace(/^\/+/, '')
      if (!normalizedName || normalizedName === 'export-report.json' || normalizedName.endsWith('/')) {
        continue
      }

      if (normalizedName.split('/').includes('..')) {
        throw new PageBuilderTemplateServiceError('validation-failed', '导出产物包含非法路径')
      }

      const filePath = resolve(targetDir, normalizedName)
      if (!isWithinRoot(root, filePath)) {
        throw new PageBuilderTemplateServiceError('validation-failed', '导出产物包含非法路径')
      }

      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, content)
    }
  }

  private validateTemplateOutput(
    templateDir: string,
    workspaceFilesDir: string,
    staticExportReport: PageBuilderStaticExportReport,
    generatedAt: string,
  ): PageBuilderTemplateValidationReport {
    const issues: PageBuilderTemplateValidationIssue[] = []
    const entryPath = join(workspaceFilesDir, 'index.html')

    if (!existsSync(entryPath) || !lstatSync(entryPath).isFile()) {
      issues.push({
        code: 'entry-missing',
        message: '模板入口文件不存在',
        file: TEMPLATE_ENTRY,
      })
    }

    for (const htmlFilePath of collectFiles(workspaceFilesDir, (filePath) => /\.html?$/i.test(filePath))) {
      const html = readFileSync(htmlFilePath, 'utf-8')
      const relativeFile = `workspace-files/${safeRelativePath(workspaceFilesDir, htmlFilePath)}`

      if (mayContainCmsAuthoringMarkers(html)) {
        issues.push({
          code: 'cms-marker-present',
          message: '模板 HTML 残留 CMS 作者态或 runtime 标记',
          file: relativeFile,
        })
      }

      const { document } = parseHTML(html)
      for (const element of Array.from(document.querySelectorAll('script[src], iframe[src]'))) {
        const tagName = element.tagName.toLowerCase()
        const src = element.getAttribute('src')
        if (isRemoteRuntimeUrl(src)) {
          issues.push({
            code: 'remote-runtime-dependency',
            message: '模板包含不支持的远程运行时依赖',
            file: relativeFile,
            detail: `${tagName}[src="${src}"]`,
          })
        }
      }
    }

    if (existsSync(join(workspaceFilesDir, '.proma', 'cms-rendering-manifest.json'))) {
      issues.push({
        code: 'cms-manifest-present',
        message: '模板残留 CMS rendering manifest',
        file: 'workspace-files/.proma/cms-rendering-manifest.json',
      })
    }

    for (const failure of staticExportReport.failures ?? []) {
      issues.push({
        code: 'static-export-failure',
        message: failure.message,
        detail: failure.code,
      })
    }

    for (const dependency of staticExportReport.unsupportedRuntimeDependencies ?? []) {
      issues.push({
        code: 'remote-runtime-dependency',
        message: '模板包含不支持的远程运行时依赖',
        detail: `${dependency.tagName}[${dependency.attribute}="${dependency.url}"]`,
      })
    }

    for (const filePath of collectFiles(templateDir, (candidate) => /\.(?:html?|json|js|css|txt|md)$/i.test(candidate))) {
      const content = readFileSync(filePath, 'utf-8')
      if (containsSensitiveData(content)) {
        issues.push({
          code: 'sensitive-data-present',
          message: '模板产物包含疑似敏感鉴权信息',
          file: safeRelativePath(templateDir, filePath),
        })
      }
    }

    return createValidationReport(issues, generatedAt)
  }

  private createValidationError(issues: PageBuilderTemplateValidationIssue[]): PageBuilderTemplateServiceError {
    const firstIssue = issues[0]
    if (!firstIssue) {
      return new PageBuilderTemplateServiceError('validation-failed', '模板校验失败')
    }

    if (firstIssue.code === 'remote-runtime-dependency') {
      return new PageBuilderTemplateServiceError('remote-runtime-dependency', '模板包含不支持的远程运行时依赖')
    }

    if (firstIssue.code === 'resource-download-failed') {
      return new PageBuilderTemplateServiceError('resource-download-failed', '模板资源下载失败，无法保存')
    }

    if (firstIssue.code === 'sensitive-data-present') {
      return new PageBuilderTemplateServiceError('sensitive-data-present', '模板包含敏感鉴权信息，无法保存')
    }

    if (firstIssue.code === 'entry-missing') {
      return new PageBuilderTemplateServiceError('entry-missing', '当前项目没有可另存的页面')
    }

    return new PageBuilderTemplateServiceError('validation-failed', firstIssue.message)
  }

  private resolveTemplate(templateId: string): RegisteredTemplate {
    if (!isValidPageBuilderTemplateId(templateId)) {
      throw new PageBuilderTemplateServiceError('not-found', '模板不存在')
    }

    const template = this.scanTemplates().find((item) => item.manifest.id === templateId)
    if (!template) {
      throw new PageBuilderTemplateServiceError('not-found', '模板不存在')
    }

    return template
  }

  private resolvePreviewFile(template: RegisteredTemplate, requestPath: string): TemplatePreviewFile {
    const rootRealPath = realpathSync(template.workspaceFilesDir)
    let normalizedPath: string
    try {
      normalizedPath = decodeURIComponent(requestPath).replace(/\\/g, '/').replace(/^\/+/, '')
    } catch {
      throw new PageBuilderTemplateServiceError('forbidden', '非法路径')
    }
    const relativePath = normalizedPath || 'index.html'
    const resolvedPath = resolve(template.workspaceFilesDir, relativePath)

    if (!isWithinRoot(resolve(template.workspaceFilesDir), resolvedPath)) {
      throw new PageBuilderTemplateServiceError('forbidden', '非法路径')
    }

    if (!existsSync(resolvedPath)) {
      throw new PageBuilderTemplateServiceError('not-found', '预览文件不存在')
    }

    const stat = statSync(resolvedPath)
    if (!stat.isFile()) {
      throw new PageBuilderTemplateServiceError('not-found', '预览文件不存在')
    }

    const fileRealPath = realpathSync(resolvedPath)
    if (!isWithinRoot(rootRealPath, fileRealPath)) {
      throw new PageBuilderTemplateServiceError('forbidden', '非法路径')
    }

    return {
      filePath: fileRealPath,
      isHtml: /\.html?$/i.test(fileRealPath),
    }
  }

  private toSummary(template: RegisteredTemplate): PageBuilderTemplateSummary {
    const { manifest } = template
    return {
      id: manifest.id,
      name: manifest.name,
      ...(manifest.description ? { description: manifest.description } : {}),
      ...(manifest.tags ? { tags: manifest.tags } : {}),
      ...(manifest.category ? { category: manifest.category } : {}),
      sourceKind: manifest.sourceKind,
      createdAt: manifest.createdAt,
      previewUrl: buildPageBuilderPublicUrl(`/api/page-builder/templates/${encodeURIComponent(manifest.id)}/preview/`),
      deletable: true,
    }
  }

  private toDetail(template: RegisteredTemplate): PageBuilderTemplateDetail {
    const summary = this.toSummary(template)
    return {
      ...summary,
      entry: template.manifest.entry,
      ...(template.manifest.sourceProject ? { sourceProject: template.manifest.sourceProject } : {}),
    }
  }
}

export const pageBuilderTemplateService = new PageBuilderTemplateService()
