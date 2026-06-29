export const PAGE_BUILDER_TOOLBAR_ITEM_KEYS = [
  'pcPreview',
  'mobilePreview',
  'select',
  'export',
  'refresh',
  'saveTemplate',
  'openInNewWindow',
  'chatTab',
  'codeTab',
  'projectName',
] as const

export type PageBuilderToolbarItemKey = typeof PAGE_BUILDER_TOOLBAR_ITEM_KEYS[number]
export type PageBuilderPreviewDeviceMode = 'desktop' | 'mobile'
export type PageBuilderRightPanelTab = 'chat' | 'code'
export type PageBuilderHiddenToolbarItemsInput = unknown

const PAGE_BUILDER_TOOLBAR_ITEM_KEY_SET = new Set<string>(PAGE_BUILDER_TOOLBAR_ITEM_KEYS)

function isPageBuilderToolbarItemKeyArray(
  value: readonly PageBuilderToolbarItemKey[] | ReadonlySet<PageBuilderToolbarItemKey>,
): value is readonly PageBuilderToolbarItemKey[] {
  return Array.isArray(value)
}

export function isPageBuilderToolbarItemKey(value: unknown): value is PageBuilderToolbarItemKey {
  return typeof value === 'string' && PAGE_BUILDER_TOOLBAR_ITEM_KEY_SET.has(value)
}

export function normalizePageBuilderHiddenToolbarItems(
  value: PageBuilderHiddenToolbarItemsInput,
): PageBuilderToolbarItemKey[] {
  const rawItems = typeof value === 'string'
    ? value.split(',')
    : Array.isArray(value)
      ? value
      : []
  const hiddenItems: PageBuilderToolbarItemKey[] = []
  const seen = new Set<PageBuilderToolbarItemKey>()

  for (const rawItem of rawItems) {
    if (typeof rawItem !== 'string') continue

    const item = rawItem.trim()
    if (!isPageBuilderToolbarItemKey(item) || seen.has(item)) continue

    seen.add(item)
    hiddenItems.push(item)
  }

  return hiddenItems
}

export function parsePageBuilderHiddenToolbarItems(value: string | null | undefined): PageBuilderToolbarItemKey[] {
  return normalizePageBuilderHiddenToolbarItems(value)
}

export function isPageBuilderToolbarItemHidden(
  hiddenItems: readonly PageBuilderToolbarItemKey[] | ReadonlySet<PageBuilderToolbarItemKey>,
  key: PageBuilderToolbarItemKey,
): boolean {
  return isPageBuilderToolbarItemKeyArray(hiddenItems) ? hiddenItems.includes(key) : hiddenItems.has(key)
}

export function toPageBuilderHiddenToolbarItemSet(
  hiddenItems: readonly PageBuilderToolbarItemKey[] | ReadonlySet<PageBuilderToolbarItemKey>,
): ReadonlySet<PageBuilderToolbarItemKey> {
  return isPageBuilderToolbarItemKeyArray(hiddenItems) ? new Set(hiddenItems) : hiddenItems
}

export function getPageBuilderVisiblePreviewDeviceMode(
  currentMode: PageBuilderPreviewDeviceMode,
  hiddenItems: readonly PageBuilderToolbarItemKey[] | ReadonlySet<PageBuilderToolbarItemKey>,
): PageBuilderPreviewDeviceMode {
  const hiddenSet = toPageBuilderHiddenToolbarItemSet(hiddenItems)
  const desktopVisible = !hiddenSet.has('pcPreview')
  const mobileVisible = !hiddenSet.has('mobilePreview')

  if (desktopVisible && mobileVisible) return currentMode
  if (desktopVisible) return 'desktop'
  if (mobileVisible) return 'mobile'
  return 'desktop'
}

export function getPageBuilderVisibleRightPanelTab(
  currentTab: PageBuilderRightPanelTab,
  hiddenItems: readonly PageBuilderToolbarItemKey[] | ReadonlySet<PageBuilderToolbarItemKey>,
): PageBuilderRightPanelTab {
  const hiddenSet = toPageBuilderHiddenToolbarItemSet(hiddenItems)
  const chatVisible = !hiddenSet.has('chatTab')
  const codeVisible = !hiddenSet.has('codeTab')

  if (chatVisible && codeVisible) return currentTab
  if (chatVisible) return 'chat'
  if (codeVisible) return 'code'
  return 'chat'
}
