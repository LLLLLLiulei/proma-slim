import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type {
  AgentEvent,
  PageBuilderCmsAssetImportResult,
  PageBuilderCmsConfirmedSelection,
  PageBuilderCmsDataSourceType,
  PageBuilderCmsSelectionResponse,
} from '@proma/shared'
import { getPageBuilderCmsBindingsPath } from './config-paths'

const PAGE_BUILDER_CMS_BINDINGS_VERSION = 1

const PAGE_BUILDER_CMS_SOURCE_TYPES = new Set<PageBuilderCmsDataSourceType>([
  'channel-node',
  'channel-children',
  'content-item',
  'content-list',
])

export interface PageBuilderCmsBindingEntry {
  selector: string
  sourceType: PageBuilderCmsDataSourceType
  stableId: string
  displayName: string
  renderHint: string | null
  snapshotAt: number
  channelId: string | null
  channelName: string | null
  catalogId: string | null
  contentId: string | null
  contentTypeId: string | null
  itemIds: string[]
  importedAssets: PageBuilderCmsAssetImportResult[]
}

export interface PageBuilderCmsBindingsFile {
  version: number
  updatedAt: number
  bindings: PageBuilderCmsBindingEntry[]
}

interface PendingBinding {
  selector: string
  selection: PageBuilderCmsConfirmedSelection
  importedAssets: PageBuilderCmsAssetImportResult[]
}

function createEmptyBindingsFile(): PageBuilderCmsBindingsFile {
  return {
    version: PAGE_BUILDER_CMS_BINDINGS_VERSION,
    updatedAt: 0,
    bindings: [],
  }
}

function readKeyValueBlock(rawBlock: string | null): Record<string, string> {
  if (!rawBlock) return {}

  const entries = rawBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(':')
      if (separatorIndex === -1) return null
      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim()
      return key ? [key, value] as const : null
    })
    .filter((entry): entry is readonly [string, string] => entry !== null)

  return Object.fromEntries(entries)
}

function extractTaggedBlock(message: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}>\\s*\\n([\\s\\S]*?)\\n</${tagName}>`)
  const match = message.match(pattern)
  return match?.[1]?.trim() ?? null
}

function extractSelectionFromComposedUserMessage(
  composedUserMessage: string | undefined,
): PendingBinding | null {
  if (!composedUserMessage?.trim()) return null

  const selectionBlock = readKeyValueBlock(extractTaggedBlock(composedUserMessage, 'page_builder_selection'))
  const cmsBlock = readKeyValueBlock(extractTaggedBlock(composedUserMessage, 'page_builder_cms_selection'))
  const selector = selectionBlock.selector?.trim()
  const sourceType = cmsBlock.sourceType?.trim() as PageBuilderCmsDataSourceType | undefined
  const stableId = cmsBlock.stableId?.trim()
  const displayName = cmsBlock.displayName?.trim()

  if (!selector || !sourceType || !PAGE_BUILDER_CMS_SOURCE_TYPES.has(sourceType) || !stableId || !displayName) {
    return null
  }

  const selection: PageBuilderCmsConfirmedSelection = {
    sourceType,
    stableId,
    displayName,
    selector,
    ...(cmsBlock.presentationHint ? { presentationHint: cmsBlock.presentationHint } : {}),
    ...(cmsBlock.channelId ? { channelId: cmsBlock.channelId } : {}),
    ...(cmsBlock.channelName ? { channelName: cmsBlock.channelName } : {}),
    ...(cmsBlock.catalogId ? { catalogId: cmsBlock.catalogId } : {}),
    ...(cmsBlock.contentId ? { contentId: cmsBlock.contentId } : {}),
    ...(cmsBlock.contentTypeId ? { contentTypeId: cmsBlock.contentTypeId } : {}),
    ...(cmsBlock.itemIds
      ? {
          itemIds: cmsBlock.itemIds
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        }
      : {}),
  }

  return {
    selector,
    selection,
    importedAssets: [],
  }
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function unwrapTextToolPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    const text = payload
      .filter((item): item is { type?: string; text?: string } => (
        !!item && typeof item === 'object'
      ))
      .map((item) => (item.type === 'text' && typeof item.text === 'string' ? item.text : ''))
      .join('\n')
      .trim()

    if (!text) {
      return payload
    }

    return tryParseJson(text) ?? text
  }

  if (payload && typeof payload === 'object' && 'content' in payload) {
    const content = (payload as { content?: unknown }).content
    if (Array.isArray(content)) {
      return unwrapTextToolPayload(content)
    }
  }

  return payload
}

function parseToolResultPayload(result: string): unknown {
  const trimmed = result.trim()
  if (!trimmed) return null

  const parsed = tryParseJson(trimmed)
  if (parsed === null) {
    return tryParseJson(trimmed.replace(/^```json\s*|\s*```$/g, '')) ?? trimmed
  }

  return unwrapTextToolPayload(parsed)
}

function isAssetImportResult(value: unknown): value is PageBuilderCmsAssetImportResult {
  return !!value
    && typeof value === 'object'
    && typeof (value as PageBuilderCmsAssetImportResult).relativePath === 'string'
    && typeof (value as PageBuilderCmsAssetImportResult).workspaceRelativePath === 'string'
    && typeof (value as PageBuilderCmsAssetImportResult).filename === 'string'
    && typeof (value as PageBuilderCmsAssetImportResult).bytes === 'number'
    && typeof (value as PageBuilderCmsAssetImportResult).mediaType === 'string'
}

function isConfirmedSelectionResponse(value: unknown): value is Extract<PageBuilderCmsSelectionResponse, { status: 'confirmed' }> {
  return !!value
    && typeof value === 'object'
    && (value as PageBuilderCmsSelectionResponse).status === 'confirmed'
    && !!(value as Extract<PageBuilderCmsSelectionResponse, { status: 'confirmed' }>).selection
}

function appendImportedAsset(target: PendingBinding, asset: PageBuilderCmsAssetImportResult): void {
  if (target.importedAssets.some((entry) => entry.workspaceRelativePath === asset.workspaceRelativePath)) {
    return
  }

  target.importedAssets.push(asset)
}

function ensurePendingBinding(
  pendingBindings: PendingBinding[],
  selection: PageBuilderCmsConfirmedSelection,
): PendingBinding | null {
  const selector = selection.selector?.trim()
  if (!selector || !selection.stableId.trim() || !selection.displayName.trim()) {
    return null
  }

  const existing = pendingBindings.find((entry) => entry.selector === selector)
  if (existing) {
    existing.selection = selection
    return existing
  }

  const next: PendingBinding = {
    selector,
    selection,
    importedAssets: [],
  }
  pendingBindings.push(next)
  return next
}

export function collectPageBuilderCmsBindingsFromAgentRun(input: {
  composedUserMessage?: string
  events: AgentEvent[]
}): PendingBinding[] {
  const pendingBindings: PendingBinding[] = []
  let activeBinding = extractSelectionFromComposedUserMessage(input.composedUserMessage)

  if (activeBinding) {
    pendingBindings.push(activeBinding)
  }

  for (const event of input.events) {
    if (event.type !== 'tool_result' || event.isError) {
      continue
    }

    if (event.toolName === 'RequestCmsSelection') {
      const payload = parseToolResultPayload(event.result)
      if (!isConfirmedSelectionResponse(payload)) {
        activeBinding = null
        continue
      }

      activeBinding = ensurePendingBinding(pendingBindings, payload.selection)
      continue
    }

    if (event.toolName === 'cms_import_asset_to_workspace' && activeBinding) {
      const payload = parseToolResultPayload(event.result)
      if (isAssetImportResult(payload)) {
        appendImportedAsset(activeBinding, payload)
      }
    }
  }

  return pendingBindings
}

export function readPageBuilderCmsBindings(workspaceSlug: string): PageBuilderCmsBindingsFile {
  const bindingsPath = getPageBuilderCmsBindingsPath(workspaceSlug)
  if (!existsSync(bindingsPath)) {
    return createEmptyBindingsFile()
  }

  try {
    const parsed = JSON.parse(readFileSync(bindingsPath, 'utf-8')) as Partial<PageBuilderCmsBindingsFile>
    return {
      version: typeof parsed.version === 'number' ? parsed.version : PAGE_BUILDER_CMS_BINDINGS_VERSION,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      bindings: Array.isArray(parsed.bindings) ? parsed.bindings as PageBuilderCmsBindingEntry[] : [],
    }
  } catch (error) {
    console.warn('[PageBuilderCMSBinding] 读取绑定元数据失败，回退为空文件:', error)
    return createEmptyBindingsFile()
  }
}

export function persistPageBuilderCmsBindingsFromAgentRun(input: {
  workspaceSlug: string
  composedUserMessage?: string
  events: AgentEvent[]
}): PageBuilderCmsBindingEntry[] {
  const pendingBindings = collectPageBuilderCmsBindingsFromAgentRun(input)
  if (pendingBindings.length === 0) {
    return []
  }

  const bindingsFile = readPageBuilderCmsBindings(input.workspaceSlug)
  const snapshotAt = Date.now()
  const nextBindings = [...bindingsFile.bindings]

  for (const pending of pendingBindings) {
    const nextEntry: PageBuilderCmsBindingEntry = {
      selector: pending.selector,
      sourceType: pending.selection.sourceType,
      stableId: pending.selection.stableId,
      displayName: pending.selection.displayName,
      renderHint: pending.selection.presentationHint ?? null,
      snapshotAt,
      channelId: pending.selection.channelId ?? null,
      channelName: pending.selection.channelName ?? null,
      catalogId: pending.selection.catalogId ?? null,
      contentId: pending.selection.contentId ?? null,
      contentTypeId: pending.selection.contentTypeId ?? null,
      itemIds: pending.selection.itemIds ?? [],
      importedAssets: pending.importedAssets,
    }

    const existingIndex = nextBindings.findIndex((entry) => entry.selector === nextEntry.selector)
    if (existingIndex === -1) {
      nextBindings.push(nextEntry)
    } else {
      nextBindings[existingIndex] = nextEntry
    }
  }

  const payload: PageBuilderCmsBindingsFile = {
    version: PAGE_BUILDER_CMS_BINDINGS_VERSION,
    updatedAt: snapshotAt,
    bindings: nextBindings,
  }

  writeFileSync(getPageBuilderCmsBindingsPath(input.workspaceSlug), JSON.stringify(payload, null, 2), 'utf-8')
  return pendingBindings.map((pending) => nextBindings.find((entry) => entry.selector === pending.selector)!).filter(Boolean)
}
