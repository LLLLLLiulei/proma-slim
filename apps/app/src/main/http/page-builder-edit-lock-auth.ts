import type { AgentWorkspace, PageBuilderEditLockCredentials } from '@ai-page-builder/shared'
import {
  PageBuilderEditLockConflictError,
  pageBuilderEditLockService,
} from '../lib/page-builder-edit-lock-service'
import { HttpError } from './errors'

export const PAGE_BUILDER_EDIT_LOCK_HEADER = 'x-proma-page-builder-edit-lock'
export const PAGE_BUILDER_EDIT_HOLDER_HEADER = 'x-proma-page-builder-edit-holder'

export function readPageBuilderEditLockCredentials(request: Request): PageBuilderEditLockCredentials | null {
  const lockId = request.headers.get(PAGE_BUILDER_EDIT_LOCK_HEADER)?.trim()
  const holderId = request.headers.get(PAGE_BUILDER_EDIT_HOLDER_HEADER)?.trim()

  if (!lockId || !holderId) {
    return null
  }

  return { lockId, holderId }
}

export function assertPageBuilderEditLockForWorkspace(workspace: AgentWorkspace, request: Request): void {
  if (workspace.template !== 'page-builder') {
    return
  }

  const credentials = readPageBuilderEditLockCredentials(request)
  if (!credentials) {
    throw new HttpError(409, '编辑锁已失效，请从首页重新进入编辑')
  }

  try {
    pageBuilderEditLockService.assertCanEdit(workspace.id, credentials)
  } catch (error) {
    if (error instanceof PageBuilderEditLockConflictError) {
      throw new HttpError(409, error.message)
    }
    throw error
  }
}
