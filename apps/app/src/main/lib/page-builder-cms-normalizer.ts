import { posix } from 'node:path'
import type {
  PageBuilderCmsAsset,
  PageBuilderCmsChannel,
  PageBuilderCmsContent,
  PageBuilderCmsContentPage,
  PageBuilderCmsSettings,
} from '@proma/shared'
import { extractPageBuilderCmsRelativePath } from './page-builder-cms-settings-service'

interface RawCmsChannel {
  ID: number | string
  parentID?: number | string | null
  siteID?: number | string
  path?: string
  name?: string
  alias?: string | null
  contentType?: string | null
  contentTypeName?: string | null
  type?: string
  treeLevel?: number
  total?: number
  childCount?: number
  hasChild?: boolean
  link?: string | null
  children?: RawCmsChannel[]
}

interface RawCmsContent {
  ID: number | string
  catalogID?: number | string
  mainCatalogID?: number | string
  title?: string
  summary?: string | null
  publishDate?: string | null
  publishUrl?: string | null
  contentTypeID?: string
  bodyText?: string | null
  listLogo?: string | null
  imagesTotal?: number
  videosTotal?: number
  audiosTotal?: number
  filesTotal?: number
  extendJSON?: string | Record<string, unknown> | null
}

interface RawCmsContentPage {
  total?: number
  data?: RawCmsContent[]
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}

function parseExtendData(
  value: RawCmsContent['extendJSON'],
): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

function buildRelativePathFromParts(path: unknown, filename: unknown): string | null {
  if (typeof path !== 'string' || !path.trim() || typeof filename !== 'string' || !filename.trim()) {
    return null
  }

  return `${path.replace(/\/+$/, '')}/${filename.replace(/^\/+/, '')}`
}

function toAsset(
  kind: PageBuilderCmsAsset['kind'],
  relativePath: string,
  overrides?: Partial<PageBuilderCmsAsset>,
): PageBuilderCmsAsset {
  return {
    kind,
    relativePath,
    filename: overrides?.filename ?? posix.basename(relativePath),
    ...(overrides?.title !== undefined ? { title: overrides.title } : {}),
    ...(overrides?.sizeLabel !== undefined ? { sizeLabel: overrides.sizeLabel } : {}),
    ...(overrides?.width !== undefined ? { width: overrides.width } : {}),
    ...(overrides?.height !== undefined ? { height: overrides.height } : {}),
    ...(overrides?.durationSeconds !== undefined ? { durationSeconds: overrides.durationSeconds } : {}),
  }
}

function collectAssets(
  contentTypeId: string,
  extendData: Record<string, unknown> | null,
  settings: PageBuilderCmsSettings,
): PageBuilderCmsAsset[] {
  if (!extendData) return []

  const assets: PageBuilderCmsAsset[] = []

  const firstImagePath = extractPageBuilderCmsRelativePath(
    typeof extendData.firstImage === 'string' ? extendData.firstImage : null,
    settings,
  )
  if (firstImagePath) {
    assets.push(toAsset('image', firstImagePath))
  }

  if (Array.isArray(extendData.images)) {
    for (const item of extendData.images) {
      const image = item as Record<string, unknown>
      const relativePath = buildRelativePathFromParts(image.path, image.fileName)
      if (!relativePath) continue

      assets.push(toAsset('image', relativePath, {
        filename: typeof image.oldFileName === 'string' && image.oldFileName.trim()
          ? image.oldFileName.trim()
          : undefined,
        title: typeof image.name === 'string' ? image.name : null,
        sizeLabel: typeof image.fileSize === 'string' ? image.fileSize : null,
        width: typeof image.width === 'number' ? image.width : null,
        height: typeof image.height === 'number' ? image.height : null,
      }))
    }
  }

  const mediaFilePath = buildRelativePathFromParts(extendData.path, extendData.fileName)
  if (mediaFilePath) {
    const kind = contentTypeId === 'Video'
      ? 'video'
      : contentTypeId === 'Audio'
        ? 'audio'
        : 'file'

    assets.push(toAsset(kind, mediaFilePath, {
      filename: typeof extendData.oldFileName === 'string' && extendData.oldFileName.trim()
        ? extendData.oldFileName.trim()
        : undefined,
      sizeLabel: typeof extendData.fileSize === 'string' ? extendData.fileSize : null,
      durationSeconds: typeof extendData.duration === 'number' ? extendData.duration : null,
      width: typeof extendData.width === 'number' ? extendData.width : null,
      height: typeof extendData.height === 'number' ? extendData.height : null,
    }))
  }

  const deduped = new Map<string, PageBuilderCmsAsset>()
  for (const asset of assets) {
    if (!deduped.has(asset.relativePath)) {
      deduped.set(asset.relativePath, asset)
    }
  }

  return [...deduped.values()]
}

export function normalizePageBuilderCmsChannels(rawChannels: RawCmsChannel[]): PageBuilderCmsChannel[] {
  return rawChannels.map((channel) => ({
    id: normalizeRequiredString(channel.ID),
    parentId: channel.parentID === null || channel.parentID === undefined || Number(channel.parentID) === 0
      ? null
      : normalizeRequiredString(channel.parentID),
    siteId: normalizeRequiredString(channel.siteID),
    name: normalizeRequiredString(channel.name),
    alias: normalizeOptionalString(channel.alias),
    path: normalizeRequiredString(channel.path),
    contentType: normalizeOptionalString(channel.contentType),
    contentTypeName: normalizeOptionalString(channel.contentTypeName),
    channelType: normalizeRequiredString(channel.type),
    treeLevel: typeof channel.treeLevel === 'number' ? channel.treeLevel : 0,
    total: typeof channel.total === 'number' ? channel.total : 0,
    childCount: typeof channel.childCount === 'number' ? channel.childCount : 0,
    hasChild: channel.hasChild === true,
    link: normalizeOptionalString(channel.link),
    children: normalizePageBuilderCmsChannels(channel.children ?? []),
  }))
}

export function normalizePageBuilderCmsContentPage(
  rawPage: RawCmsContentPage,
  settings: PageBuilderCmsSettings,
  pageIndex = 0,
  pageSize = 20,
): PageBuilderCmsContentPage {
  const items: PageBuilderCmsContent[] = (rawPage.data ?? []).map((item) => {
    const contentTypeId = normalizeRequiredString(item.contentTypeID)
    const extendData = parseExtendData(item.extendJSON)
    const assets = collectAssets(contentTypeId, extendData, settings)
    const previewAssetRelativePath = extractPageBuilderCmsRelativePath(item.listLogo ?? null, settings)

    return {
      id: normalizeRequiredString(item.ID),
      catalogId: normalizeRequiredString(item.catalogID),
      mainCatalogId: normalizeRequiredString(item.mainCatalogID ?? item.catalogID),
      title: normalizeRequiredString(item.title),
      summary: normalizeOptionalString(item.summary),
      publishDate: normalizeOptionalString(item.publishDate),
      publishUrl: normalizeOptionalString(item.publishUrl),
      contentTypeId,
      bodyText: normalizeOptionalString(item.bodyText),
      richTitle: normalizeOptionalString(typeof extendData?.richTitle === 'string' ? extendData.richTitle : null),
      previewAsset: previewAssetRelativePath
        ? toAsset('image', previewAssetRelativePath)
        : assets[0] ?? null,
      assets,
      mediaCounts: {
        images: typeof item.imagesTotal === 'number' ? item.imagesTotal : 0,
        videos: typeof item.videosTotal === 'number' ? item.videosTotal : 0,
        audios: typeof item.audiosTotal === 'number' ? item.audiosTotal : 0,
        files: typeof item.filesTotal === 'number' ? item.filesTotal : 0,
      },
      extendData,
    }
  })

  return {
    total: typeof rawPage.total === 'number' ? rawPage.total : items.length,
    pageIndex,
    pageSize,
    items,
  }
}
