import { randomBytes } from 'node:crypto'
import { parseHTML } from 'linkedom'
import type { AgentWorkspace, PageBuilderTargetSelection } from '@proma/shared'
import type {
  CmsRenderingDiagnostic,
  CmsRenderingManifestEntry,
} from '@proma/page-builder-cms-rendering'
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
  'Each template field should contain the complete dynamic region structure for that state. Prefer the cms-* tag as the source root and keep major HTML containers inside the slot.'
export const PAGE_BUILDER_CMS_TEMPLATE_BODY_DESCRIPTION =
  `${PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE} Use templateBody for the default-state region.`
export const PAGE_BUILDER_CMS_EMPTY_TEMPLATE_DESCRIPTION =
  `${PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE} Use emptyTemplate for the empty-state fallback.`
export const PAGE_BUILDER_CMS_ERROR_TEMPLATE_DESCRIPTION =
  `${PAGE_BUILDER_CMS_TEMPLATE_FIELD_GUIDANCE} Use errorTemplate for the error-state fallback.`
const CMS_ISLAND_SELECTOR = 'cms-catalog, cms-content'

const pageBuilderBlockTargetSelectionSchema = z.object({
  kind: z.literal('block'),
  selector: z.string().min(1),
  parentBlockSelector: z.string().min(1),
  editBoundary: z.literal('block'),
}).strict()

const pageBuilderCmsIslandTargetSelectionSchema = z.object({
  kind: z.literal('cms-island'),
  selector: z.string().min(1),
  parentBlockSelector: z.string().min(1),
  component: z.enum(['cms-catalog', 'cms-content']),
  editBoundary: z.literal('source-atomic'),
}).strict()

const pageBuilderTargetSelectionSchema = z.discriminatedUnion('kind', [
  pageBuilderBlockTargetSelectionSchema,
  pageBuilderCmsIslandTargetSelectionSchema,
])

const pageBuilderCmsBindingBaseSchema = z.object({
  targetSelection: pageBuilderTargetSelectionSchema.optional(),
  targetBlock: z.object({
    selector: z.string().min(1),
  }).strict(),
  kind: z.enum(['catalog-nav', 'content-list']),
  source: z.record(z.string(), z.unknown()),
  templateBody: z.string().min(1).describe(PAGE_BUILDER_CMS_TEMPLATE_BODY_DESCRIPTION),
  emptyTemplate: z.string().describe(PAGE_BUILDER_CMS_EMPTY_TEMPLATE_DESCRIPTION).optional(),
  errorTemplate: z.string().describe(PAGE_BUILDER_CMS_ERROR_TEMPLATE_DESCRIPTION).optional(),
}).strict()

const catalogNavSourceSchema = z.object({
  level: z.string().optional(),
  parentId: z.string().optional(),
  contentType: z.string().optional(),
  searchKeyword: z.string().optional(),
  take: z.union([z.string(), z.number().int().nonnegative()]).optional(),
}).strict()

const contentListSourceSchema = z.object({
  catalogId: z.string().min(1),
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
}

interface NormalizedCatalogNavBindingInput extends Omit<ApplyPageBuilderCmsBindingInput, 'kind' | 'source' | 'targetSelection'> {
  kind: 'catalog-nav'
  targetSelection: PageBuilderTargetSelection
  source: z.infer<typeof catalogNavSourceSchema>
}

interface NormalizedContentListBindingInput extends Omit<ApplyPageBuilderCmsBindingInput, 'kind' | 'source' | 'targetSelection'> {
  kind: 'content-list'
  targetSelection: PageBuilderTargetSelection
  source: z.infer<typeof contentListSourceSchema>
}

type NormalizedApplyPageBuilderCmsBindingInput =
  | NormalizedCatalogNavBindingInput
  | NormalizedContentListBindingInput

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
      const generatedHtml = generateCmsBindingHtml(normalizedInput)

      let appliedBlockId = ''
      let mutationResult: PageBuilderWorkspaceHtmlMutationResult

      try {
        mutationResult = htmlService.mutate(workspace, {
          transform(currentHtml) {
            const { document } = parseHTML(currentHtml)
            const parentBlock = resolveUniqueBlock(
              document,
              normalizedInput.targetSelection.parentBlockSelector,
              '未找到要绑定 CMS 的区块',
              '无法唯一定位要绑定 CMS 的区块',
            )
            appliedBlockId = ensureBlockId(parentBlock, createBlockId)

            if (normalizedInput.targetSelection.kind === 'cms-island') {
              const sourceTarget = resolveUniqueBlock(
                document,
                normalizedInput.targetSelection.selector,
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
                normalizedInput.targetSelection.selector,
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
      const manifestEntry = mutationResult.manifest.entries.find((entry) => entry.blockId === appliedBlockId) ?? null

      return {
        applied: true,
        changed: mutationResult.changed,
        targetSelection: normalizedInput.targetSelection,
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
  assertTemplateFieldHasNoNestedCmsIslands('templateBody', templateBody)
  if (parsedBase.emptyTemplate) {
    assertTemplateFieldHasNoNestedCmsIslands('emptyTemplate', parsedBase.emptyTemplate)
  }
  if (parsedBase.errorTemplate) {
    assertTemplateFieldHasNoNestedCmsIslands('errorTemplate', parsedBase.errorTemplate)
  }
  const targetSelection = parsedBase.targetSelection ?? {
    kind: 'block',
    selector: parsedBase.targetBlock.selector,
    parentBlockSelector: parsedBase.targetBlock.selector,
    editBoundary: 'block',
  } satisfies PageBuilderTargetSelection

  if (parsedBase.kind === 'catalog-nav') {
    return {
      targetSelection,
      targetBlock: parsedBase.targetBlock,
      kind: 'catalog-nav',
      templateBody,
      emptyTemplate: parsedBase.emptyTemplate,
      errorTemplate: parsedBase.errorTemplate,
      source: parseSchema(catalogNavSourceSchema, parsedBase.source),
    }
  }

  return {
    targetSelection,
    targetBlock: parsedBase.targetBlock,
    kind: 'content-list',
    templateBody,
    emptyTemplate: parsedBase.emptyTemplate,
    errorTemplate: parsedBase.errorTemplate,
    source: parseSchema(contentListSourceSchema, parsedBase.source),
  }
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
  const props = input.kind === 'catalog-nav'
    ? buildCatalogNavProps(input.source)
    : buildContentListProps(input.source)

  const lines = [
    `<${componentName}${props ? ` ${props}` : ''}>`,
    '  <template v-slot:default="{ items }">',
    ...indentTemplate(input.templateBody, 4),
    '  </template>',
  ]

  if (input.emptyTemplate) {
    lines.push('  <template v-slot:empty>')
    lines.push(...indentTemplate(input.emptyTemplate, 4))
    lines.push('  </template>')
  }

  if (input.errorTemplate) {
    lines.push('  <template v-slot:error="{ error }">')
    lines.push(...indentTemplate(input.errorTemplate, 4))
    lines.push('  </template>')
  }

  lines.push(`</${componentName}>`)
  return lines.join('\n')
}

function buildCatalogNavProps(source: z.infer<typeof catalogNavSourceSchema>): string {
  return buildProps([
    ['level', source.level],
    ['parent-id', source.parentId],
    ['content-type', source.contentType],
    ['search-keyword', source.searchKeyword],
    ['take', source.take],
  ])
}

function buildContentListProps(source: z.infer<typeof contentListSourceSchema>): string {
  return buildProps([
    ['catalog-id', source.catalogId],
    ['keyword', source.keyword],
    ['page-index', source.pageIndex],
    ['page-size', source.pageSize],
  ])
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
