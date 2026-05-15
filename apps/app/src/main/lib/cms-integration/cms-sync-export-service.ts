import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSessionMeta, AgentWorkspace, PageBuilderStaticExportJobCreateOptions } from '@ai-page-builder/shared'
import { getAgentSessionMeta } from '../agent-session-manager'
import { getWorkspaceFilesDir } from '../config-paths'
import { pageBuilderEditLockService, PageBuilderEditLockConflictError } from '../page-builder-edit-lock-service'
import {
  pageBuilderStaticExportService,
  PageBuilderStaticExportServiceError,
  type PageBuilderStaticExportArtifact,
} from '../page-builder-static-export-service'
import { getAgentWorkspace } from '../workspace-service'
import {
  cmsProjectNotFound,
  cmsSyncExportTimeout,
  cmsSyncExportUpstreamFailed,
  projectBusy,
} from './cms-integration-errors'
import type { CmsIntegratedProjectBinding } from './cms-project-binding-store'
import { getSharedCmsProjectBindingStore } from './cms-project-binding-store'

export interface CmsSyncExportInput {
  projectId: string
  downloadCmsRemoteAssets?: boolean
  timeoutMs: number
}

interface CmsSyncExportInternals {
  binding: CmsIntegratedProjectBinding
  workspace: AgentWorkspace
  session: AgentSessionMeta
}

export async function exportCmsProjectStaticPackage(input: CmsSyncExportInput): Promise<PageBuilderStaticExportArtifact> {
  const internals = resolveCmsSyncExportInternals(input.projectId)
  assertCmsSyncExportProjectAvailable(internals.workspace)

  const exportPromise = pageBuilderStaticExportService
    .exportWorkspaceStaticPackage(internals.workspace, buildStaticExportOptions(input))
    .catch((error) => {
      throw mapStaticExportFailure(error)
    })

  if (input.timeoutMs <= 0) {
    return await exportPromise
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      exportPromise,
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(cmsSyncExportTimeout())
        }, input.timeoutMs)
      }),
    ])
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'export_timeout') {
      exportPromise.catch((backgroundError) => {
        console.warn('[CMS Sync Export] 后台同步导出在超时响应后结束:', backgroundError)
      })
    }
    throw error
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

function resolveCmsSyncExportInternals(projectId: string): CmsSyncExportInternals {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) {
    throw cmsProjectNotFound()
  }

  const binding = getSharedCmsProjectBindingStore().findByProjectId(normalizedProjectId)
  if (!binding) {
    throw cmsProjectNotFound()
  }

  const workspace = getAgentWorkspace(binding.workspaceId)
  if (!workspace || workspace.template !== 'page-builder') {
    throw cmsProjectNotFound()
  }

  const session = getAgentSessionMeta(binding.primarySessionId)
  if (!session || session.workspaceId !== workspace.id) {
    throw cmsProjectNotFound()
  }

  return { binding, workspace, session }
}

function assertCmsSyncExportProjectAvailable(workspace: AgentWorkspace): void {
  try {
    pageBuilderEditLockService.assertProjectAvailable(workspace.id)
  } catch (error) {
    if (error instanceof PageBuilderEditLockConflictError) {
      throw projectBusy()
    }
    throw error
  }

  if (!existsSync(join(getWorkspaceFilesDir(workspace.slug), 'index.html'))) {
    throw projectBusy('当前项目没有可导出的页面产物，请先完成预览构建')
  }
}

function buildStaticExportOptions(input: CmsSyncExportInput): PageBuilderStaticExportJobCreateOptions {
  return input.downloadCmsRemoteAssets === undefined
    ? {}
    : { downloadCmsRemoteAssets: input.downloadCmsRemoteAssets }
}

function mapStaticExportFailure(error: unknown): Error {
  if (error instanceof PageBuilderStaticExportServiceError) {
    if (error.code === 'entry-missing' || error.code === 'export-active') {
      return projectBusy()
    }
    if (error.code === 'export-failed') {
      return cmsSyncExportUpstreamFailed()
    }
  }

  return cmsSyncExportUpstreamFailed()
}
