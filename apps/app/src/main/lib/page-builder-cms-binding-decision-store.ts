import { randomUUID } from 'node:crypto'
import { parseHTML } from 'linkedom'
import type {
  PageBuilderCmsApplyCatalogReadyDecision,
  PageBuilderCmsApplyCatalogSource,
  PageBuilderCmsApplyContentReadyDecision,
  PageBuilderCmsApplyContentSource,
  PageBuilderCmsApplyDecisionResult,
  PageBuilderCmsApplyReadyDecision,
  PageBuilderCmsApplySkillInput,
  PageBuilderCmsBindingApplyPlan,
  PageBuilderCmsBindingDecisionResult,
  PageBuilderCmsBindingStructureGuardrails,
} from '@ai-page-builder/shared'

type DecisionRecordState = 'ready' | 'consumed' | 'invalidated'

interface PageBuilderCmsBindingHandoffRecord {
  handoffId: string
  workspaceId: string
  sessionId: string
  input: PageBuilderCmsApplySkillInput
}

interface PageBuilderCmsBindingDecisionRecord {
  decisionId: string
  workspaceId: string
  state: DecisionRecordState
  plan: PageBuilderCmsBindingApplyPlan
}

type PageBuilderCmsBindingDecisionStoreErrorCode =
  | 'handoff-not-found'
  | 'handoff-stale'
  | 'handoff-session-mismatch'
  | 'decision-not-found'
  | 'decision-consumed'
  | 'decision-stale'
  | 'decision-session-mismatch'
  | 'decision-conflict'

export class PageBuilderCmsBindingDecisionStoreError extends Error {
  code: PageBuilderCmsBindingDecisionStoreErrorCode

  constructor(code: PageBuilderCmsBindingDecisionStoreErrorCode, message: string) {
    super(message)
    this.name = 'PageBuilderCmsBindingDecisionStoreError'
    this.code = code
  }
}

export interface RegisterPageBuilderCmsBindingHandoffInput {
  handoffId: string
  workspaceId: string
  sessionId: string
  input: PageBuilderCmsApplySkillInput
}

export interface CreatePageBuilderCmsBindingDecisionInput {
  workspaceId: string
  handoffId: string
  sessionId: string
  decision: PageBuilderCmsApplyDecisionResult
  currentRevision: string
}

export interface ReadPageBuilderCmsBindingDecisionForApplyInput {
  workspaceId: string
  decisionId: string
  sessionId: string
  currentRevision: string
}

export function createPageBuilderCmsBindingDecisionStore() {
  const handoffs = new Map<string, PageBuilderCmsBindingHandoffRecord>()
  const decisions = new Map<string, PageBuilderCmsBindingDecisionRecord>()

  return {
    registerHandoff(input: RegisterPageBuilderCmsBindingHandoffInput): void {
      handoffs.set(input.handoffId, {
        handoffId: input.handoffId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        input: input.input,
      })
    },

    createDecision(input: CreatePageBuilderCmsBindingDecisionInput): PageBuilderCmsBindingDecisionResult {
      const handoff = handoffs.get(input.handoffId)
      if (!handoff || handoff.workspaceId !== input.workspaceId) {
        throw new PageBuilderCmsBindingDecisionStoreError('handoff-not-found', '未找到可用的 CMS handoff 上下文')
      }

      if (handoff.sessionId !== input.sessionId) {
        throw new PageBuilderCmsBindingDecisionStoreError(
          'handoff-session-mismatch',
          '当前会话与该 CMS handoff 不匹配，请重新确认 CMS 选择后再应用',
        )
      }

      if (handoff.input.authoringRevision !== input.currentRevision) {
        throw new PageBuilderCmsBindingDecisionStoreError('handoff-stale', '当前页面已发生变化，请重新确认 CMS 选择后再应用')
      }

      if (input.decision.status !== 'ready') {
        return input.decision
      }

      const plan = buildApplyPlanFromReadyDecision(handoff, input.decision)
      const decisionId = randomUUID()
      decisions.set(decisionId, {
        decisionId,
        workspaceId: input.workspaceId,
        state: 'ready',
        plan,
      })

      return {
        status: 'ready',
        decisionId,
        summary: {
          decisionId,
          toolKind: plan.toolKind,
          component: plan.component,
          targetSelection: plan.targetSelection,
          targetBlockKind: plan.targetBlockKind,
          renderMode: plan.renderMode,
          applyStrategy: plan.applyStrategy,
        },
      }
    },

    readDecisionForApply(input: ReadPageBuilderCmsBindingDecisionForApplyInput): PageBuilderCmsBindingDecisionRecord {
      const record = decisions.get(input.decisionId)
      if (!record || record.workspaceId !== input.workspaceId) {
        throw new PageBuilderCmsBindingDecisionStoreError('decision-not-found', '未找到可用的 CMS binding decision')
      }

      if (record.plan.sessionId !== input.sessionId) {
        throw new PageBuilderCmsBindingDecisionStoreError(
          'decision-session-mismatch',
          '当前会话与该 CMS binding decision 不匹配，请重新确认 CMS 选择后再应用',
        )
      }

      if (record.state === 'consumed') {
        throw new PageBuilderCmsBindingDecisionStoreError('decision-consumed', '该 CMS binding decision 已经成功使用，不能重复写入')
      }

      if (record.state === 'invalidated') {
        throw new PageBuilderCmsBindingDecisionStoreError('decision-stale', '当前页面已变化，原 decision 已失效，请重新执行 CMS apply 决策')
      }

      if (record.plan.authoringRevision !== input.currentRevision) {
        record.state = 'invalidated'
        throw new PageBuilderCmsBindingDecisionStoreError('decision-stale', '当前页面已变化，原 decision 已失效，请重新执行 CMS apply 决策')
      }

      return record
    },

    markDecisionApplied(workspaceId: string, decisionId: string): void {
      const record = decisions.get(decisionId)
      if (!record || record.workspaceId !== workspaceId) {
        return
      }

      record.state = 'consumed'
    },

    reset(): void {
      handoffs.clear()
      decisions.clear()
    },
  }
}

export const pageBuilderCmsBindingDecisionStore = createPageBuilderCmsBindingDecisionStore()

function buildApplyPlanFromReadyDecision(
  handoff: PageBuilderCmsBindingHandoffRecord,
  decision: PageBuilderCmsApplyReadyDecision,
): PageBuilderCmsBindingApplyPlan {
  const { input } = handoff
  const structureGuardrails = deriveStructureGuardrails(input)
  if (decision.toolKind === 'catalog-nav') {
    if (input.selection.selectionKind !== 'catalogs') {
      throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', '栏目型 decision 与当前选择结果不匹配')
    }

    return {
      version: 1,
      handoffId: handoff.handoffId,
      workspaceId: handoff.workspaceId,
      sessionId: handoff.sessionId,
      authoringRevision: input.authoringRevision,
      targetSelection: input.targetSelection,
      targetBlock: input.targetBlock,
      selection: input.selection,
      authoringContext: input.authoringContext,
      targetSnapshot: input.targetSnapshot,
      targetBlockKind: decision.targetBlockKind,
      renderMode: decision.renderMode,
      applyStrategy: decision.applyStrategy,
      mappingKind: decision.mappingKind,
      structureGuardrails,
      toolKind: 'catalog-nav',
      component: 'cms-catalog',
      source: normalizeCatalogDecisionSource(input.selection, decision),
    }
  }

  if (input.selection.selectionKind !== 'contents') {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', '内容型 decision 与当前选择结果不匹配')
  }

  return {
    version: 1,
    handoffId: handoff.handoffId,
    workspaceId: handoff.workspaceId,
    sessionId: handoff.sessionId,
    authoringRevision: input.authoringRevision,
    targetSelection: input.targetSelection,
    targetBlock: input.targetBlock,
    selection: input.selection,
    authoringContext: input.authoringContext,
    targetSnapshot: input.targetSnapshot,
    targetBlockKind: decision.targetBlockKind,
    renderMode: decision.renderMode,
    applyStrategy: decision.applyStrategy,
    mappingKind: decision.mappingKind,
    structureGuardrails,
    toolKind: 'content-list',
    component: 'cms-content',
    source: normalizeContentDecisionSource(input.selection, decision),
  }
}

function deriveStructureGuardrails(
  input: PageBuilderCmsApplySkillInput,
): PageBuilderCmsBindingStructureGuardrails {
  if (input.targetSelection.kind === 'cms-island' || input.targetSnapshot.kind === 'cms-island') {
    return {
      shellMode: 'replace-existing-cms-island',
      majorContainerOwner: 'slot',
      shellReason: 'source-atomic-cms-island',
    }
  }

  const shellFact = resolveBlockTargetShellFact(input.targetSnapshot.targetOuterHtml)
  if (shellFact.ownsMajorContainer) {
    return {
      shellMode: 'preserve-target-shell',
      majorContainerOwner: 'shell',
      shellSelector: input.targetSnapshot.selector,
      ...(shellFact.tagName ? { shellTagName: shellFact.tagName } : {}),
      shellReason: 'existing-shell-major-container',
    }
  }

  return {
    shellMode: 'slot-owns-major-region',
    majorContainerOwner: 'slot',
    shellReason: 'slot-major-region-default',
  }
}

function resolveBlockTargetShellFact(targetOuterHtml: string): {
  ownsMajorContainer: boolean
  tagName?: string
} {
  const normalizedHtml = targetOuterHtml.trim()
  if (!normalizedHtml) {
    return { ownsMajorContainer: false }
  }

  const { document } = parseHTML(`<!doctype html><html><body>${normalizedHtml}</body></html>`)
  const root = document.body.firstElementChild
  if (!root) {
    return { ownsMajorContainer: false }
  }

  const tagName = root.localName.toLowerCase()
  const isListShell = tagName === 'ul' || tagName === 'ol'
  const childElements = Array.from(root.children)
  const hasHeadingChild = childElements.some((child) => /^h[1-6]$/i.test(child.tagName))
  const hasNonHeadingChild = childElements.some((child) => !/^h[1-6]$/i.test(child.tagName))
  const className = (root.getAttribute('class') ?? '').toLowerCase()
  const hasShellHints = /(shell|layout|wrapper|container|frame|chrome)/.test(className)

  return {
    ownsMajorContainer:
      isListShell
      || (hasHeadingChild && hasNonHeadingChild)
      || hasShellHints,
    tagName,
  }
}

function normalizeCatalogDecisionSource(
  selection: Extract<PageBuilderCmsApplySkillInput['selection'], { selectionKind: 'catalogs' }>,
  decision: PageBuilderCmsApplyCatalogReadyDecision,
): PageBuilderCmsApplyCatalogSource {
  const siteId = normalizeRequiredSiteId(decision.source.siteId)
  if (siteId !== selection.siteId) {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', 'ready decision 的 source.siteId 与当前 CMS 选择不一致')
  }

  if (selection.sourceType === 'catalogs-by-parent') {
    const parentId = normalizeRequiredString(decision.source.parentId, 'source.parentId')
    if (parentId !== selection.parentCatalogId) {
      throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', 'ready decision 的 source.parentId 与当前 CMS 选择不一致')
    }

    if (decision.source.ids?.length) {
      throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', '父栏目来源的 ready decision 不能混用 ids')
    }

    return {
      siteId,
      level: 'children',
      parentId,
      ...(normalizeOptionalString(decision.source.contentType) ? { contentType: normalizeOptionalString(decision.source.contentType) } : {}),
      ...(normalizeOptionalString(decision.source.searchKeyword) ? { searchKeyword: normalizeOptionalString(decision.source.searchKeyword) } : {}),
      ...(normalizeOptionalNonNegativeIntegerish(decision.source.take, 'source.take') !== undefined
        ? { take: normalizeOptionalNonNegativeIntegerish(decision.source.take, 'source.take') }
        : {}),
    }
  }

  const ids = normalizeRequiredIds(decision.source.ids, 'source.ids')
  if (!haveSameOrderedValues(ids, selection.catalogIds)) {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', 'ready decision 的 source.ids 与当前 CMS 选择不一致')
  }

  if (
    decision.source.parentId !== undefined
    || decision.source.level !== undefined
    || decision.source.contentType !== undefined
    || decision.source.searchKeyword !== undefined
    || decision.source.take !== undefined
  ) {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', '固定栏目来源不能混用 parent 查询或 take 字段')
  }

  return {
    siteId,
    ids,
  }
}

function normalizeContentDecisionSource(
  selection: Extract<PageBuilderCmsApplySkillInput['selection'], { selectionKind: 'contents' }>,
  decision: PageBuilderCmsApplyContentReadyDecision,
): PageBuilderCmsApplyContentSource {
  const siteId = normalizeRequiredSiteId(decision.source.siteId)
  if (siteId !== selection.siteId) {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', 'ready decision 的 source.siteId 与当前 CMS 选择不一致')
  }

  const catalogId = normalizeRequiredString(decision.source.catalogId, 'source.catalogId')
  if (catalogId !== selection.catalogId) {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', 'ready decision 的 source.catalogId 与当前 CMS 选择不一致')
  }

  if (selection.sourceType === 'contents-by-ids') {
    const ids = normalizeRequiredIds(decision.source.ids, 'source.ids')
    if (!haveSameOrderedValues(ids, selection.contentIds)) {
      throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', 'ready decision 的 source.ids 与当前 CMS 选择不一致')
    }

    if (
      decision.source.keyword !== undefined
      || decision.source.pageIndex !== undefined
      || decision.source.pageSize !== undefined
    ) {
      throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', '固定内容来源不能混用 keyword、pageIndex 或 pageSize')
    }

    return {
      siteId,
      catalogId,
      ids,
    }
  }

  if (decision.source.ids?.length) {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', '按栏目取内容的 ready decision 不能混用 ids')
  }

  return {
    siteId,
    catalogId,
    ...(normalizeOptionalString(decision.source.keyword) ? { keyword: normalizeOptionalString(decision.source.keyword) } : {}),
    ...(normalizeOptionalNonNegativeIntegerish(decision.source.pageIndex, 'source.pageIndex') !== undefined
      ? { pageIndex: normalizeOptionalNonNegativeIntegerish(decision.source.pageIndex, 'source.pageIndex') }
      : {}),
    ...(normalizeOptionalPositiveIntegerish(decision.source.pageSize, 'source.pageSize') !== undefined
      ? { pageSize: normalizeOptionalPositiveIntegerish(decision.source.pageSize, 'source.pageSize') }
      : {}),
  }
}

function normalizeRequiredSiteId(value: string): string {
  const normalized = normalizeRequiredString(value, 'source.siteId')
  if (!/^\d+$/.test(normalized) || Number.parseInt(normalized, 10) < 1) {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', 'source.siteId 必须是大于等于 1 的整数')
  }

  return normalized
}

function normalizeRequiredString(value: string | undefined, fieldName: string): string {
  const normalized = normalizeOptionalString(value)
  if (!normalized) {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', `${fieldName} 不能为空`)
  }

  return normalized
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized ? normalized : undefined
}

function normalizeRequiredIds(value: string[] | undefined, fieldName: string): string[] {
  const normalized = normalizeOptionalIds(value)
  if (!normalized) {
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', `${fieldName} 不能为空`)
  }

  return normalized
}

function normalizeOptionalIds(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const normalized = value.map((entry) => entry.trim()).filter(Boolean)
  if (normalized.length === 0) {
    return undefined
  }

  return normalized
}

function normalizeOptionalNonNegativeIntegerish(
  value: string | number | undefined,
  fieldName: string,
): string | number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 0) {
      return value
    }
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', `${fieldName} 必须是大于等于 0 的整数`)
  }

  const normalized = value.trim()
  if (/^\d+$/.test(normalized)) {
    return normalized
  }

  throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', `${fieldName} 必须是大于等于 0 的整数`)
}

function normalizeOptionalPositiveIntegerish(
  value: string | number | undefined,
  fieldName: string,
): string | number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 1) {
      return value
    }
    throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', `${fieldName} 必须是大于等于 1 的整数`)
  }

  const normalized = value.trim()
  if (/^\d+$/.test(normalized) && Number.parseInt(normalized, 10) >= 1) {
    return normalized
  }

  throw new PageBuilderCmsBindingDecisionStoreError('decision-conflict', `${fieldName} 必须是大于等于 1 的整数`)
}

function haveSameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
