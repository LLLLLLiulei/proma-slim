import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { parseHTML } from 'linkedom'
import { zipSync } from 'fflate'
import type {
  AgentWorkspace,
  PageBuilderStaticExportFailure,
  PageBuilderStaticExportJob,
  PageBuilderStaticExportJobCreateOptions,
  PageBuilderStaticExportJobPhase,
  PageBuilderStaticExportLocalizedResource,
  PageBuilderStaticExportReport,
  PageBuilderStaticExportReportSummary,
  PageBuilderStaticExportRetainedExternalLink,
  PageBuilderStaticExportUnsupportedRuntimeDependency,
  PageBuilderStaticExportWarning,
} from '@ai-page-builder/shared'
import {
  CmsIslandRenderPipelineError,
  createServerCmsClient,
  renderCmsIslands,
  type ServerCmsClientAdapter,
} from '@ai-page-builder/page-builder-cms-rendering'
import { CmsGateway } from './cms-gateway'
import { getWorkspaceFilesDir } from './config-paths'
import {
  isAbsoluteHttpUrl,
  isAllowedCmsAssetUrl,
  isIgnorableUrl,
  looksLikeDownloadableAsset,
  resolveCmsAssetUrl,
} from './page-builder-asset-reference-utils'
import { resolvePageBuilderCmsConfig } from './page-builder-cms-config'
import {
  cleanupExpiredPageBuilderStaticExportDirs,
  getPageBuilderStaticExportPackagePath,
  getPageBuilderStaticExportReportPath,
  getPageBuilderStaticExportStagingDir,
  getPageBuilderStaticExportTtlMs,
} from './page-builder-static-export-paths'

type CmsAssetGateway = Pick<CmsGateway, 'fetchAsset'>
type CmsQueryAdapter = Pick<CmsGateway, 'listCatalogs' | 'listContents'>

class RemoteFetchError extends Error {
  constructor(
    readonly code: 'request' | 'invalid-target',
    message: string,
  ) {
    super(message)
    this.name = 'RemoteFetchError'
  }
}

export class PageBuilderStaticExportServiceError extends Error {
  constructor(
    readonly code: 'entry-missing' | 'job-missing' | 'job-not-ready',
    message: string,
  ) {
    super(message)
    this.name = 'PageBuilderStaticExportServiceError'
  }
}

interface PageBuilderStaticExportServiceOptions {
  fetchFn?: typeof fetch
  cmsGatewayFactory?: () => CmsAssetGateway | null
  cmsQueryAdapterFactory?: () => CmsQueryAdapter | null
  now?: () => number
  randomUUID?: () => string
}

interface StoredJob {
  snapshot: PageBuilderStaticExportJob
  options: Required<PageBuilderStaticExportJobCreateOptions>
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  downloadFileName: string
  downloadFileNameFallback: string
  packagePath: string
  reportPath: string
  promise: Promise<void> | null
}

interface ExportReportCollector {
  localizedResources: PageBuilderStaticExportLocalizedResource[]
  retainedExternalLinks: PageBuilderStaticExportRetainedExternalLink[]
  warnings: PageBuilderStaticExportWarning[]
  unsupportedRuntimeDependencies: PageBuilderStaticExportUnsupportedRuntimeDependency[]
  failures: PageBuilderStaticExportFailure[]
}

interface ExportContext {
  workspace: AgentWorkspace
  workspaceFilesDir: string
  stagingDir: string
  exportedAssetsDir: string
  collector: ExportReportCollector
  localizedByUrl: Map<string, string>
  processedCssFiles: Set<string>
  fetchFn: typeof fetch
  cmsGateway: CmsAssetGateway | null
  cmsBaseUrl: string | null
  downloadCmsRemoteAssets: boolean
  cmsRuntimeClient: ReturnType<typeof createServerCmsClient>
}

type ResolvedRenderableReference =
  | {
    type: 'local'
    absolutePath: string
    outputReference: string
  }
  | {
    type: 'remote'
    url: string
  }
  | {
    type: 'external'
  }

export class PageBuilderStaticExportService {
  private readonly jobsById = new Map<string, StoredJob>()
  private readonly activeJobsByWorkspaceId = new Map<string, string>()
  private readonly fetchFn: typeof fetch
  private readonly cmsGatewayFactory?: () => CmsAssetGateway | null
  private readonly cmsQueryAdapterFactory?: () => CmsQueryAdapter | null
  private readonly now: () => number
  private readonly randomUUID: () => string

  constructor(options: PageBuilderStaticExportServiceOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch
    this.cmsGatewayFactory = options.cmsGatewayFactory
    this.cmsQueryAdapterFactory = options.cmsQueryAdapterFactory
    this.now = options.now ?? Date.now
    this.randomUUID = options.randomUUID ?? nodeRandomUUID
  }

  createJob(
    workspace: AgentWorkspace,
    options: PageBuilderStaticExportJobCreateOptions = {},
  ): PageBuilderStaticExportJob {
    this.cleanupExpiredJobs()
    const normalizedOptions = normalizePageBuilderStaticExportJobCreateOptions(options)

    const activeJobId = this.activeJobsByWorkspaceId.get(workspace.id)
    if (activeJobId) {
      const activeJob = this.jobsById.get(activeJobId)
      if (activeJob) {
        return activeJob.snapshot
      }
    }

    const entryPath = join(getWorkspaceFilesDir(workspace.slug), 'index.html')
    if (!existsSync(entryPath)) {
      throw new PageBuilderStaticExportServiceError('entry-missing', '当前项目没有可导出的页面产物')
    }

    const jobId = this.randomUUID()
    const snapshot = this.createSnapshot(jobId, 'running', 'copying')
    const exportTimestamp = this.now()
    const storedJob: StoredJob = {
      snapshot,
      options: normalizedOptions,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      downloadFileName: buildPageBuilderStaticExportDownloadFileName(workspace.name, exportTimestamp),
      downloadFileNameFallback: buildExportDownloadFallbackFileName(workspace.slug, exportTimestamp),
      packagePath: getPageBuilderStaticExportPackagePath(jobId),
      reportPath: getPageBuilderStaticExportReportPath(jobId),
      promise: null,
    }

    this.jobsById.set(jobId, storedJob)
    this.activeJobsByWorkspaceId.set(workspace.id, jobId)
    storedJob.promise = this.runJob(storedJob, workspace)

    return storedJob.snapshot
  }

  getJob(workspaceId: string, jobId: string): PageBuilderStaticExportJob | null {
    this.cleanupExpiredJobs()

    const job = this.jobsById.get(jobId)
    if (!job || job.workspaceId !== workspaceId) {
      return null
    }

    return job.snapshot
  }

  resolveDownload(workspaceId: string, jobId: string): {
    fileName: string
    fallbackFileName: string
    filePath: string
  } {
    const job = this.jobsById.get(jobId)
    if (!job || job.workspaceId !== workspaceId) {
      throw new PageBuilderStaticExportServiceError('job-missing', '导出任务不存在')
    }

    if (job.snapshot.status !== 'completed' || !existsSync(job.packagePath)) {
      throw new PageBuilderStaticExportServiceError('job-not-ready', '导出任务尚未完成')
    }

    return {
      fileName: job.downloadFileName,
      fallbackFileName: job.downloadFileNameFallback,
      filePath: job.packagePath,
    }
  }

  private createSnapshot(
    jobId: string,
    status: PageBuilderStaticExportJob['status'],
    phase: PageBuilderStaticExportJobPhase,
  ): PageBuilderStaticExportJob {
    const now = this.now()
    return {
      jobId,
      status,
      phase,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + getPageBuilderStaticExportTtlMs()).toISOString(),
      downloadUrl: null,
      errorMessage: null,
      failure: null,
      reportSummary: null,
    }
  }

  private updateSnapshot(
    job: StoredJob,
    updates: Partial<Omit<PageBuilderStaticExportJob, 'jobId' | 'createdAt'>>,
  ): void {
    job.snapshot = {
      ...job.snapshot,
      ...updates,
      updatedAt: new Date(this.now()).toISOString(),
    }
    this.jobsById.set(job.snapshot.jobId, job)
  }

  private async runJob(job: StoredJob, workspace: AgentWorkspace): Promise<void> {
    const jobId = job.snapshot.jobId
    const jobDir = dirname(job.packagePath)
    const stagingDir = getPageBuilderStaticExportStagingDir(jobId)
    const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
    const exportedAssetsDir = join(stagingDir, 'assets', 'exported')
    const collector: ExportReportCollector = {
      localizedResources: [],
      retainedExternalLinks: [],
      warnings: [],
      unsupportedRuntimeDependencies: [],
      failures: [],
    }

    try {
      rmSync(jobDir, { recursive: true, force: true })
      mkdirSync(exportedAssetsDir, { recursive: true })

      this.updateSnapshot(job, { status: 'running', phase: 'copying' })
      cpSync(workspaceFilesDir, stagingDir, { recursive: true })

      const cmsGateway = this.resolveCmsGateway()
      const cmsQueryAdapter = this.resolveCmsQueryAdapter()
      const cmsBaseUrl = resolvePageBuilderCmsConfig()?.baseUrl ?? null
      const context: ExportContext = {
        workspace,
        workspaceFilesDir,
        stagingDir,
        exportedAssetsDir,
        collector,
      localizedByUrl: new Map(),
      processedCssFiles: new Set(),
      fetchFn: this.fetchFn,
      cmsGateway,
      cmsBaseUrl,
      downloadCmsRemoteAssets: job.options.downloadCmsRemoteAssets,
      cmsRuntimeClient: createServerCmsClient({
        adapter: createStaticExportCmsAdapter(cmsQueryAdapter),
      }),
      }

      this.updateSnapshot(job, { phase: 'scanning' })
      for (const htmlFilePath of collectFiles(stagingDir, (filePath) => /\.html?$/i.test(filePath))) {
        await this.processHtmlFile(htmlFilePath, context)
      }

      const report = this.createReport(context)
      writeReportArtifacts(report, stagingDir, job.reportPath)

      this.updateSnapshot(job, { phase: 'packaging' })
      writeFileSync(job.packagePath, buildZipArchive(stagingDir))

      this.updateSnapshot(job, {
        status: 'completed',
        phase: 'completed',
        downloadUrl: buildDownloadUrl(workspace.id, jobId),
        reportSummary: report.summary,
        errorMessage: null,
        failure: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (collector.failures.length === 0) {
        collector.failures.push({
          code: 'export-failed',
          message,
        })
      }

      const report = this.createReport({
        workspace,
        workspaceFilesDir,
        stagingDir,
        exportedAssetsDir,
        collector,
        localizedByUrl: new Map(),
        processedCssFiles: new Set(),
        fetchFn: this.fetchFn,
        cmsGateway: null,
        cmsBaseUrl: null,
        downloadCmsRemoteAssets: job.options.downloadCmsRemoteAssets,
        cmsRuntimeClient: createServerCmsClient({
          adapter: createStaticExportCmsAdapter(null),
        }),
      })
      mkdirSync(dirname(job.reportPath), { recursive: true })
      writeFileSync(job.reportPath, JSON.stringify(report, null, 2), 'utf-8')

      this.updateSnapshot(job, {
        status: 'failed',
        errorMessage: message,
        failure: report.failures[0] ?? null,
        reportSummary: report.summary,
      })
    } finally {
      this.activeJobsByWorkspaceId.delete(workspace.id)
    }
  }

  private resolveCmsGateway(): CmsAssetGateway | null {
    if (this.cmsGatewayFactory) {
      return this.cmsGatewayFactory()
    }

    const cmsConfig = resolvePageBuilderCmsConfig()
    return cmsConfig ? new CmsGateway({ config: cmsConfig, fetchFn: this.fetchFn }) : null
  }

  private resolveCmsQueryAdapter(): CmsQueryAdapter | null {
    if (this.cmsQueryAdapterFactory) {
      return this.cmsQueryAdapterFactory()
    }

    const cmsConfig = resolvePageBuilderCmsConfig()
    return cmsConfig ? new CmsGateway({ config: cmsConfig, fetchFn: this.fetchFn }) : null
  }

  private createReport(context: ExportContext): PageBuilderStaticExportReport {
    return {
      version: 1,
      workspaceId: context.workspace.id,
      entryFile: 'index.html',
      generatedAt: new Date(this.now()).toISOString(),
      localizedResources: dedupeBySerialized(context.collector.localizedResources),
      retainedExternalLinks: dedupeBySerialized(context.collector.retainedExternalLinks),
      warnings: dedupeBySerialized(context.collector.warnings),
      unsupportedRuntimeDependencies: dedupeBySerialized(context.collector.unsupportedRuntimeDependencies),
      failures: dedupeBySerialized(context.collector.failures),
      summary: createReportSummary(context.collector),
    }
  }

  private async processHtmlFile(filePath: string, context: ExportContext): Promise<void> {
    const sourceHtml = readFileSync(filePath, 'utf-8')
    const renderedHtml = await this.renderCmsIslandsForExport(sourceHtml, context)
    const { document } = parseHTML(renderedHtml)
    let changed = renderedHtml !== sourceHtml

    for (const element of Array.from(document.querySelectorAll('*'))) {
      const tagName = element.tagName.toLowerCase()

      if (tagName === 'script' || tagName === 'iframe') {
        const src = element.getAttribute('src')
        const resolved = resolveRenderableReference(src ?? '', filePath, context, null)
        if (resolved && resolved.type === 'remote') {
          context.collector.unsupportedRuntimeDependencies.push({
            tagName,
            attribute: 'src',
            url: resolved.url,
          })
        }
      }

      if (tagName === 'link' && element.getAttribute('rel')?.toLowerCase().includes('stylesheet')) {
        const href = element.getAttribute('href')
        if (href) {
          const nextHref = await this.processStylesheetReference(href, filePath, context)
          if (nextHref !== href) {
            element.setAttribute('href', nextHref)
            changed = true
          }
        }
      }

      if (['img', 'audio', 'video', 'source'].includes(tagName)) {
        const currentSrc = element.getAttribute('src')
        if (currentSrc) {
          const nextSrc = await this.processRenderableReference(currentSrc, filePath, context, inferResourceKind(tagName))
          if (nextSrc !== currentSrc) {
            element.setAttribute('src', nextSrc)
            changed = true
          }
        }
      }

      if (tagName === 'video') {
        const poster = element.getAttribute('poster')
        if (poster) {
          const nextPoster = await this.processRenderableReference(poster, filePath, context, 'image')
          if (nextPoster !== poster) {
            element.setAttribute('poster', nextPoster)
            changed = true
          }
        }
      }

      if (tagName === 'img' || tagName === 'source') {
        const srcset = element.getAttribute('srcset')
        if (srcset) {
          const nextSrcset = await this.processSrcset(srcset, filePath, context)
          if (nextSrcset !== srcset) {
            element.setAttribute('srcset', nextSrcset)
            changed = true
          }
        }
      }

      if (tagName === 'a') {
        const href = element.getAttribute('href')
        if (href) {
          const nextHref = await this.processAnchorReference(href, filePath, context)
          if (nextHref !== href) {
            element.setAttribute('href', nextHref)
            changed = true
          }
        }
      }

      const inlineStyle = element.getAttribute('style')
      if (inlineStyle) {
        const nextStyle = await this.processInlineCss(inlineStyle, filePath, context)
        if (nextStyle !== inlineStyle) {
          element.setAttribute('style', nextStyle)
          changed = true
        }
      }
    }

    for (const styleElement of Array.from(document.querySelectorAll('style'))) {
      const currentCss = styleElement.textContent
      if (!currentCss) {
        continue
      }

      const nextCss = await this.processInlineCss(currentCss, filePath, context)
      if (nextCss !== currentCss) {
        styleElement.textContent = nextCss
        changed = true
      }
    }

    if (changed) {
      writeFileSync(filePath, serializeDocument(sourceHtml, document), 'utf-8')
    }
  }

  private async renderCmsIslandsForExport(html: string, context: ExportContext): Promise<string> {
    try {
      return await renderCmsIslands({
        html,
        cmsClient: context.cmsRuntimeClient,
      })
    } catch (error) {
      if (error instanceof CmsIslandRenderPipelineError) {
        context.collector.failures.push(...error.failures.map(mapCmsIslandFailure))
        throw new Error(error.failures[0]?.message ?? error.message)
      }

      throw error
    }
  }

  private async processStylesheetReference(
    rawHref: string,
    currentFilePath: string,
    context: ExportContext,
  ): Promise<string> {
    const resolved = resolveRenderableReference(rawHref, currentFilePath, context, null)
    if (!resolved) {
      return rawHref
    }

    if (resolved.type === 'local') {
      await this.processCssFile(resolved.absolutePath, context, null)
      return resolved.outputReference
    }

    if (resolved.type === 'remote') {
      if (this.shouldSkipCmsRemoteAsset(resolved.url, context)) {
        this.recordSkippedCmsRemoteAsset(resolved.url, context)
        return resolved.url
      }

      const localizedPath = await this.localizeRemoteResource(resolved.url, context, 'stylesheet')
      await this.processCssFile(localizedPath, context, resolved.url)
      return toRelativeReference(currentFilePath, localizedPath)
    }

    return rawHref
  }

  private async processRenderableReference(
    rawValue: string,
    currentFilePath: string,
    context: ExportContext,
    kind: PageBuilderStaticExportLocalizedResource['kind'],
  ): Promise<string> {
    const resolved = resolveRenderableReference(rawValue, currentFilePath, context, null)
    if (!resolved) {
      return rawValue
    }

    if (resolved.type === 'local') {
      return resolved.outputReference
    }

    if (resolved.type === 'remote') {
      if (this.shouldSkipCmsRemoteAsset(resolved.url, context)) {
        this.recordSkippedCmsRemoteAsset(resolved.url, context)
        return resolved.url
      }

      const localizedPath = await this.localizeRemoteResource(resolved.url, context, kind)
      return toRelativeReference(currentFilePath, localizedPath)
    }

    return rawValue
  }

  private async processAnchorReference(
    rawHref: string,
    currentFilePath: string,
    context: ExportContext,
  ): Promise<string> {
    const resolved = resolveRenderableReference(rawHref, currentFilePath, context, null)
    if (!resolved) {
      return rawHref
    }

    if (resolved.type === 'local') {
      return resolved.outputReference
    }

    if (resolved.type !== 'remote') {
      return rawHref
    }

    if (!looksLikeDownloadableAsset(resolved.url)) {
      context.collector.retainedExternalLinks.push({
        resourceUrl: resolved.url,
        reason: 'external-link',
      })
      return rawHref
    }

    if (this.shouldSkipCmsRemoteAsset(resolved.url, context)) {
      this.recordSkippedCmsRemoteAsset(resolved.url, context)
      return resolved.url
    }

    try {
      const localizedPath = await this.localizeRemoteResource(resolved.url, context, 'attachment')
      return toRelativeReference(currentFilePath, localizedPath)
    } catch {
      context.collector.warnings.push({
        code: 'attachment-download-failed',
        message: `附件离线化失败，已保留原始链接: ${resolved.url}`,
        resourceUrl: resolved.url,
      })
      context.collector.retainedExternalLinks.push({
        resourceUrl: resolved.url,
        reason: 'attachment-download-failed',
      })
      return rawHref
    }
  }

  private async processSrcset(
    srcset: string,
    currentFilePath: string,
    context: ExportContext,
  ): Promise<string> {
    const parts = srcset.split(',')
    const rewritten: string[] = []

    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) {
        rewritten.push(trimmed)
        continue
      }

      const [url = '', ...descriptors] = trimmed.split(/\s+/)
      const nextUrl = await this.processRenderableReference(url, currentFilePath, context, 'image')
      rewritten.push([nextUrl, ...descriptors].filter(Boolean).join(' '))
    }

    return rewritten.join(', ')
  }

  private async processInlineCss(
    cssText: string,
    currentFilePath: string,
    context: ExportContext,
    remoteBaseUrl: string | null = null,
  ): Promise<string> {
    const matches = Array.from(cssText.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi))
    if (matches.length === 0) {
      return cssText
    }

    let lastIndex = 0
    let nextCss = ''

    for (const match of matches) {
      const fullMatch = match[0]
      const quote = match[1] ?? ''
      const rawUrl = match[2] ?? ''
      const index = match.index ?? 0
      nextCss += cssText.slice(lastIndex, index)

      const resolved = resolveRenderableReference(rawUrl, currentFilePath, context, remoteBaseUrl)
      if (!resolved) {
        nextCss += fullMatch
        lastIndex = index + fullMatch.length
        continue
      }

      if (resolved.type === 'local') {
        nextCss += `url(${quote || '"'}${resolved.outputReference}${quote || '"'})`
        lastIndex = index + fullMatch.length
        continue
      }

      if (resolved.type === 'remote') {
        if (this.shouldSkipCmsRemoteAsset(resolved.url, context)) {
          this.recordSkippedCmsRemoteAsset(resolved.url, context)
          nextCss += `url(${quote || '"'}${resolved.url}${quote || '"'})`
          lastIndex = index + fullMatch.length
          continue
        }

        const localizedPath = await this.localizeRemoteResource(resolved.url, context, inferResourceKindFromUrl(resolved.url))
        nextCss += `url(${quote || '"'}${toRelativeReference(currentFilePath, localizedPath)}${quote || '"'})`
        lastIndex = index + fullMatch.length
        continue
      }

      nextCss += fullMatch
      lastIndex = index + fullMatch.length
    }

    nextCss += cssText.slice(lastIndex)
    return nextCss
  }

  private async processCssFile(
    filePath: string,
    context: ExportContext,
    remoteBaseUrl: string | null,
  ): Promise<void> {
    if (context.processedCssFiles.has(filePath)) {
      return
    }
    context.processedCssFiles.add(filePath)

    const currentCss = readFileSync(filePath, 'utf-8')
    const nextCss = await this.processInlineCss(currentCss, filePath, context, remoteBaseUrl)
    if (nextCss !== currentCss) {
      writeFileSync(filePath, nextCss, 'utf-8')
    }
  }

  private async localizeRemoteResource(
    resourceUrl: string,
    context: ExportContext,
    kind: PageBuilderStaticExportLocalizedResource['kind'],
  ): Promise<string> {
    const cached = context.localizedByUrl.get(resourceUrl)
    if (cached) {
      return cached
    }

    const response = await this.fetchRemoteResource(resourceUrl, context)
    if (!response.ok) {
      throw new Error(`资源下载失败 (${response.status}): ${resourceUrl}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    const bytes = new Uint8Array(await response.arrayBuffer())

    const outputPath = join(
      context.exportedAssetsDir,
      `${createHash('sha1').update(resourceUrl).digest('hex').slice(0, 16)}${inferOutputExtension(resourceUrl, contentType, kind)}`,
    )
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, bytes)

    context.localizedByUrl.set(resourceUrl, outputPath)
    context.collector.localizedResources.push({
      resourceUrl,
      outputPath: relative(context.stagingDir, outputPath).replace(/\\/g, '/'),
      kind,
      via: isCmsResourceUrl(resourceUrl, context.cmsBaseUrl) ? 'cms' : 'remote',
    })

    return outputPath
  }

  private async fetchRemoteResource(resourceUrl: string, context: ExportContext): Promise<Response> {
    if (context.cmsGateway && isCmsResourceUrl(resourceUrl, context.cmsBaseUrl)) {
      this.updateSnapshotForPhase('downloading')
      return await context.cmsGateway.fetchAsset(resourceUrl)
    }

    this.updateSnapshotForPhase('downloading')
    return await fetchWithoutLimits(context.fetchFn, resourceUrl)
  }

  private shouldSkipCmsRemoteAsset(resourceUrl: string, context: ExportContext): boolean {
    return !context.downloadCmsRemoteAssets && isCmsResourceUrl(resourceUrl, context.cmsBaseUrl)
  }

  private recordSkippedCmsRemoteAsset(resourceUrl: string, context: ExportContext): void {
    context.collector.retainedExternalLinks.push({
      resourceUrl,
      reason: 'cms-remote-asset-skipped',
    })
    context.collector.warnings.push({
      code: 'cms-remote-asset-skipped',
      message: `已跳过 CMS 远程资源下载，保留源站地址: ${resourceUrl}`,
      resourceUrl,
    })
  }

  private updateSnapshotForPhase(phase: PageBuilderStaticExportJobPhase): void {
    for (const activeJobId of this.activeJobsByWorkspaceId.values()) {
      const job = this.jobsById.get(activeJobId)
      if (!job || job.snapshot.status !== 'running') {
        continue
      }

      if (job.snapshot.phase !== phase) {
        this.updateSnapshot(job, { phase })
      }
    }
  }

  private cleanupExpiredJobs(): void {
    const now = this.now()
    for (const [jobId, job] of this.jobsById.entries()) {
      if (Date.parse(job.snapshot.expiresAt) <= now && job.snapshot.status !== 'running') {
        this.jobsById.delete(jobId)
      }
    }

    cleanupExpiredPageBuilderStaticExportDirs(this.jobsById.keys(), now)
  }
}

export function buildPageBuilderStaticExportDownloadFileName(workspaceName: string, exportedAt: number): string {
  return `${sanitizeExportFileNameSegment(workspaceName)}-${formatExportTimestamp(exportedAt)}.zip`
}

function buildExportDownloadFallbackFileName(workspaceSlug: string, exportedAt: number): string {
  const safeSlug = workspaceSlug.trim() || 'project'
  return `${safeSlug}-${formatExportTimestamp(exportedAt)}.zip`
}

function sanitizeExportFileNameSegment(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')

  return sanitized || 'project'
}

function formatExportTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

export const pageBuilderStaticExportService = new PageBuilderStaticExportService()

function collectFiles(dir: string, matcher: (filePath: string) => boolean): string[] {
  const results: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, matcher))
      continue
    }

    if (entry.isFile() && matcher(fullPath)) {
      results.push(fullPath)
    }
  }

  return results
}

function serializeDocument(sourceHtml: string, document: Document): string {
  const serialized = document.toString()
  if (/^\s*<!doctype/i.test(serialized)) {
    return serialized
  }

  const doctypeMatch = sourceHtml.match(/^\s*<!doctype[^>]*>/i)
  if (!doctypeMatch) {
    return serialized
  }

  return `${doctypeMatch[0]}${serialized}`
}

function createStaticExportCmsAdapter(
  queryAdapter: CmsQueryAdapter | null,
): ServerCmsClientAdapter {
  return {
    async listCatalogs(query) {
      if (!queryAdapter) {
        throw new Error('CMS query adapter is unavailable for catalog export rendering')
      }

      return queryAdapter.listCatalogs(query)
    },
    async listContents(query) {
      if (!queryAdapter) {
        throw new Error('CMS query adapter is unavailable for content export rendering')
      }

      return queryAdapter.listContents(query)
    },
  }
}

function mapCmsIslandFailure(
  failure: CmsIslandRenderPipelineError['failures'][number],
): PageBuilderStaticExportFailure {
  return {
    code: failure.stage === 'prefetch' ? 'cms-island-prefetch-failed' : 'cms-island-render-failed',
    message: failure.message,
    component: failure.component,
    props: Object.fromEntries(
      Object.entries(failure.props).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(',') : value,
      ]),
    ),
  }
}

function resolveRenderableReference(
  rawValue: string,
  currentFilePath: string,
  context: ExportContext,
  remoteBaseUrl: string | null,
): ResolvedRenderableReference | null {
  const trimmed = rawValue.trim()
  if (!trimmed || isIgnorableUrl(trimmed)) {
    return null
  }

  if (remoteBaseUrl) {
    try {
      return {
        type: 'remote',
        url: new URL(trimmed, remoteBaseUrl).toString(),
      }
    } catch {
      return {
        type: 'external',
      }
    }
  }

  if (context.cmsBaseUrl) {
    const cmsUrl = resolveCmsAssetUrl(context.cmsBaseUrl, trimmed)
    if (cmsUrl && isAllowedCmsAssetUrl(context.cmsBaseUrl, cmsUrl)) {
      return {
        type: 'remote',
        url: cmsUrl,
      }
    }
  }

  if (isAbsoluteHttpUrl(trimmed)) {
    return {
      type: 'remote',
      url: trimmed,
    }
  }

  const [pathPart, suffix] = splitPathAndSuffix(trimmed)
  if (trimmed.startsWith('/')) {
    const absolutePath = resolve(context.stagingDir, `.${pathPart}`)
    if (existsSync(absolutePath)) {
      return {
        type: 'local',
        absolutePath,
        outputReference: `${toRelativeReference(currentFilePath, absolutePath)}${suffix}`,
      }
    }

    return {
      type: 'external',
    }
  }

  const absolutePath = resolve(dirname(currentFilePath), pathPart)
  if (existsSync(absolutePath)) {
    return {
      type: 'local',
      absolutePath,
      outputReference: `${pathPart.replace(/\\/g, '/')}${suffix}`,
    }
  }

  return {
    type: 'external',
  }
}

function splitPathAndSuffix(value: string): [string, string] {
  const match = value.match(/^([^?#]*)(.*)$/)
  if (!match) {
    return [value, '']
  }

  return [match[1] || '', match[2] || '']
}

function inferResourceKind(tagName: string): PageBuilderStaticExportLocalizedResource['kind'] {
  if (tagName === 'audio') return 'audio'
  if (tagName === 'video' || tagName === 'source') return 'video'
  return 'image'
}

function inferResourceKindFromUrl(url: string): PageBuilderStaticExportLocalizedResource['kind'] {
  const lower = url.toLowerCase()
  if (/\.(woff2?|ttf|otf)(?:[?#].*)?$/.test(lower)) return 'font'
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(?:[?#].*)?$/.test(lower)) return 'audio'
  if (/\.(mp4|webm|ogg|mov)(?:[?#].*)?$/.test(lower)) return 'video'
  if (/\.css(?:[?#].*)?$/.test(lower)) return 'stylesheet'
  if (looksLikeDownloadableAsset(lower) && /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv)(?:[?#].*)?$/.test(lower)) return 'attachment'
  return 'image'
}

function inferOutputExtension(
  resourceUrl: string,
  contentType: string,
  kind: PageBuilderStaticExportLocalizedResource['kind'],
): string {
  const urlExtension = extname(new URL(resourceUrl).pathname)
  if (urlExtension) {
    return urlExtension
  }

  const normalized = contentType.toLowerCase()
  if (normalized.includes('text/css')) return '.css'
  if (normalized.includes('image/png')) return '.png'
  if (normalized.includes('image/jpeg')) return '.jpg'
  if (normalized.includes('image/svg')) return '.svg'
  if (normalized.includes('font/woff2')) return '.woff2'
  if (normalized.includes('font/woff')) return '.woff'
  if (normalized.includes('audio/')) return '.mp3'
  if (normalized.includes('video/')) return '.mp4'
  if (kind === 'stylesheet') return '.css'
  if (kind === 'font') return '.woff2'
  if (kind === 'attachment') return '.bin'
  return '.bin'
}

function toRelativeReference(fromFilePath: string, targetPath: string): string {
  const result = relative(dirname(fromFilePath), targetPath).replace(/\\/g, '/')
  if (!result.startsWith('.') && !result.startsWith('/')) {
    return `./${result}`
  }

  return result
}

function createReportSummary(collector: ExportReportCollector): PageBuilderStaticExportReportSummary {
  return {
    localizedResourceCount: dedupeBySerialized(collector.localizedResources).length,
    retainedExternalLinkCount: dedupeBySerialized(collector.retainedExternalLinks).length,
    warningCount: dedupeBySerialized(collector.warnings).length,
    unsupportedRuntimeDependencyCount: dedupeBySerialized(collector.unsupportedRuntimeDependencies).length,
    failureCount: dedupeBySerialized(collector.failures).length,
    hasWarnings: collector.warnings.length > 0 || collector.unsupportedRuntimeDependencies.length > 0,
  }
}

function dedupeBySerialized<T>(items: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []

  for (const item of items) {
    const key = JSON.stringify(item)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(item)
  }

  return result
}

function writeReportArtifacts(report: PageBuilderStaticExportReport, stagingDir: string, reportPath: string): void {
  const serialized = JSON.stringify(report, null, 2)
  writeFileSync(join(stagingDir, 'export-report.json'), serialized, 'utf-8')
  writeFileSync(reportPath, serialized, 'utf-8')
}

function buildZipArchive(stagingDir: string): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  for (const filePath of collectFiles(stagingDir, () => true)) {
    const relativePath = relative(stagingDir, filePath).replace(/\\/g, '/')
    files[relativePath] = new Uint8Array(readFileSync(filePath))
  }

  return zipSync(files, { level: 6 })
}

function buildDownloadUrl(workspaceId: string, jobId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/page-builder/export-static-jobs/${jobId}/download`
}

function normalizePageBuilderStaticExportJobCreateOptions(
  options: PageBuilderStaticExportJobCreateOptions,
): Required<PageBuilderStaticExportJobCreateOptions> {
  return {
    downloadCmsRemoteAssets: options.downloadCmsRemoteAssets ?? true,
  }
}

function isCmsResourceUrl(resourceUrl: string, cmsBaseUrl: string | null): boolean {
  if (!cmsBaseUrl) {
    return false
  }

  const resolvedCmsUrl = resolveCmsAssetUrl(cmsBaseUrl, resourceUrl)
  return Boolean(resolvedCmsUrl && isAllowedCmsAssetUrl(cmsBaseUrl, resolvedCmsUrl))
}

async function fetchWithoutLimits(fetchFn: typeof fetch, resourceUrl: string): Promise<Response> {
  assertSafeRemoteTarget(resourceUrl)

  try {
    return await fetchFn(resourceUrl, {
      method: 'GET',
    })
  } catch (error) {
    throw normalizeRemoteFetchError(error, resourceUrl)
  }
}

function normalizeRemoteFetchError(error: unknown, resourceUrl: string): RemoteFetchError {
  if (error instanceof RemoteFetchError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  return new RemoteFetchError('request', `远程资源下载失败: ${resourceUrl}；原因: ${message}`)
}

function assertSafeRemoteTarget(resourceUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(resourceUrl)
  } catch {
    throw new RemoteFetchError('invalid-target', `资源地址不合法: ${resourceUrl}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new RemoteFetchError('invalid-target', `仅支持 http/https 资源: ${resourceUrl}`)
  }
}
