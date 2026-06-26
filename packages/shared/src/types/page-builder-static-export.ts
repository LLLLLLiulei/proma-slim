export type PageBuilderStaticExportJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'

export type PageBuilderStaticExportJobPhase =
  | 'copying'
  | 'scanning'
  | 'downloading'
  | 'packaging'
  | 'completed'

export interface PageBuilderStaticExportReportSummary {
  localizedResourceCount: number
  retainedExternalLinkCount: number
  warningCount: number
  unsupportedRuntimeDependencyCount: number
  failureCount: number
  hasWarnings: boolean
}

export interface PageBuilderStaticExportLocalizedResource {
  resourceUrl: string
  outputPath: string
  kind: 'image' | 'audio' | 'video' | 'font' | 'stylesheet' | 'attachment' | 'other'
  via: 'cms' | 'remote'
}

export interface PageBuilderStaticExportJobCreateOptions {
  downloadCmsRemoteAssets?: boolean
}

export interface PageBuilderStaticExportJobCreateRequest extends PageBuilderStaticExportJobCreateOptions {}

export interface PageBuilderStaticExportRetainedExternalLink {
  resourceUrl: string
  reason: 'external-link' | 'attachment-download-failed' | 'cms-remote-asset-skipped' | 'resource-download-failed'
}

export interface PageBuilderStaticExportWarning {
  code: 'attachment-download-failed' | 'cms-remote-asset-skipped' | 'resource-download-failed'
  message: string
  resourceUrl?: string
}

export interface PageBuilderStaticExportUnsupportedRuntimeDependency {
  tagName: string
  attribute: string
  url: string
}

export interface PageBuilderStaticExportFailure {
  code: string
  message: string
  resourceUrl?: string
  component?: string
  props?: Record<string, string>
}

export interface PageBuilderStaticExportReport {
  version: 1
  workspaceId: string
  entryFile: string
  generatedAt: string
  localizedResources: PageBuilderStaticExportLocalizedResource[]
  retainedExternalLinks: PageBuilderStaticExportRetainedExternalLink[]
  warnings: PageBuilderStaticExportWarning[]
  unsupportedRuntimeDependencies: PageBuilderStaticExportUnsupportedRuntimeDependency[]
  failures: PageBuilderStaticExportFailure[]
  summary: PageBuilderStaticExportReportSummary
}

export interface PageBuilderStaticExportJob {
  jobId: string
  status: PageBuilderStaticExportJobStatus
  phase: PageBuilderStaticExportJobPhase
  createdAt: string
  updatedAt: string
  expiresAt: string
  downloadUrl: string | null
  errorMessage: string | null
  failure: PageBuilderStaticExportFailure | null
  reportSummary: PageBuilderStaticExportReportSummary | null
}
