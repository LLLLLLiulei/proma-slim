import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { parseHTML } from 'linkedom'
import type {
  AgentWorkspace,
  PageBuilderImageReplacementPayload,
  PageBuilderImageTargetDescriptor,
} from '@proma/shared'
import { getWorkspaceFilesDir } from './config-paths'
import { type WorkspacePreviewState } from './workspace-preview-service'
import {
  PageBuilderWorkspaceHtmlServiceError,
  pageBuilderWorkspaceHtmlService,
} from './page-builder-workspace-html-service'

type PageBuilderImageReplacementErrorCode =
  | 'entry-missing'
  | 'block-not-found'
  | 'selector-not-unique'
  | 'target-not-found'
  | 'target-not-image'
  | 'invalid-descriptor'
  | 'invalid-file'

export class PageBuilderImageReplacementError extends Error {
  code: PageBuilderImageReplacementErrorCode

  constructor(code: PageBuilderImageReplacementErrorCode, message: string) {
    super(message)
    this.name = 'PageBuilderImageReplacementError'
    this.code = code
  }
}

function validateImageTargetDescriptor(
  descriptor: PageBuilderImageTargetDescriptor,
): PageBuilderImageTargetDescriptor {
  if (descriptor.version !== 1) {
    throw new PageBuilderImageReplacementError('invalid-descriptor', '不支持的图片目标描述符版本')
  }

  if (!descriptor.tagName || typeof descriptor.tagName !== 'string') {
    throw new PageBuilderImageReplacementError('invalid-descriptor', '图片目标标签不能为空')
  }

  if (!Array.isArray(descriptor.childPath) || descriptor.childPath.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new PageBuilderImageReplacementError('invalid-descriptor', '图片目标路径不合法')
  }

  return descriptor
}

function resolveUniqueBlock(document: Document, selector: string): Element {
  const matches = document.querySelectorAll(selector)
  if (matches.length === 0) {
    throw new PageBuilderImageReplacementError('block-not-found', '未找到要替换图片的区块')
  }

  if (matches.length > 1) {
    throw new PageBuilderImageReplacementError('selector-not-unique', '无法唯一定位要替换图片的区块')
  }

  return matches[0]!
}

function resolveTargetElement(root: Element, descriptor: PageBuilderImageTargetDescriptor): Element {
  let current: Element | null = root
  for (const index of descriptor.childPath) {
    const children = Array.from(current.children) as Element[]
    current = children[index] ?? null
    if (!current) {
      throw new PageBuilderImageReplacementError('target-not-found', '未找到要替换的图片目标')
    }
  }

  return current
}

function isImageTarget(element: Element, descriptor: PageBuilderImageTargetDescriptor): boolean {
  return element.tagName.toLowerCase() === descriptor.tagName.toLowerCase()
    && element.tagName.toLowerCase() === 'img'
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

function resolveImageExtension(file: File): string {
  if (!file.type.startsWith('image/')) {
    throw new PageBuilderImageReplacementError('invalid-file', '只能上传图片文件')
  }

  const explicitExtension = extname(file.name).toLowerCase()
  if (/^\.[a-z0-9]+$/.test(explicitExtension)) {
    return explicitExtension
  }

  const subtype = file.type.slice('image/'.length).toLowerCase()
  if (!subtype) {
    throw new PageBuilderImageReplacementError('invalid-file', '无法识别图片文件类型')
  }

  return `.${subtype}`
}

function buildWorkspaceAssetPath(file: File): {
  assetFileName: string
  assetRelativePath: string
  assetPreviewPath: string
} {
  const extension = resolveImageExtension(file)
  const assetFileName = `page-builder-image-${Date.now()}-${randomUUID()}${extension}`
  return {
    assetFileName,
    assetRelativePath: join('assets', assetFileName),
    assetPreviewPath: `./assets/${assetFileName}`,
  }
}

export function applyPageBuilderImageReplacement(
  html: string,
  selector: string,
  descriptor: PageBuilderImageTargetDescriptor,
  nextSrc: string,
): string {
  const normalizedDescriptor = validateImageTargetDescriptor(descriptor)
  const { document } = parseHTML(html)
  const block = resolveUniqueBlock(document, selector)
  const target = resolveTargetElement(block, normalizedDescriptor)

  if (!isImageTarget(target, normalizedDescriptor)) {
    throw new PageBuilderImageReplacementError('target-not-image', '目标图片不支持替换')
  }

  target.setAttribute('src', nextSrc)
  return serializeDocument(html, document)
}

export async function savePageBuilderImageReplacement(
  workspace: AgentWorkspace,
  payload: PageBuilderImageReplacementPayload,
  file: File,
): Promise<WorkspacePreviewState> {
  const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
  const assetsDir = join(workspaceFilesDir, 'assets')
  const { assetRelativePath, assetPreviewPath } = buildWorkspaceAssetPath(file)

  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(join(workspaceFilesDir, assetRelativePath), Buffer.from(await file.arrayBuffer()))

  try {
    return pageBuilderWorkspaceHtmlService.mutate(workspace, {
      transform(currentHtml) {
        return applyPageBuilderImageReplacement(
          currentHtml,
          payload.selector,
          payload.imageTargetDescriptor,
          assetPreviewPath,
        )
      },
    }).previewState
  } catch (error) {
    rmSync(join(workspaceFilesDir, assetRelativePath), { force: true })

    if (error instanceof PageBuilderWorkspaceHtmlServiceError && error.code === 'entry-missing') {
      throw new PageBuilderImageReplacementError('entry-missing', '预览入口不存在')
    }

    throw error
  }
}
