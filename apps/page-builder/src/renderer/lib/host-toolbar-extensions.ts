import {
  PAGE_BUILDER_HOST_PARENT_SOURCE,
  PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION,
  PAGE_BUILDER_HOST_TOOLBAR_LABEL_MAX_LENGTH,
  PAGE_BUILDER_HOST_TOOLBAR_TOOLTIP_MAX_LENGTH,
  normalizePageBuilderHostToolbarExtensions,
  type PageBuilderHostParentMessage,
  type PageBuilderHostToolbarButton,
  type PageBuilderHostToolbarExtensions,
} from '@ai-page-builder/shared'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePatchText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function normalizePatchHexColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed.toLowerCase() : null
}

function isPageBuilderHostParentMessage(value: unknown): value is PageBuilderHostParentMessage {
  if (!isRecord(value)) {
    return false
  }

  if (
    value.source !== PAGE_BUILDER_HOST_PARENT_SOURCE
    || value.version !== PAGE_BUILDER_HOST_TOOLBAR_EXTENSION_PROTOCOL_VERSION
  ) {
    return false
  }

  if (value.type === 'toolbar-buttons-set') {
    return true
  }

  return value.type === 'toolbar-button-update'
    && typeof value.buttonId === 'string'
    && isRecord(value.patch)
}

export function readPageBuilderHostParentMessage(
  event: MessageEvent<unknown>,
  parentWindow: Window | null | undefined,
  expectedOrigin: string | null | undefined,
): PageBuilderHostParentMessage | null {
  if (!parentWindow || !expectedOrigin) {
    return null
  }

  if (event.source !== parentWindow || event.origin !== expectedOrigin) {
    return null
  }

  return isPageBuilderHostParentMessage(event.data) ? event.data : null
}

export function normalizeHostToolbarExtensions(
  value: unknown,
): PageBuilderHostToolbarExtensions {
  return normalizePageBuilderHostToolbarExtensions(value)
}

export function normalizeHostToolbarButtonsFromMessage(
  buttons: unknown,
): PageBuilderHostToolbarExtensions {
  return normalizePageBuilderHostToolbarExtensions({ buttons })
}

export function applyHostToolbarButtonPatch(
  buttons: readonly PageBuilderHostToolbarButton[],
  buttonId: string,
  patch: unknown,
): PageBuilderHostToolbarButton[] {
  if (!isRecord(patch)) {
    return [...buttons]
  }

  let matched = false
  const nextButtons = buttons.map((button) => {
    if (button.id !== buttonId) {
      return button
    }

    matched = true
    const next: PageBuilderHostToolbarButton = { ...button }

    const label = normalizePatchText(patch.label, PAGE_BUILDER_HOST_TOOLBAR_LABEL_MAX_LENGTH)
    if (label) {
      next.label = label
    }

    const tooltip = normalizePatchText(patch.tooltip, PAGE_BUILDER_HOST_TOOLBAR_TOOLTIP_MAX_LENGTH)
    if (tooltip) {
      next.tooltip = tooltip
    }

    const themeColor = normalizePatchHexColor(patch.themeColor)
    if (themeColor) {
      next.themeColor = themeColor
    }

    const textColor = normalizePatchHexColor(patch.textColor)
    if (textColor) {
      next.textColor = textColor
    }

    for (const field of ['disabled', 'busy', 'hidden'] as const) {
      if (typeof patch[field] === 'boolean') {
        next[field] = patch[field]
      }
    }

    return next
  })

  return matched ? nextButtons : [...buttons]
}
