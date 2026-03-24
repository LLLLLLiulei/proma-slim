export const BUILDER_SPLIT_STORAGE_KEY = 'page-builder.desktop-split-ratio'
export const DEFAULT_BUILDER_SPLIT_RATIO = 1.6 / (1.6 + 0.92)
export const BUILDER_SPLIT_RAIL_WIDTH = 12
export const BUILDER_SPLIT_GAP = 12

const MIN_PREVIEW_WIDTH = 420
const MIN_CHAT_WIDTH = 360
const ABSOLUTE_MIN_RATIO = 0.28
const ABSOLUTE_MAX_RATIO = 0.8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getAvailableTrackWidth(containerWidth?: number): number | null {
  if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0) return null
  return Math.max(containerWidth - BUILDER_SPLIT_RAIL_WIDTH - BUILDER_SPLIT_GAP * 2, 0)
}

export function clampBuilderSplitRatio(ratio: number, containerWidth?: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_BUILDER_SPLIT_RATIO

  const availableTrackWidth = getAvailableTrackWidth(containerWidth)
  if (!availableTrackWidth) {
    return clamp(ratio, ABSOLUTE_MIN_RATIO, ABSOLUTE_MAX_RATIO)
  }

  const minRatio = Math.max(ABSOLUTE_MIN_RATIO, MIN_PREVIEW_WIDTH / availableTrackWidth)
  const maxRatio = Math.min(ABSOLUTE_MAX_RATIO, 1 - (MIN_CHAT_WIDTH / availableTrackWidth))

  if (maxRatio <= minRatio) {
    return clamp(ratio, ABSOLUTE_MIN_RATIO, ABSOLUTE_MAX_RATIO)
  }

  return clamp(ratio, minRatio, maxRatio)
}

export function deriveBuilderSplitRatioFromPointer(
  clientX: number,
  rect: { left: number; width: number },
): number {
  if (!Number.isFinite(rect.width) || rect.width <= 0) {
    return DEFAULT_BUILDER_SPLIT_RATIO
  }

  return clampBuilderSplitRatio((clientX - rect.left) / rect.width, rect.width)
}

export function readStoredBuilderSplitRatio(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
): number | null {
  const raw = storage.getItem(BUILDER_SPLIT_STORAGE_KEY)
  if (!raw) return null

  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) {
    storage.removeItem(BUILDER_SPLIT_STORAGE_KEY)
    return null
  }

  return clampBuilderSplitRatio(parsed)
}

export function writeStoredBuilderSplitRatio(
  storage: Pick<Storage, 'setItem'>,
  ratio: number,
): void {
  storage.setItem(BUILDER_SPLIT_STORAGE_KEY, String(clampBuilderSplitRatio(ratio)))
}

export function resolveBuilderDesktopTrackWidths(
  ratio: number,
  containerWidth: number,
): {
  clampedRatio: number
  previewWidth: number
  chatWidth: number
} {
  const availableTrackWidth = getAvailableTrackWidth(containerWidth)
  if (!availableTrackWidth) {
    return {
      clampedRatio: DEFAULT_BUILDER_SPLIT_RATIO,
      previewWidth: 0,
      chatWidth: 0,
    }
  }

  const clampedRatio = clampBuilderSplitRatio(ratio, containerWidth)
  const previewWidth = Math.round(availableTrackWidth * clampedRatio)
  const chatWidth = availableTrackWidth - previewWidth

  return {
    clampedRatio,
    previewWidth,
    chatWidth,
  }
}
