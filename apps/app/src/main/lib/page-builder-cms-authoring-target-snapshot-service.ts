import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseHTML } from 'linkedom'
import type {
  AgentWorkspace,
  PageBuilderCmsApplyTargetSnapshot,
  PageBuilderTargetSelection,
} from '@proma/shared'
import { getWorkspaceFilesDir } from './config-paths'

const CMS_ISLAND_SELECTOR = 'cms-catalog, cms-content'
const CMS_SOURCE_ID_ATTRIBUTE = 'data-proma-cms-source-id'

type PageBuilderCmsAuthoringTargetSnapshotErrorCode =
  | 'entry-missing'
  | 'target-not-found'
  | 'selector-not-unique'
  | 'target-mismatch'

export class PageBuilderCmsAuthoringTargetSnapshotError extends Error {
  code: PageBuilderCmsAuthoringTargetSnapshotErrorCode

  constructor(code: PageBuilderCmsAuthoringTargetSnapshotErrorCode, message: string) {
    super(message)
    this.name = 'PageBuilderCmsAuthoringTargetSnapshotError'
    this.code = code
  }
}

export function readPageBuilderCmsApplyTargetSnapshot(
  workspace: AgentWorkspace,
  targetSelection: PageBuilderTargetSelection,
): PageBuilderCmsApplyTargetSnapshot {
  const entryPath = join(getWorkspaceFilesDir(workspace.slug), 'index.html')
  if (!existsSync(entryPath)) {
    throw new PageBuilderCmsAuthoringTargetSnapshotError('entry-missing', '预览入口不存在')
  }

  const html = readFileSync(entryPath, 'utf-8')
  const { document } = parseHTML(html)

  if (targetSelection.kind === 'cms-island') {
    const sourceTarget = resolveCmsSourceTarget(document, targetSelection)
    const parentBlock = resolveUniqueElement(
      document,
      targetSelection.parentBlockSelector,
      '未找到当前 CMS 目标所属区块',
      '无法唯一定位当前 CMS 目标所属区块',
    )

    if (!parentBlock.contains(sourceTarget)) {
      throw new PageBuilderCmsAuthoringTargetSnapshotError('target-mismatch', '当前 CMS 目标不属于所选区块')
    }

    return {
      kind: 'cms-island',
      selector: targetSelection.selector,
      parentBlockSelector: targetSelection.parentBlockSelector,
      targetOuterHtml: sourceTarget.outerHTML.trim(),
      parentBlockOuterHtml: parentBlock.outerHTML.trim(),
      component: targetSelection.component,
      ...(readCmsSourceId(sourceTarget) ? { sourceId: readCmsSourceId(sourceTarget) } : {}),
    }
  }

  const targetElement = resolveUniqueElement(
    document,
    targetSelection.selector,
    '未找到当前目标区块',
    '无法唯一定位当前目标区块',
  )
  const parentBlock = resolveUniqueElement(
    document,
    targetSelection.parentBlockSelector,
    '未找到当前目标区块',
    '无法唯一定位当前目标区块',
  )

  if (!parentBlock.contains(targetElement) && parentBlock !== targetElement) {
    throw new PageBuilderCmsAuthoringTargetSnapshotError('target-mismatch', '当前目标不属于所选区块')
  }

  return {
    kind: 'block',
    selector: targetSelection.selector,
    parentBlockSelector: targetSelection.parentBlockSelector,
    targetOuterHtml: targetElement.outerHTML.trim(),
    ...(parentBlock === targetElement ? {} : { parentBlockOuterHtml: parentBlock.outerHTML.trim() }),
  }
}

function resolveCmsSourceTarget(
  document: Document,
  targetSelection: Extract<PageBuilderTargetSelection, { kind: 'cms-island' }>,
): Element {
  const sourceId = typeof targetSelection.sourceId === 'string' ? targetSelection.sourceId.trim() : ''
  if (sourceId) {
    const matches = Array.from(document.querySelectorAll(CMS_ISLAND_SELECTOR))
      .filter((candidate) => readCmsSourceId(candidate) === sourceId)

    if (matches.length === 0) {
      throw new PageBuilderCmsAuthoringTargetSnapshotError('target-not-found', '未找到当前 CMS 源标签')
    }

    if (matches.length > 1) {
      throw new PageBuilderCmsAuthoringTargetSnapshotError('selector-not-unique', '无法唯一定位当前 CMS 源标签')
    }

    const matched = matches[0]!
    const component = resolveCmsComponentName(matched)
    if (component !== targetSelection.component) {
      throw new PageBuilderCmsAuthoringTargetSnapshotError('target-mismatch', '当前 CMS 源标签与目标组件类型不一致')
    }

    return matched
  }

  const matched = resolveUniqueElement(
    document,
    targetSelection.selector,
    '未找到当前 CMS 源标签',
    '无法唯一定位当前 CMS 源标签',
  )
  const component = resolveCmsComponentName(matched)
  if (component !== targetSelection.component) {
    throw new PageBuilderCmsAuthoringTargetSnapshotError('target-mismatch', '当前 CMS 源标签与目标组件类型不一致')
  }

  return matched
}

function resolveUniqueElement(
  document: Document,
  selector: string,
  notFoundMessage: string,
  notUniqueMessage: string,
): Element {
  const matches = document.querySelectorAll(selector)
  if (matches.length === 0) {
    throw new PageBuilderCmsAuthoringTargetSnapshotError('target-not-found', notFoundMessage)
  }

  if (matches.length > 1) {
    throw new PageBuilderCmsAuthoringTargetSnapshotError('selector-not-unique', notUniqueMessage)
  }

  return matches[0]!
}

function readCmsSourceId(element: Element): string | undefined {
  const normalized = element.getAttribute(CMS_SOURCE_ID_ATTRIBUTE)?.trim()
  return normalized ? normalized : undefined
}

function resolveCmsComponentName(element: Element): 'cms-catalog' | 'cms-content' | null {
  const localName = element.localName.toLowerCase()
  return localName === 'cms-catalog' || localName === 'cms-content'
    ? localName
    : null
}
