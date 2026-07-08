import { describe, expect, test } from 'bun:test'
import {
  BUILDER_SPLIT_STORAGE_KEY,
  BUILDER_SPLIT_GAP,
  BUILDER_SPLIT_RAIL_WIDTH,
  DEFAULT_BUILDER_SPLIT_RATIO,
  clampBuilderSplitRatio,
  deriveBuilderRightPreviewSplitRatioFromPointer,
  deriveBuilderSplitRatioFromPointer,
  readStoredBuilderSplitRatio,
  resolveBuilderDesktopTrackWidths,
  writeStoredBuilderSplitRatio,
} from './desktop-split'

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const state = new Map(Object.entries(initial))

  return {
    get length() {
      return state.size
    },
    clear() {
      state.clear()
    },
    getItem(key) {
      return state.get(key) ?? null
    },
    key(index) {
      return Array.from(state.keys())[index] ?? null
    },
    removeItem(key) {
      state.delete(key)
    },
    setItem(key, value) {
      state.set(key, value)
    },
  }
}

describe('desktop split helpers', () => {
  test('clamps the split ratio against preview and chat minimum widths', () => {
    expect(clampBuilderSplitRatio(0.2, 1200)).toBeGreaterThan(0.3)
    expect(clampBuilderSplitRatio(0.9, 1200)).toBeLessThan(0.8)
  })

  test('derives a clamped split ratio from a pointer position', () => {
    expect(deriveBuilderSplitRatioFromPointer(100, { left: 0, width: 1200 })).toBe(
      clampBuilderSplitRatio(100 / 1200, 1200),
    )
    expect(deriveBuilderSplitRatioFromPointer(1150, { left: 0, width: 1200 })).toBeLessThan(0.8)
  })

  test('derives a clamped split ratio when the preview pane is on the right', () => {
    expect(deriveBuilderRightPreviewSplitRatioFromPointer(300, { left: 0, width: 1200 })).toBe(
      clampBuilderSplitRatio(1 - (300 / 1200), 1200),
    )
    expect(deriveBuilderRightPreviewSplitRatioFromPointer(1150, { left: 0, width: 1200 })).toBeGreaterThan(0.28)
  })

  test('reads and writes the persisted builder split ratio', () => {
    const storage = createMemoryStorage()

    writeStoredBuilderSplitRatio(storage, DEFAULT_BUILDER_SPLIT_RATIO + 0.05)

    expect(readStoredBuilderSplitRatio(storage)).toBe(DEFAULT_BUILDER_SPLIT_RATIO + 0.05)
    expect(storage.getItem(BUILDER_SPLIT_STORAGE_KEY)).not.toBeNull()
  })

  test('drops malformed persisted ratios', () => {
    const storage = createMemoryStorage({
      [BUILDER_SPLIT_STORAGE_KEY]: 'not-a-number',
    })

    expect(readStoredBuilderSplitRatio(storage)).toBeNull()
    expect(storage.getItem(BUILDER_SPLIT_STORAGE_KEY)).toBeNull()
  })

  test('resolves pixel track widths that fully occupy the desktop grid width', () => {
    const layout = resolveBuilderDesktopTrackWidths(0.75, 1408)

    expect(layout.chatWidth).toBeGreaterThanOrEqual(360)
    expect(layout.previewWidth).toBeGreaterThanOrEqual(420)
    expect(layout.previewWidth + layout.chatWidth + BUILDER_SPLIT_RAIL_WIDTH + BUILDER_SPLIT_GAP * 2).toBe(1408)
  })
})
