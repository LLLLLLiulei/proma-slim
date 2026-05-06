import { parseHTML } from 'linkedom'
import type { AgentWorkspace, PageBuilderInlineTextSavePayload, PageBuilderInlineTextTargetDescriptor } from '@ai-page-builder/shared'
import { type WorkspacePreviewState } from './workspace-preview-service'
import {
  PageBuilderWorkspaceHtmlServiceError,
  pageBuilderWorkspaceHtmlService,
} from './page-builder-workspace-html-service'

const EDITABLE_TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'span', 'label', 'div'])

type PageBuilderInlineTextSaveErrorCode =
  | 'entry-missing'
  | 'block-not-found'
  | 'selector-not-unique'
  | 'target-not-found'
  | 'target-not-editable'
  | 'invalid-descriptor'

export class PageBuilderInlineTextSaveError extends Error {
  code: PageBuilderInlineTextSaveErrorCode

  constructor(code: PageBuilderInlineTextSaveErrorCode, message: string) {
    super(message)
    this.name = 'PageBuilderInlineTextSaveError'
    this.code = code
  }
}

function validateTextTargetDescriptor(
  descriptor: PageBuilderInlineTextTargetDescriptor,
): PageBuilderInlineTextTargetDescriptor {
  if (descriptor.version !== 1) {
    throw new PageBuilderInlineTextSaveError('invalid-descriptor', '不支持的文本目标描述符版本')
  }

  if (!descriptor.tagName || typeof descriptor.tagName !== 'string') {
    throw new PageBuilderInlineTextSaveError('invalid-descriptor', '文本目标标签不能为空')
  }

  if (!Array.isArray(descriptor.childPath) || descriptor.childPath.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new PageBuilderInlineTextSaveError('invalid-descriptor', '文本目标路径不合法')
  }

  return descriptor
}

function resolveUniqueBlock(document: Document, selector: string): Element {
  const matches = document.querySelectorAll(selector)
  if (matches.length === 0) {
    throw new PageBuilderInlineTextSaveError('block-not-found', '未找到要保存的区块')
  }

  if (matches.length > 1) {
    throw new PageBuilderInlineTextSaveError('selector-not-unique', '无法唯一定位要保存的区块')
  }

  return matches[0]!
}

function resolveTargetElement(root: Element, descriptor: PageBuilderInlineTextTargetDescriptor): Element {
  let current: Element | null = root
  for (const index of descriptor.childPath) {
    const children = Array.from(current.children) as Element[]
    current = children[index] ?? null
    if (!current) {
      throw new PageBuilderInlineTextSaveError('target-not-found', '未找到要保存的文本目标')
    }
  }

  return current
}

function hasVisibleDirectText(element: Element): boolean {
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === node.TEXT_NODE && node.textContent?.trim()) {
      return true
    }
  }

  return false
}

function isEditableTextHost(element: Element, descriptor: PageBuilderInlineTextTargetDescriptor): boolean {
  if (element.tagName.toLowerCase() !== descriptor.tagName.toLowerCase()) {
    return false
  }

  if (!EDITABLE_TEXT_TAGS.has(element.tagName.toLowerCase())) {
    return false
  }

  if (element.children.length > 0) {
    return false
  }

  return hasVisibleDirectText(element)
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

export function applyPageBuilderInlineTextEdit(
  html: string,
  selector: string,
  descriptor: PageBuilderInlineTextTargetDescriptor,
  nextText: string,
): string {
  const normalizedDescriptor = validateTextTargetDescriptor(descriptor)
  const { document } = parseHTML(html)
  const block = resolveUniqueBlock(document, selector)
  const target = resolveTargetElement(block, normalizedDescriptor)

  if (!isEditableTextHost(target, normalizedDescriptor)) {
    throw new PageBuilderInlineTextSaveError('target-not-editable', '目标文本不支持内联保存')
  }

  target.textContent = nextText
  return serializeDocument(html, document)
}

export function savePageBuilderInlineText(
  workspace: AgentWorkspace,
  payload: PageBuilderInlineTextSavePayload,
): WorkspacePreviewState {
  try {
    return pageBuilderWorkspaceHtmlService.mutate(workspace, {
      transform(currentHtml) {
        return applyPageBuilderInlineTextEdit(
          currentHtml,
          payload.selector,
          payload.textTargetDescriptor,
          payload.nextText,
        )
      },
    }).previewState
  } catch (error) {
    if (error instanceof PageBuilderWorkspaceHtmlServiceError && error.code === 'entry-missing') {
      throw new PageBuilderInlineTextSaveError('entry-missing', '预览入口不存在')
    }

    throw error
  }
}
