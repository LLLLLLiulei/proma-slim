import { randomBytes } from 'node:crypto'
import { parseHTML } from 'linkedom'
import {
  PAGE_BUILDER_DEFAULT_HTML_PATH,
  type AgentWorkspace,
  type PageBuilderCmsBindingStructureGuardrails,
  type PageBuilderTargetSelection,
} from '@proma/shared'
import type {
  CmsRenderingDiagnostic,
  CmsRenderingManifestEntry,
} from '@proma/page-builder-cms-rendering'
import {
  resolveCmsIslandSourceSelectorSnapshot,
  resolveCmsRenderingSelectorSnapshot,
} from '@proma/page-builder-cms-rendering'
import { validateCmsRendering } from '@proma/page-builder-cms-rendering'
import {
  PageBuilderWorkspaceHtmlServiceError,
  pageBuilderWorkspaceHtmlService,
  type PageBuilderWorkspaceHtmlMutationResult,
} from './page-builder-workspace-html-service'
import type { WorkspacePreviewState } from './workspace-preview-service'
import { z } from 'zod'

export const PAGE_BUILDER_CMS_APPLY_TOOL_ID = 'apply_cms_binding'
export const PAGE_BUILDER_CMS_APPLY_TOOL_NAME = 'mcp__cms__apply_cms_binding'
export const PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE =
  'Each template field should contain only the slot inner content for that state, not an outer <template v-slot:...> wrapper or outer cms-* tag. The content should still represent the complete dynamic region structure. Prefer the cms-* tag as the source root and keep major HTML containers inside the slot.'
export const PAGE_BUILDER_CMS_TEMPLATE_BODY_DESCRIPTION =
  `${PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE} Use templateBody for the default-state region.`
export const PAGE_BUILDER_CMS_EMPTY_TEMPLATE_DESCRIPTION =
  `${PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE} Use emptyTemplate for the empty-state fallback.`
export const PAGE_BUILDER_CMS_ERROR_TEMPLATE_DESCRIPTION =
  `${PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE} Use errorTemplate for the error-state fallback.`
const CMS_ISLAND_SELECTOR = 'cms-catalog, cms-content'
const BLOCKED_PARENT_BLOCK_TAGS = new Set(['HTML', 'BODY', 'HEAD'])
const DANGEROUS_CMS_TEMPLATE_TAGS = ['script', 'style'] as const
const PRESERVED_SHELL_CONFLICT_TAGS = new Set(['section', 'nav', 'main', 'aside', 'ul', 'ol'])

const pageBuilderBlockTargetSelectionSchema = z.object({
  kind: z.literal('block'),
  selector: z.string().min(1),
  parentBlockSelector: z.string().min(1),
  editBoundary: z.literal('block'),
}).strict()

const pageBuilderCmsIslandTargetSelectionSchema = z.object({
  kind: z.literal('cms-island'),
  htmlPath: z.string().min(1),
  sourceSelector: z.string().min(1),
  parentBlockSelector: z.string().min(1),
  component: z.enum(['cms-catalog', 'cms-content']),
  editBoundary: z.literal('source-atomic'),
}).strict()

const pageBuilderTargetSelectionSchema = z.discriminatedUnion('kind', [
  pageBuilderBlockTargetSelectionSchema,
  pageBuilderCmsIslandTargetSelectionSchema,
])

const pageBuilderCmsBindingBaseSchema = z.object({
  targetSelection: z.union([pageBuilderTargetSelectionSchema, z.string().min(1)]).optional(),
  targetBlock: z.object({
    selector: z.string().min(1),
  }).strict(),
  kind: z.enum(['catalog-nav', 'content-list']),
  source: z.record(z.string(), z.unknown()),
  templateBody: z.string().min(1).describe(PAGE_BUILDER_CMS_TEMPLATE_BODY_DESCRIPTION),
  emptyTemplate: z.string().describe(PAGE_BUILDER_CMS_EMPTY_TEMPLATE_DESCRIPTION).optional(),
  errorTemplate: z.string().describe(PAGE_BUILDER_CMS_ERROR_TEMPLATE_DESCRIPTION).optional(),
  structureGuardrails: z.object({
    shellMode: z.enum(['preserve-target-shell', 'replace-existing-cms-island', 'slot-owns-major-region']),
    majorContainerOwner: z.enum(['shell', 'slot']),
    shellSelector: z.string().min(1).optional(),
    shellTagName: z.string().min(1).optional(),
    shellReason: z.enum(['existing-shell-major-container', 'source-atomic-cms-island', 'slot-major-region-default']),
  }).strict().optional(),
}).strict()

const catalogNavSourceSchema = z.object({
  siteId: z.union([z.string(), z.number().int()]).optional(),
  ids: z.union([z.string(), z.array(z.string().min(1))]).optional(),
  level: z.string().optional(),
  parentId: z.string().optional(),
  contentType: z.string().optional(),
  searchKeyword: z.string().optional(),
  take: z.union([z.string(), z.number().int().nonnegative()]).optional(),
}).strict()

const contentListSourceSchema = z.object({
  siteId: z.union([z.string(), z.number().int()]).optional(),
  ids: z.union([z.string(), z.array(z.string().min(1))]).optional(),
  catalogId: z.string().min(1).optional(),
  keyword: z.string().optional(),
  pageIndex: z.union([z.string(), z.number().int().min(0)]).optional(),
  pageSize: z.union([z.string(), z.number().int().min(1)]).optional(),
}).strict()

export type PageBuilderCmsBindingKind = z.infer<typeof pageBuilderCmsBindingBaseSchema>['kind']

export interface PageBuilderCmsBindingTargetBlock {
  selector: string
}

export interface ApplyPageBuilderCmsBindingInput {
  targetSelection?: PageBuilderTargetSelection
  targetBlock: PageBuilderCmsBindingTargetBlock
  kind: PageBuilderCmsBindingKind
  source: Record<string, unknown>
  // Template fields should carry the complete dynamic region for each state
  // rather than item-level fragments with the major container left outside.
  templateBody: string
  emptyTemplate?: string
  errorTemplate?: string
  structureGuardrails?: PageBuilderCmsBindingStructureGuardrails
}

interface NormalizedCatalogNavBindingInput extends Omit<ApplyPageBuilderCmsBindingInput, 'kind' | 'source' | 'targetSelection'> {
  kind: 'catalog-nav'
  targetSelection: PageBuilderTargetSelection
  source: NormalizedCatalogNavSource
}

interface NormalizedContentListBindingInput extends Omit<ApplyPageBuilderCmsBindingInput, 'kind' | 'source' | 'targetSelection'> {
  kind: 'content-list'
  targetSelection: PageBuilderTargetSelection
  source: NormalizedContentListSource
}

type NormalizedApplyPageBuilderCmsBindingInput =
  | NormalizedCatalogNavBindingInput
  | NormalizedContentListBindingInput

interface NormalizedCatalogNavSource {
  siteId: string
  ids?: string[]
  level?: string
  parentId?: string
  contentType?: string
  searchKeyword?: string
  take?: string | number
}

interface NormalizedContentListSource {
  siteId: string
  ids?: string[]
  catalogId?: string
  keyword?: string
  pageIndex?: string | number
  pageSize?: string | number
}

type PageBuilderCmsBindingApplyErrorCode =
  | 'entry-missing'
  | 'block-not-found'
  | 'selector-not-unique'
  | 'invalid-input'
  | 'mutation-failed'

export class PageBuilderCmsBindingApplyError extends Error {
  code: PageBuilderCmsBindingApplyErrorCode

  constructor(code: PageBuilderCmsBindingApplyErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PageBuilderCmsBindingApplyError'
    this.code = code
  }
}

export interface ApplyPageBuilderCmsBindingManifestSummary {
  entryCount: number
  entry: CmsRenderingManifestEntry | null
}

export interface ApplyPageBuilderCmsBindingValidationSummary {
  valid: boolean
  errorCount: number
  warningCount: number
  infoCount: number
  diagnostics: CmsRenderingDiagnostic[]
}

export interface ApplyPageBuilderCmsBindingResult {
  applied: true
  changed: boolean
  targetSelection: PageBuilderTargetSelection
  targetBlock: PageBuilderCmsBindingTargetBlock
  blockId: string
  component: 'cms-catalog' | 'cms-content'
  generatedHtml: string
  manifest: ApplyPageBuilderCmsBindingManifestSummary
  validation: ApplyPageBuilderCmsBindingValidationSummary
  previewState: WorkspacePreviewState
}

interface ResolvedApplyTargetContext {
  effectiveTargetSelection: PageBuilderTargetSelection
  parentBlock: Element
  sourceTarget: Element | null
  islandIndex: number | null
}

type PageBuilderWorkspaceHtmlServiceLike = Pick<typeof pageBuilderWorkspaceHtmlService, 'mutate'>

export interface CreatePageBuilderCmsRenderingToolsOptions {
  now?: () => string
  createBlockId?: () => string
  htmlService?: PageBuilderWorkspaceHtmlServiceLike
}

export function createPageBuilderCmsRenderingTools(
  options: CreatePageBuilderCmsRenderingToolsOptions = {},
) {
  const htmlService = options.htmlService ?? pageBuilderWorkspaceHtmlService
  const createBlockId = options.createBlockId ?? defaultCreateBlockId

  return {
    applyCmsBinding(
      workspace: AgentWorkspace,
      input: ApplyPageBuilderCmsBindingInput,
    ): ApplyPageBuilderCmsBindingResult {
      const normalizedInput = normalizeApplyCmsBindingInput(input)

      let appliedBlockId = ''
      let effectiveTargetSelection = normalizedInput.targetSelection
      let appliedIslandIndex: number | null = null
      let mutationResult: PageBuilderWorkspaceHtmlMutationResult

      try {
        mutationResult = htmlService.mutate(workspace, {
          htmlPath: resolveTargetSelectionHtmlPath(normalizedInput.targetSelection),
          transform(currentHtml) {
            const { document } = parseHTML(currentHtml)
            const targetContext = resolveApplyTargetContext(
              document,
              normalizedInput.targetSelection,
            )
            effectiveTargetSelection = targetContext.effectiveTargetSelection
            const parentBlock = targetContext.parentBlock
            appliedBlockId = ensureBlockId(parentBlock, createBlockId)
            appliedIslandIndex = targetContext.islandIndex
            const generatedHtml = generateCmsBindingHtml(normalizedInput)

            if (effectiveTargetSelection.kind === 'cms-island') {
              const sourceTarget = targetContext.sourceTarget ?? resolveUniqueBlock(
                document,
                effectiveTargetSelection.sourceSelector,
                '未找到要替换的 CMS 组件',
                '无法唯一定位要替换的 CMS 组件',
              )

              if (!parentBlock.contains(sourceTarget)) {
                throw new PageBuilderCmsBindingApplyError('invalid-input', '目标 CMS 组件不属于当前区块')
              }

              sourceTarget.outerHTML = generatedHtml
            } else {
              const block = resolveUniqueBlock(
                document,
                effectiveTargetSelection.selector,
                '未找到要绑定 CMS 的区块',
                '无法唯一定位要绑定 CMS 的区块',
              )
              block.innerHTML = generatedHtml
            }

            return serializeDocument(currentHtml, document)
          },
        })
      } catch (error) {
        if (error instanceof PageBuilderWorkspaceHtmlServiceError && error.code === 'entry-missing') {
          throw new PageBuilderCmsBindingApplyError('entry-missing', '预览入口不存在')
        }

        if (error instanceof PageBuilderCmsBindingApplyError) {
          throw error
        }

        if (error instanceof PageBuilderWorkspaceHtmlServiceError) {
          throw new PageBuilderCmsBindingApplyError('mutation-failed', error.message, { cause: error })
        }

        throw error
      }

      const component = normalizedInput.kind === 'catalog-nav' ? 'cms-catalog' : 'cms-content'
      const generatedHtml = generateCmsBindingHtml(normalizedInput)
      const manifestEntry = resolveAppliedManifestEntry(
        mutationResult.manifest.entries,
        appliedBlockId,
        appliedIslandIndex,
      )

      return {
        applied: true,
        changed: mutationResult.changed,
        targetSelection: effectiveTargetSelection,
        targetBlock: normalizedInput.targetBlock,
        blockId: appliedBlockId,
        component,
        generatedHtml,
        manifest: {
          entryCount: mutationResult.manifest.entries.length,
          entry: manifestEntry,
        },
        validation: {
          valid: mutationResult.validation.valid,
          errorCount: mutationResult.validation.errors.length,
          warningCount: mutationResult.validation.warnings.length,
          infoCount: mutationResult.validation.infos.length,
          diagnostics: mutationResult.validation.diagnostics,
        },
        previewState: mutationResult.previewState,
      }
    },
  }
}

function normalizeApplyCmsBindingInput(
  input: ApplyPageBuilderCmsBindingInput,
): NormalizedApplyPageBuilderCmsBindingInput {
  const parsedBase = parseSchema(pageBuilderCmsBindingBaseSchema, input)
  const templateBody = parsedBase.templateBody.trim()
  if (!templateBody) {
    throw new PageBuilderCmsBindingApplyError('invalid-input', 'templateBody 不能为空')
  }
  const emptyTemplate = normalizeOptionalTemplate(parsedBase.emptyTemplate)
  const errorTemplate = normalizeOptionalTemplate(parsedBase.errorTemplate)
  const structureGuardrails = parsedBase.structureGuardrails
  assertTemplateFieldHasNoDangerousTags('templateBody', templateBody)
  assertTemplateFieldHasNoNestedCmsIslands('templateBody', templateBody)
  assertTemplateFieldHasNoSlotTemplateWrapper('templateBody', templateBody)
  assertTemplateFieldMatchesStructureGuardrails('templateBody', templateBody, structureGuardrails)
  if (emptyTemplate) {
    assertTemplateFieldHasNoDangerousTags('emptyTemplate', emptyTemplate)
    assertTemplateFieldHasNoNestedCmsIslands('emptyTemplate', emptyTemplate)
    assertTemplateFieldHasNoSlotTemplateWrapper('emptyTemplate', emptyTemplate)
    assertTemplateFieldMatchesStructureGuardrails('emptyTemplate', emptyTemplate, structureGuardrails)
  }
  if (errorTemplate) {
    assertTemplateFieldHasNoDangerousTags('errorTemplate', errorTemplate)
    assertTemplateFieldHasNoNestedCmsIslands('errorTemplate', errorTemplate)
    assertTemplateFieldHasNoSlotTemplateWrapper('errorTemplate', errorTemplate)
    assertTemplateFieldMatchesStructureGuardrails('errorTemplate', errorTemplate, structureGuardrails)
  }
  const targetSelection = normalizeTargetSelectionInput(parsedBase.targetSelection) ?? {
    kind: 'block',
    selector: parsedBase.targetBlock.selector,
    parentBlockSelector: parsedBase.targetBlock.selector,
    editBoundary: 'block',
  } satisfies PageBuilderTargetSelection

  if (parsedBase.kind === 'catalog-nav') {
    assertCatalogNavSourceDoesNotUsePageSize(parsedBase.source)
    const normalizedInput: NormalizedCatalogNavBindingInput = {
      targetSelection,
      targetBlock: parsedBase.targetBlock,
      kind: 'catalog-nav',
      templateBody,
      emptyTemplate,
      errorTemplate,
      structureGuardrails,
      source: normalizeCatalogNavSource(parseSchema(catalogNavSourceSchema, parsedBase.source)),
    }
    assertCmsBindingAuthoringPreflight(normalizedInput)
    return normalizedInput
  }

  const normalizedInput: NormalizedContentListBindingInput = {
    targetSelection,
    targetBlock: parsedBase.targetBlock,
    kind: 'content-list',
    templateBody,
    emptyTemplate,
    errorTemplate,
    structureGuardrails,
    source: normalizeContentListSource(parseSchema(contentListSourceSchema, parsedBase.source)),
  }
  assertCmsBindingAuthoringPreflight(normalizedInput)
  return normalizedInput
}

function normalizeTargetSelectionInput(value: unknown): PageBuilderTargetSelection | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) {
      throw new PageBuilderCmsBindingApplyError('invalid-input', 'targetSelection 不能为空字符串')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(normalized)
    } catch {
      throw new PageBuilderCmsBindingApplyError('invalid-input', 'targetSelection 不是合法的 JSON 字符串')
    }

    return parseSchema(pageBuilderTargetSelectionSchema, parsed)
  }

  return parseSchema(pageBuilderTargetSelectionSchema, value)
}

function assertCatalogNavSourceDoesNotUsePageSize(source: Record<string, unknown>): void {
  if (
    Object.prototype.hasOwnProperty.call(source, 'pageSize')
    || Object.prototype.hasOwnProperty.call(source, 'page-size')
  ) {
    throw new PageBuilderCmsBindingApplyError(
      'invalid-input',
      'catalog-nav 不支持 source.pageSize；如需限制栏目数量请使用 source.take',
    )
  }
}

function normalizeCatalogNavSource(source: z.infer<typeof catalogNavSourceSchema>): NormalizedCatalogNavSource {
  const ids = normalizeBindingIds(source.ids)
  if (ids) {
    if (
      source.level !== undefined
      || source.parentId !== undefined
      || source.contentType !== undefined
      || source.searchKeyword !== undefined
      || source.take !== undefined
    ) {
      throw new PageBuilderCmsBindingApplyError('invalid-input', 'catalog-nav ids 不能与查询来源字段混用')
    }

    return {
      siteId: normalizeBindingSiteId(source.siteId),
      ids,
    }
  }

  return {
    siteId: normalizeBindingSiteId(source.siteId),
    level: source.parentId ? 'children' : source.level,
    parentId: source.parentId,
    contentType: source.contentType,
    searchKeyword: source.searchKeyword,
    take: source.take,
  }
}

function normalizeContentListSource(source: z.infer<typeof contentListSourceSchema>): NormalizedContentListSource {
  const ids = normalizeBindingIds(source.ids)
  if (ids) {
    const catalogId = source.catalogId?.trim()
    if (!catalogId) {
      throw new PageBuilderCmsBindingApplyError('invalid-input', 'content-list fixed ids require source.catalogId')
    }

    if (
      source.keyword !== undefined
      || source.pageIndex !== undefined
      || source.pageSize !== undefined
    ) {
      throw new PageBuilderCmsBindingApplyError('invalid-input', 'content-list ids 不能与 keyword、pageIndex 或 pageSize 混用')
    }

    return {
      siteId: normalizeBindingSiteId(source.siteId),
      catalogId,
      ids,
    }
  }

  if (!source.catalogId?.trim()) {
    throw new PageBuilderCmsBindingApplyError('invalid-input', 'source.catalogId 不能为空')
  }

  return {
    siteId: normalizeBindingSiteId(source.siteId),
    catalogId: source.catalogId.trim(),
    keyword: source.keyword,
    pageIndex: source.pageIndex,
    pageSize: source.pageSize,
  }
}

function normalizeBindingSiteId(value: string | number | undefined): string {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
    return String(value)
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (/^\d+$/.test(normalized) && Number.parseInt(normalized, 10) >= 1) {
      return normalized
    }
  }

  if (value === undefined) {
    throw new PageBuilderCmsBindingApplyError('invalid-input', 'source.siteId 不能为空')
  }

  throw new PageBuilderCmsBindingApplyError('invalid-input', 'source.siteId 必须是大于等于 1 的整数')
}

function normalizeBindingIds(value: string | string[] | undefined): string[] | undefined {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  if (entries.length === 0) {
    return undefined
  }

  const normalized = entries
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (normalized.length === 0) {
    throw new PageBuilderCmsBindingApplyError('invalid-input', 'source.ids 不能为空')
  }

  return normalized
}

function parseSchema<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (parsed.success) {
    return parsed.data
  }

  const issue = parsed.error.issues[0]
  throw new PageBuilderCmsBindingApplyError(
    'invalid-input',
    issue?.message ?? 'CMS 绑定参数不合法',
  )
}

function assertCmsBindingAuthoringPreflight(
  input: NormalizedApplyPageBuilderCmsBindingInput,
): void {
  const html = [
    '<!doctype html><html><body>',
    '<section data-proma-block-id="pb_blk_preflight">',
    generateCmsBindingHtml(input),
    '</section>',
    '</body></html>',
  ].join('')
  const validation = validateCmsRendering(html, { htmlPath: 'index.html' })

  if (validation.errors.length === 0) {
    return
  }

  const firstError = validation.errors[0]
  if (!firstError) {
    return
  }

  if (firstError.code === 'UNKNOWN_ITEM_FIELD') {
    const fieldAccess = firstError.message.match(/"([^"]+)"/)?.[1] ?? 'unknown'
    throw new PageBuilderCmsBindingApplyError(
      'invalid-input',
      `templateBody 引用了当前 CMS contract 不支持的字段: ${fieldAccess}`,
    )
  }

  if (firstError.code === 'UNKNOWN_SLOT_VARIABLE') {
    const variableName = firstError.message.match(/"([^"]+)"/)?.[1] ?? 'unknown'
    throw new PageBuilderCmsBindingApplyError(
      'invalid-input',
      `templateBody 引用了当前 CMS contract 未声明的 slot 变量: ${variableName}`,
    )
  }

  if (firstError.code === 'INVALID_SLOT_SCOPE') {
    throw new PageBuilderCmsBindingApplyError(
      'invalid-input',
      'CMS slot scope 必须显式声明 { items, loading, error, empty } 的子集，不能使用别名对象或未声明变量',
    )
  }

  if (firstError.code === 'INLINE_EVENT_HANDLER_ATTRIBUTE') {
    throw new PageBuilderCmsBindingApplyError(
      'invalid-input',
      'templateBody 不能包含原生 HTML 事件属性（如 onclick / onerror / onload）；请改用合法的 Vue 指令或声明式结构',
    )
  }

  if (firstError.code === 'INVALID_VUE_TEMPLATE_SYNTAX') {
    const detail = firstError.message.replace(/^Invalid Vue template syntax in .*? slot:\s*/, '')
    throw new PageBuilderCmsBindingApplyError(
      'invalid-input',
      `templateBody 包含不合法的 Vue 模板语法: ${detail}`,
    )
  }

  const codes = Array.from(new Set(validation.errors.map((diagnostic) => diagnostic.code))).join(', ')
  throw new PageBuilderCmsBindingApplyError(
    'invalid-input',
    `CMS 模板预检失败: ${codes}`,
  )
}

function normalizeOptionalTemplate(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized ? normalized : undefined
}

function assertTemplateFieldHasNoNestedCmsIslands(fieldName: string, template: string): void {
  const normalizedTemplate = template.trim()
  if (!normalizedTemplate) {
    return
  }

  const { document } = parseHTML(`<!doctype html><html><body><div data-proma-template-root>${normalizedTemplate}</div></body></html>`)
  const root = document.querySelector('[data-proma-template-root]')
  if (!root?.querySelector(CMS_ISLAND_SELECTOR)) {
    return
  }

  throw new PageBuilderCmsBindingApplyError(
    'invalid-input',
    `${fieldName} 不能包含 cms-catalog 或 cms-content；apply_cms_binding 会自动生成外层 CMS 标签`,
  )
}

function assertTemplateFieldHasNoSlotTemplateWrapper(fieldName: string, template: string): void {
  const normalizedTemplate = template.trim()
  if (!normalizedTemplate) {
    return
  }

  const { document } = parseHTML(`<!doctype html><html><body><div data-proma-template-root>${normalizedTemplate}</div></body></html>`)
  const root = document.querySelector('[data-proma-template-root]')
  if (!root) {
    return
  }

  const hasSlotTemplateWrapper = Array.from(root.querySelectorAll('template')).some((element) =>
    Array.from(element.attributes).some((attribute) => isSlotTemplateAttributeName(attribute.name)),
  )

  if (!hasSlotTemplateWrapper) {
    return
  }

  throw new PageBuilderCmsBindingApplyError(
    'invalid-input',
    `${fieldName} 只能传入 slot 内部内容，不要包含外层 <template v-slot:...> 或 <template #...> 包装`,
  )
}

function assertTemplateFieldHasNoDangerousTags(fieldName: string, template: string): void {
  const normalizedTemplate = template.trim()
  if (!normalizedTemplate) {
    return
  }

  const { document } = parseHTML(`<!doctype html><html><body><div data-proma-template-root>${normalizedTemplate}</div></body></html>`)
  const root = document.querySelector('[data-proma-template-root]')
  if (!root) {
    return
  }

  const hasDangerousTag = DANGEROUS_CMS_TEMPLATE_TAGS.some((tagName) => root.querySelector(tagName))
  if (!hasDangerousTag) {
    return
  }

  throw new PageBuilderCmsBindingApplyError(
    'invalid-input',
    `${fieldName} 不能包含 <script> 或 <style>`,
  )
}

function assertTemplateFieldMatchesStructureGuardrails(
  fieldName: string,
  template: string,
  structureGuardrails?: PageBuilderCmsBindingStructureGuardrails,
): void {
  if (
    !structureGuardrails
    || structureGuardrails.shellMode !== 'preserve-target-shell'
    || structureGuardrails.majorContainerOwner !== 'shell'
  ) {
    return
  }

  const normalizedTemplate = template.trim()
  if (!normalizedTemplate) {
    return
  }

  const { document } = parseHTML(`<!doctype html><html><body><div data-proma-template-root>${normalizedTemplate}</div></body></html>`)
  const root = document.querySelector('[data-proma-template-root]')
  if (!root) {
    return
  }

  const conflictingElement = Array.from(root.children).find((element) => {
    const localName = element.localName.toLowerCase()
    if (PRESERVED_SHELL_CONFLICT_TAGS.has(localName)) {
      return true
    }

    const role = element.getAttribute('role')?.toLowerCase()
    return role === 'navigation' || role === 'list'
  })

  if (!conflictingElement) {
    return
  }

  throw new PageBuilderCmsBindingApplyError(
    'invalid-input',
    `${fieldName} 与当前保留外层壳层的结构计划冲突：当前 decision 要求保留${formatPreservedShellDescriptor(structureGuardrails)}作为主容器，请改为复用现有壳层，只在 slot 中保留与之兼容的内部动态内容，不要再生成新的 <${conflictingElement.localName.toLowerCase()}> 主容器后重试`,
  )
}

function formatPreservedShellDescriptor(
  structureGuardrails: PageBuilderCmsBindingStructureGuardrails,
): string {
  const tagName = structureGuardrails.shellTagName?.trim()
  const selector = structureGuardrails.shellSelector?.trim()
  if (tagName && selector) {
    return `外层 ${tagName}${selector} `
  }

  if (tagName) {
    return `外层 ${tagName} `
  }

  if (selector) {
    return `外层壳层 ${selector} `
  }

  return '外层壳层 '
}

function isSlotTemplateAttributeName(name: string): boolean {
  return name === 'v-slot'
    || name.startsWith('v-slot:')
    || name.startsWith('#')
}

function resolveEffectiveTargetSelection(
  document: Document,
  targetSelection: PageBuilderTargetSelection,
): PageBuilderTargetSelection {
  if (targetSelection.kind === 'cms-island') {
    return targetSelection
  }

  const matches = document.querySelectorAll(targetSelection.selector)
  if (matches.length !== 1) {
    return targetSelection
  }

  const sourceTarget = matches[0]!
  const component = resolveCmsComponentName(sourceTarget)
  if (!component) {
    return targetSelection
  }

  return {
    kind: 'cms-island',
    htmlPath: PAGE_BUILDER_DEFAULT_HTML_PATH,
    sourceSelector: resolveCmsIslandSourceSelectorSnapshot(sourceTarget) ?? targetSelection.selector,
    parentBlockSelector: resolveCmsRenderingSelectorSnapshot(resolveImplicitParentBlockForCmsElement(sourceTarget))
      ?? targetSelection.parentBlockSelector,
    component,
    editBoundary: 'source-atomic',
  }
}

function resolveApplyTargetContext(
  document: Document,
  targetSelection: PageBuilderTargetSelection,
): ResolvedApplyTargetContext {
  const effectiveTargetSelection = resolveEffectiveTargetSelection(document, targetSelection)
  if (effectiveTargetSelection.kind === 'cms-island') {
    const sourceTarget = resolveCmsSourceTarget(document, effectiveTargetSelection)
    const parentBlock = resolveImplicitParentBlockForCmsElement(sourceTarget)

    return {
      effectiveTargetSelection,
      parentBlock,
      sourceTarget,
      islandIndex: resolveTopLevelCmsIslandIndex(document, sourceTarget),
    }
  }

  return {
    effectiveTargetSelection,
    parentBlock: resolveUniqueBlock(
      document,
      effectiveTargetSelection.parentBlockSelector,
      '未找到要绑定 CMS 的区块',
      '无法唯一定位要绑定 CMS 的区块',
    ),
    sourceTarget: null,
    islandIndex: null,
  }
}

function resolveImplicitParentBlockForCmsElement(sourceTarget: Element): Element {
  const blockAncestor = sourceTarget.parentElement?.closest('[data-proma-block-id]') ?? null
  if (blockAncestor) {
    return blockAncestor
  }

  const parentElement = sourceTarget.parentElement
  if (parentElement && !BLOCKED_PARENT_BLOCK_TAGS.has(parentElement.tagName)) {
    return parentElement
  }

  return sourceTarget
}

function resolveTopLevelCmsIslandIndex(document: Document, element: Element): number | null {
  const islands = Array.from(document.querySelectorAll(CMS_ISLAND_SELECTOR))
    .filter((candidate) => candidate.parentElement?.closest(CMS_ISLAND_SELECTOR) == null)

  const islandIndex = islands.findIndex((candidate) => candidate === element)
  return islandIndex >= 0 ? islandIndex : null
}

function resolveAppliedManifestEntry(
  entries: CmsRenderingManifestEntry[],
  blockId: string,
  islandIndex: number | null,
): CmsRenderingManifestEntry | null {
  if (islandIndex !== null) {
    const matchedEntry = entries.find((entry) => entry.islandIndex === islandIndex)
    if (matchedEntry) {
      return matchedEntry
    }
  }

  return entries.find((entry) => entry.blockId === blockId) ?? null
}

function resolveCmsComponentName(element: Element): 'cms-catalog' | 'cms-content' | null {
  const localName = element.localName.toLowerCase()
  if (localName === 'cms-catalog' || localName === 'cms-content') {
    return localName
  }

  return null
}

function resolveCmsSourceTarget(
  document: Document,
  targetSelection: Extract<PageBuilderTargetSelection, { kind: 'cms-island' }>,
): Element {
  if (targetSelection.htmlPath !== PAGE_BUILDER_DEFAULT_HTML_PATH) {
    throw new PageBuilderCmsBindingApplyError('invalid-input', '当前 CMS 目标 htmlPath 不受支持')
  }

  const sourceTarget = resolveUniqueBlock(
    document,
    targetSelection.sourceSelector,
    '未找到要替换的 CMS 组件',
    '无法唯一定位要替换的 CMS 组件',
  )
  assertCmsComponentMatchesTarget(targetSelection.component, sourceTarget)
  const parentBlock = resolveUniqueBlock(
    document,
    targetSelection.parentBlockSelector,
    '未找到当前 CMS 目标所属区块',
    '无法唯一定位当前 CMS 目标所属区块',
  )
  if (!parentBlock.contains(sourceTarget)) {
    throw new PageBuilderCmsBindingApplyError('invalid-input', '目标 CMS 组件不属于当前区块')
  }
  return sourceTarget
}

function assertCmsComponentMatchesTarget(
  component: 'cms-catalog' | 'cms-content',
  element: Element,
): void {
  const resolvedComponent = resolveCmsComponentName(element)
  if (resolvedComponent === component) {
    return
  }

  throw new PageBuilderCmsBindingApplyError('invalid-input', '目标 CMS 组件与 targetSelection.component 不匹配')
}

function resolveUniqueBlock(
  document: Document,
  selector: string,
  notFoundMessage: string,
  notUniqueMessage: string,
): Element {
  const matches = document.querySelectorAll(selector)
  if (matches.length === 0) {
    throw new PageBuilderCmsBindingApplyError('block-not-found', notFoundMessage)
  }

  if (matches.length > 1) {
    throw new PageBuilderCmsBindingApplyError('selector-not-unique', notUniqueMessage)
  }

  return matches[0]!
}

function ensureBlockId(element: Element, createBlockId: () => string): string {
  const existingBlockId = element.getAttribute('data-proma-block-id')?.trim()
  if (existingBlockId) {
    return existingBlockId
  }

  const nextBlockId = createBlockId()
  element.setAttribute('data-proma-block-id', nextBlockId)
  return nextBlockId
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

function generateCmsBindingHtml(
  input: NormalizedApplyPageBuilderCmsBindingInput,
): string {
  const componentName = input.kind === 'catalog-nav' ? 'cms-catalog' : 'cms-content'
  const propEntries = input.kind === 'catalog-nav'
    ? buildCatalogNavPropEntries(input.source)
    : buildContentListPropEntries(input.source)
  const slotScopeExpression = '{ items, loading, error, empty }'
  const rootProps = buildProps(propEntries)

  const lines = [
    `<${componentName}${rootProps ? ` ${rootProps}` : ''}>`,
    `  <template v-slot:default="${slotScopeExpression}">`,
    ...indentTemplate(input.templateBody, 4),
    '  </template>',
  ]

  if (input.emptyTemplate) {
    lines.push(`  <template v-slot:empty="${slotScopeExpression}">`)
    lines.push(...indentTemplate(input.emptyTemplate, 4))
    lines.push('  </template>')
  }

  if (input.errorTemplate) {
    lines.push(`  <template v-slot:error="${slotScopeExpression}">`)
    lines.push(...indentTemplate(input.errorTemplate, 4))
    lines.push('  </template>')
  }

  lines.push(`</${componentName}>`)
  return lines.join('\n')
}

function buildCatalogNavPropEntries(
  source: NormalizedCatalogNavSource,
): Array<[name: string, value: string | number | undefined]> {
  if (source.ids) {
    return [
      ['site-id', source.siteId],
      ['ids', source.ids.join(',')],
    ]
  }

  return [
    ['site-id', source.siteId],
    ['level', source.level],
    ['parent-id', source.parentId],
    ['content-type', source.contentType],
    ['search-keyword', source.searchKeyword],
    ['take', source.take],
  ]
}

function buildContentListPropEntries(
  source: NormalizedContentListSource,
): Array<[name: string, value: string | number | undefined]> {
  if (source.ids) {
    return [
      ['site-id', source.siteId],
      ['catalog-id', source.catalogId],
      ['ids', source.ids.join(',')],
    ]
  }

  return [
    ['site-id', source.siteId],
    ['catalog-id', source.catalogId],
    ['keyword', source.keyword],
    ['page-index', source.pageIndex],
    ['page-size', source.pageSize],
  ]
}

function buildProps(entries: Array<[name: string, value: string | number | undefined]>): string {
  return entries
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => `${name}="${escapeAttributeValue(String(value))}"`)
    .join(' ')
}

function indentTemplate(source: string, spaces: number): string[] {
  const indent = ' '.repeat(spaces)
  return source
    .trim()
    .split('\n')
    .map((line) => `${indent}${line}`)
}

function escapeAttributeValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function defaultCreateBlockId(): string {
  return `pb_blk_${randomBytes(4).toString('hex')}`
}

function resolveTargetSelectionHtmlPath(targetSelection: PageBuilderTargetSelection): string {
  return targetSelection.kind === 'cms-island'
    ? targetSelection.htmlPath
    : PAGE_BUILDER_DEFAULT_HTML_PATH
}
