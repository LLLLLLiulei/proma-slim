import { parseHTML } from 'linkedom'
import type { AgentWorkspace, PageBuilderBlockDeletionPayload } from '@proma/shared'
import { type WorkspacePreviewState } from './workspace-preview-service'
import {
  PageBuilderWorkspaceHtmlServiceError,
  pageBuilderWorkspaceHtmlService,
} from './page-builder-workspace-html-service'

type PageBuilderBlockDeletionErrorCode =
  | 'entry-missing'
  | 'block-not-found'
  | 'selector-not-unique'

export class PageBuilderBlockDeletionError extends Error {
  code: PageBuilderBlockDeletionErrorCode

  constructor(code: PageBuilderBlockDeletionErrorCode, message: string) {
    super(message)
    this.name = 'PageBuilderBlockDeletionError'
    this.code = code
  }
}

function resolveUniqueBlock(document: Document, selector: string): Element {
  const matches = document.querySelectorAll(selector)
  if (matches.length === 0) {
    throw new PageBuilderBlockDeletionError('block-not-found', '未找到要删除的区块')
  }

  if (matches.length > 1) {
    throw new PageBuilderBlockDeletionError('selector-not-unique', '无法唯一定位要删除的区块')
  }

  return matches[0]!
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

export function applyPageBuilderBlockDeletion(html: string, selector: string): string {
  const { document } = parseHTML(html)
  const block = resolveUniqueBlock(document, selector)
  block.remove()
  return serializeDocument(html, document)
}

export function savePageBuilderBlockDeletion(
  workspace: AgentWorkspace,
  payload: PageBuilderBlockDeletionPayload,
): WorkspacePreviewState {
  try {
    return pageBuilderWorkspaceHtmlService.mutate(workspace, {
      transform(currentHtml) {
        return applyPageBuilderBlockDeletion(currentHtml, payload.selector)
      },
    }).previewState
  } catch (error) {
    if (error instanceof PageBuilderWorkspaceHtmlServiceError && error.code === 'entry-missing') {
      throw new PageBuilderBlockDeletionError('entry-missing', '预览入口不存在')
    }

    throw error
  }
}
