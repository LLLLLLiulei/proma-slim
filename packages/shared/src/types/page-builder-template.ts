import type { AgentSessionMeta, AgentWorkspace } from './agent'

export type PageBuilderTemplateSourceKind = 'saved-project'

export type PageBuilderTemplateSourceMode = 'standalone' | 'cms-integrated'

export interface PageBuilderTemplateSourceProject {
  workspaceId?: string
  workspaceName?: string
  sourceMode?: PageBuilderTemplateSourceMode
  exportedAt?: string
  cmsProjectId?: string
  cmsSiteId?: string
  cmsExternalRecordId?: string
}

export interface PageBuilderTemplateManifestV1 {
  version: 1
  id: string
  name: string
  description?: string
  tags?: string[]
  category?: string
  sourceKind: PageBuilderTemplateSourceKind
  entry: 'workspace-files/index.html'
  createdAt: string
  sourceProject?: PageBuilderTemplateSourceProject
}

export interface PageBuilderTemplateSummary {
  id: string
  name: string
  description?: string
  tags?: string[]
  category?: string
  sourceKind: PageBuilderTemplateSourceKind
  createdAt: string
  previewUrl: string
  deletable: true
}

export interface PageBuilderTemplateDetail extends PageBuilderTemplateSummary {
  entry: 'workspace-files/index.html'
  sourceProject?: PageBuilderTemplateSourceProject
}

export interface PageBuilderTemplateListResponse {
  templates: PageBuilderTemplateSummary[]
}

export interface PageBuilderTemplateSaveRequest {
  name: string
  description?: string
  tags?: string[]
}

export interface PageBuilderTemplateSaveResponse {
  template: PageBuilderTemplateSummary
}

export interface PageBuilderTemplateRenameRequest {
  name: string
}

export interface PageBuilderTemplateRenameResponse {
  template: PageBuilderTemplateSummary
}

export interface PageBuilderTemplateImportResponse {
  template: PageBuilderTemplateSummary
}

export interface PageBuilderTemplateUseRequest {
  projectName: string
}

export interface PageBuilderTemplateUsePreviewState {
  hasPreview: boolean
  entryUrl: string | null
  revision: string | null
  hasCmsRendering: boolean
  requiresSameOrigin: boolean
}

export interface PageBuilderTemplateUseResponse {
  workspace: AgentWorkspace
  session: AgentSessionMeta
  previewState: PageBuilderTemplateUsePreviewState
}

export type PageBuilderTemplateValidationIssueCode =
  | 'entry-missing'
  | 'cms-marker-present'
  | 'cms-manifest-present'
  | 'remote-runtime-dependency'
  | 'static-export-failure'
  | 'resource-download-failed'
  | 'sensitive-data-present'
  | 'invalid-path'

export interface PageBuilderTemplateValidationIssue {
  code: PageBuilderTemplateValidationIssueCode
  message: string
  file?: string
  detail?: string
}

export interface PageBuilderTemplateValidationReport {
  version: 1
  generatedAt: string
  ok: boolean
  issues: PageBuilderTemplateValidationIssue[]
}
