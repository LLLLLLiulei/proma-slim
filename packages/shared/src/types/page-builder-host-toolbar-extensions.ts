import type {
  AgentRunLifecyclePhase,
  AgentRunOutcome,
  AgentRunTrigger,
} from './agent'

export const PAGE_BUILDER_HOST_BRIDGE_SOURCE = 'page-builder-host-bridge'
export const PAGE_BUILDER_HOST_PARENT_SOURCE = 'page-builder-host-parent'
export const PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION = 1
export const PAGE_BUILDER_HOST_TOOLBAR_BUTTON_MAX_COUNT = 5
export const PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ID_MAX_LENGTH = 64
export const PAGE_BUILDER_HOST_TOOLBAR_LABEL_MAX_LENGTH = 16
export const PAGE_BUILDER_HOST_TOOLBAR_TOOLTIP_MAX_LENGTH = 80
export const PAGE_BUILDER_HOST_TOOLBAR_DROPDOWN_ITEM_MAX_COUNT = 8

export const PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ICONS = [
  'archive',
  'archive-restore',
  'arrow-left',
  'arrow-right',
  'badge-check',
  'bell',
  'book-open',
  'calendar',
  'calendar-clock',
  'check',
  'chevron-down',
  'chevron-right',
  'circle-alert',
  'circle-check',
  'clipboard',
  'clipboard-check',
  'clock',
  'cloud-download',
  'cloud-upload',
  'copy',
  'upload',
  'download',
  'edit',
  'ellipsis',
  'eye',
  'eye-off',
  'external-link',
  'file-archive',
  'file-down',
  'file-text',
  'file-up',
  'folder',
  'folder-open',
  'git-branch',
  'git-merge',
  'git-pull-request',
  'globe',
  'history',
  'home',
  'house',
  'image',
  'images',
  'info',
  'layout-template',
  'layers',
  'link',
  'link-2',
  'list',
  'list-checks',
  'lock',
  'logs',
  'mail',
  'message-square',
  'milestone',
  'minus',
  'monitor',
  'more-horizontal',
  'newspaper',
  'package',
  'package-open',
  'panel-top-open',
  'palette',
  'pause',
  'pencil',
  'play',
  'plus',
  'save',
  'scroll-text',
  'search',
  'send',
  'settings',
  'share-2',
  'shield-check',
  'sliders-horizontal',
  'smartphone',
  'square',
  'sparkles',
  'redo-2',
  'refresh',
  'rocket',
  'rotate-ccw',
  'route',
  'trash',
  'trash-2',
  'triangle-alert',
  'undo-2',
  'unlock',
  'user-check',
  'users',
  'wand-sparkles',
  'workflow',
  'x',
] as const

export const PAGE_BUILDER_HOST_TOOLBAR_BUTTON_VARIANTS = [
  'outline',
  'primary',
  'ghost',
  'destructive',
] as const

export type PageBuilderHostToolbarButtonIcon = typeof PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ICONS[number]
export type PageBuilderHostToolbarButtonVariant = typeof PAGE_BUILDER_HOST_TOOLBAR_BUTTON_VARIANTS[number]

interface PageBuilderHostToolbarButtonBase {
  id: string
  label: string
  tooltip?: string
  icon?: PageBuilderHostToolbarButtonIcon
  variant?: PageBuilderHostToolbarButtonVariant
  themeColor?: string
  textColor?: string
  disabled?: boolean
  busy?: boolean
  hidden?: boolean
  requiresPreview?: boolean
  order?: number
}

export interface PageBuilderHostToolbarActionButton extends PageBuilderHostToolbarButtonBase {
  type?: 'button'
}

export interface PageBuilderHostToolbarDropdownItem {
  id: string
  label: string
  tooltip?: string
  icon?: PageBuilderHostToolbarButtonIcon
  disabled?: boolean
  hidden?: boolean
  requiresPreview?: boolean
}

export interface PageBuilderHostToolbarDropdownButton extends PageBuilderHostToolbarButtonBase {
  type: 'dropdown'
  items: PageBuilderHostToolbarDropdownItem[]
}

export type PageBuilderHostToolbarButton =
  | PageBuilderHostToolbarActionButton
  | PageBuilderHostToolbarDropdownButton

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
    capabilities: Array<'toolbarExtensions.v1' | 'toolbarDropdowns.v1' | 'agentLifecycle.v1'>
    workspaceId: string
    sessionId: string
    projectId?: string
  }
  | {
    source: typeof PAGE_BUILDER_HOST_BRIDGE_SOURCE
    type: 'toolbar-button-click'
    version: typeof PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION
    buttonId: string
    itemId?: string
    workspaceId: string
    sessionId: string
    projectId?: string
    state: PageBuilderHostToolbarButtonClickState
  }
  | {
    source: typeof PAGE_BUILDER_HOST_BRIDGE_SOURCE
    type: 'agent-lifecycle'
    version: typeof PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION
    phase: AgentRunLifecyclePhase
    runId: string
    trigger: AgentRunTrigger
    occurredAt: number
    workspaceId: string
    sessionId: string
    projectId?: string
    outcome?: AgentRunOutcome
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
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

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

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null
}

function collectButtonInput(value: unknown): unknown[] {
  if (!isRecord(value)) return []
  return Array.isArray(value.buttons) ? value.buttons : []
}

function normalizeCommonButtonFields(
  value: unknown,
  index: number,
  strict: boolean,
  issues: PageBuilderHostToolbarExtensionsValidationIssue[],
): PageBuilderHostToolbarActionButton | null {
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
  const themeColor = normalizeHexColor(value.themeColor)
  if (themeColor) {
    button.themeColor = themeColor
  } else if (strict && value.themeColor !== undefined) {
    issues.push({ index, field: 'themeColor', message: 'themeColor 必须是 #RGB 或 #RRGGBB 格式的颜色值' })
  }
  const textColor = normalizeHexColor(value.textColor)
  if (textColor) {
    button.textColor = textColor
  } else if (strict && value.textColor !== undefined) {
    issues.push({ index, field: 'textColor', message: 'textColor 必须是 #RGB 或 #RRGGBB 格式的颜色值' })
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

function normalizeDropdownItem(
  value: unknown,
  buttonIndex: number,
  itemIndex: number,
  strict: boolean,
  issues: PageBuilderHostToolbarExtensionsValidationIssue[],
): PageBuilderHostToolbarDropdownItem | null {
  if (!isRecord(value)) {
    if (strict) {
      issues.push({ index: buttonIndex, field: `items.${itemIndex}`, message: 'dropdown item 必须是对象' })
    }
    return null
  }

  const id = normalizeTrimmedString(value.id, PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ID_MAX_LENGTH)
  if (!id || !BUTTON_ID_PATTERN.test(id)) {
    if (strict) {
      issues.push({ index: buttonIndex, field: `items.${itemIndex}.id`, message: 'dropdown item id 必须是非空安全字符串' })
    }
    return null
  }

  const label = normalizeTrimmedString(value.label, PAGE_BUILDER_HOST_TOOLBAR_LABEL_MAX_LENGTH)
  if (!label) {
    if (strict) {
      issues.push({ index: buttonIndex, field: `items.${itemIndex}.label`, message: 'dropdown item label 必须是非空字符串' })
    }
    return null
  }

  const item: PageBuilderHostToolbarDropdownItem = { id, label }

  const tooltip = normalizeTrimmedString(value.tooltip, PAGE_BUILDER_HOST_TOOLBAR_TOOLTIP_MAX_LENGTH)
  if (tooltip) {
    item.tooltip = tooltip
  }
  if (typeof value.icon === 'string' && ICON_SET.has(value.icon)) {
    item.icon = value.icon as PageBuilderHostToolbarButtonIcon
  } else if (strict && value.icon !== undefined) {
    issues.push({ index: buttonIndex, field: `items.${itemIndex}.icon`, message: 'dropdown item icon 不在白名单内' })
  }

  for (const field of ['disabled', 'hidden', 'requiresPreview'] as const) {
    if (typeof value[field] === 'boolean') {
      item[field] = value[field]
    } else if (strict && value[field] !== undefined) {
      issues.push({ index: buttonIndex, field: `items.${itemIndex}.${field}`, message: `${field} 必须是 boolean` })
    }
  }

  return item
}

function normalizeDropdownItems(
  value: unknown,
  buttonIndex: number,
  strict: boolean,
  issues: PageBuilderHostToolbarExtensionsValidationIssue[],
): PageBuilderHostToolbarDropdownItem[] {
  if (!Array.isArray(value)) {
    if (strict) {
      issues.push({ index: buttonIndex, field: 'items', message: 'dropdown items 必须是数组' })
    }
    return []
  }

  const seen = new Set<string>()
  const items: PageBuilderHostToolbarDropdownItem[] = []

  for (const [itemIndex, inputItem] of value.entries()) {
    const item = normalizeDropdownItem(inputItem, buttonIndex, itemIndex, strict, issues)
    if (!item) continue

    if (seen.has(item.id)) {
      if (strict) {
        issues.push({ index: buttonIndex, field: `items.${itemIndex}.id`, message: 'dropdown item id 不能重复' })
      }
      continue
    }

    seen.add(item.id)
    items.push(item)
  }

  if (strict && items.length > PAGE_BUILDER_HOST_TOOLBAR_DROPDOWN_ITEM_MAX_COUNT) {
    issues.push({ index: buttonIndex, field: 'items', message: `dropdown items 不能超过 ${PAGE_BUILDER_HOST_TOOLBAR_DROPDOWN_ITEM_MAX_COUNT} 个` })
  }

  return items.slice(0, PAGE_BUILDER_HOST_TOOLBAR_DROPDOWN_ITEM_MAX_COUNT)
}

function normalizeButton(
  value: unknown,
  index: number,
  strict: boolean,
  issues: PageBuilderHostToolbarExtensionsValidationIssue[],
): PageBuilderHostToolbarButton | null {
  const base = normalizeCommonButtonFields(value, index, strict, issues)
  if (!base || !isRecord(value)) {
    return base
  }

  if (value.type === undefined || value.type === 'button') {
    return base
  }

  if (value.type !== 'dropdown') {
    if (strict) {
      issues.push({ index, field: 'type', message: 'type 必须是 button 或 dropdown' })
      return null
    }
    return base
  }

  const items = normalizeDropdownItems(value.items, index, strict, issues)
  if (items.length === 0) {
    if (strict) {
      issues.push({ index, field: 'items', message: 'dropdown items 至少需要一个合法项' })
    }
    return null
  }

  return {
    ...base,
    type: 'dropdown',
    items,
  }
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
