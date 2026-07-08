export const PAGE_BUILDER_HOST_BRIDGE_SOURCE = 'page-builder-host-bridge'
export const PAGE_BUILDER_HOST_PARENT_SOURCE = 'page-builder-host-parent'
export const PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION = 1
export const PAGE_BUILDER_HOST_TOOLBAR_BUTTON_MAX_COUNT = 5
export const PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ID_MAX_LENGTH = 64
export const PAGE_BUILDER_HOST_TOOLBAR_LABEL_MAX_LENGTH = 16
export const PAGE_BUILDER_HOST_TOOLBAR_TOOLTIP_MAX_LENGTH = 80

export const PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ICONS = [
  'send',
  'check',
  'upload',
  'download',
  'external-link',
  'save',
  'refresh',
  'x',
  'arrow-left',
] as const

export const PAGE_BUILDER_HOST_TOOLBAR_BUTTON_VARIANTS = [
  'outline',
  'primary',
  'ghost',
  'destructive',
] as const

export type PageBuilderHostToolbarButtonIcon = typeof PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ICONS[number]
export type PageBuilderHostToolbarButtonVariant = typeof PAGE_BUILDER_HOST_TOOLBAR_BUTTON_VARIANTS[number]

export interface PageBuilderHostToolbarButton {
  id: string
  label: string
  tooltip?: string
  icon?: PageBuilderHostToolbarButtonIcon
  variant?: PageBuilderHostToolbarButtonVariant
  disabled?: boolean
  busy?: boolean
  hidden?: boolean
  requiresPreview?: boolean
  order?: number
}

export interface PageBuilderHostToolbarExtensions {
  buttons: PageBuilderHostToolbarButton[]
}

export interface PageBuilderHostToolbarButtonClickState {
  hasPreview: boolean
  previewUrl: string | null
}

export type PageBuilderHostBridgeMessage =
  | {
    source: typeof PAGE_BUILDER_HOST_BRIDGE_SOURCE
    type: 'ready'
    version: typeof PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION
    capabilities: ['toolbarExtensions.v1']
    workspaceId: string
    sessionId: string
    projectId?: string
  }
  | {
    source: typeof PAGE_BUILDER_HOST_BRIDGE_SOURCE
    type: 'toolbar-button-click'
    version: typeof PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION
    buttonId: string
    workspaceId: string
    sessionId: string
    projectId?: string
    state: PageBuilderHostToolbarButtonClickState
  }

export type PageBuilderHostParentMessage =
  | {
    source: typeof PAGE_BUILDER_HOST_PARENT_SOURCE
    type: 'toolbar-buttons-set'
    version: typeof PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION
    buttons: unknown
  }
  | {
    source: typeof PAGE_BUILDER_HOST_PARENT_SOURCE
    type: 'toolbar-button-update'
    version: typeof PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION
    buttonId: string
    patch: unknown
  }

interface NormalizedButtonWithIndex {
  button: PageBuilderHostToolbarButton
  inputIndex: number
}

export interface PageBuilderHostToolbarExtensionsValidationIssue {
  index?: number
  field: string
  message: string
}

export class PageBuilderHostToolbarExtensionsValidationError extends Error {
  issues: PageBuilderHostToolbarExtensionsValidationIssue[]

  constructor(issues: PageBuilderHostToolbarExtensionsValidationIssue[]) {
    super('宿主工具栏扩展按钮配置不合法')
    this.name = 'PageBuilderHostToolbarExtensionsValidationError'
    this.issues = issues
  }
}

const ICON_SET = new Set<string>(PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ICONS)
const VARIANT_SET = new Set<string>(PAGE_BUILDER_HOST_TOOLBAR_BUTTON_VARIANTS)
const BUTTON_ID_PATTERN = /^[A-Za-z0-9._:-]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  return trimmed.slice(0, maxLength)
}

function normalizeFiniteOrder(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return value
}

function collectButtonInput(value: unknown): unknown[] {
  if (!isRecord(value)) return []
  return Array.isArray(value.buttons) ? value.buttons : []
}

function normalizeButton(
  value: unknown,
  index: number,
  strict: boolean,
  issues: PageBuilderHostToolbarExtensionsValidationIssue[],
): PageBuilderHostToolbarButton | null {
  if (!isRecord(value)) {
    if (strict) {
      issues.push({ index, field: 'button', message: 'button 必须是对象' })
    }
    return null
  }

  const id = normalizeTrimmedString(value.id, PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ID_MAX_LENGTH)
  if (!id || !BUTTON_ID_PATTERN.test(id)) {
    if (strict) {
      issues.push({ index, field: 'id', message: 'id 必须是非空安全字符串' })
    }
    return null
  }

  const label = normalizeTrimmedString(value.label, PAGE_BUILDER_HOST_TOOLBAR_LABEL_MAX_LENGTH)
  if (!label) {
    if (strict) {
      issues.push({ index, field: 'label', message: 'label 必须是非空字符串' })
    }
    return null
  }

  const button: PageBuilderHostToolbarButton = {
    id,
    label,
  }
  const tooltip = normalizeTrimmedString(value.tooltip, PAGE_BUILDER_HOST_TOOLBAR_TOOLTIP_MAX_LENGTH)
  if (tooltip) {
    button.tooltip = tooltip
  }
  if (typeof value.icon === 'string' && ICON_SET.has(value.icon)) {
    button.icon = value.icon as PageBuilderHostToolbarButtonIcon
  } else if (strict && value.icon !== undefined) {
    issues.push({ index, field: 'icon', message: 'icon 不在白名单内' })
  }
  if (typeof value.variant === 'string' && VARIANT_SET.has(value.variant)) {
    button.variant = value.variant as PageBuilderHostToolbarButtonVariant
  } else if (strict && value.variant !== undefined) {
    issues.push({ index, field: 'variant', message: 'variant 不在白名单内' })
  }

  for (const field of ['disabled', 'busy', 'hidden', 'requiresPreview'] as const) {
    if (typeof value[field] === 'boolean') {
      button[field] = value[field]
    } else if (strict && value[field] !== undefined) {
      issues.push({ index, field, message: `${field} 必须是 boolean` })
    }
  }

  const order = normalizeFiniteOrder(value.order)
  if (order !== undefined) {
    button.order = order
  } else if (strict && value.order !== undefined) {
    issues.push({ index, field: 'order', message: 'order 必须是有限数字' })
  }

  return button
}

function normalizeWithIssues(
  value: unknown,
  options: { strict: boolean },
): {
  extensions: PageBuilderHostToolbarExtensions
  issues: PageBuilderHostToolbarExtensionsValidationIssue[]
} {
  const issues: PageBuilderHostToolbarExtensionsValidationIssue[] = []
  if (options.strict && value !== undefined && !isRecord(value)) {
    issues.push({ field: 'toolbarExtensions', message: 'toolbarExtensions 必须是对象' })
  }

  const inputButtons = collectButtonInput(value)
  if (options.strict && isRecord(value) && value.buttons !== undefined && !Array.isArray(value.buttons)) {
    issues.push({ field: 'buttons', message: 'buttons 必须是数组' })
  }

  const seen = new Set<string>()
  const normalized: NormalizedButtonWithIndex[] = []

  for (const [index, inputButton] of inputButtons.entries()) {
    const button = normalizeButton(inputButton, index, options.strict, issues)
    if (!button) continue

    if (seen.has(button.id)) {
      if (options.strict) {
        issues.push({ index, field: 'id', message: 'id 不能重复' })
      }
      continue
    }

    seen.add(button.id)
    normalized.push({ button, inputIndex: index })
  }

  if (options.strict && normalized.length > PAGE_BUILDER_HOST_TOOLBAR_BUTTON_MAX_COUNT) {
    issues.push({ field: 'buttons', message: `buttons 不能超过 ${PAGE_BUILDER_HOST_TOOLBAR_BUTTON_MAX_COUNT} 个` })
  }

  normalized.sort((left, right) => {
    const leftOrder = left.button.order ?? Number.POSITIVE_INFINITY
    const rightOrder = right.button.order ?? Number.POSITIVE_INFINITY
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.inputIndex - right.inputIndex
  })

  return {
    extensions: {
      buttons: normalized
        .slice(0, PAGE_BUILDER_HOST_TOOLBAR_BUTTON_MAX_COUNT)
        .map((entry) => entry.button),
    },
    issues,
  }
}

export function normalizePageBuilderHostToolbarExtensions(value: unknown): PageBuilderHostToolbarExtensions {
  return normalizeWithIssues(value, { strict: false }).extensions
}

export function parsePageBuilderHostToolbarExtensions(value: unknown): PageBuilderHostToolbarExtensions {
  const result = normalizeWithIssues(value, { strict: true })
  if (result.issues.length > 0) {
    throw new PageBuilderHostToolbarExtensionsValidationError(result.issues)
  }
  return result.extensions
}
