import type {
  PageBuilderCmsAssetCounts,
  PageBuilderCmsAssetHint,
  PageBuilderCmsCatalog,
  PageBuilderCmsCatalogDetail,
  PageBuilderCmsCatalogList,
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
  PageBuilderCmsContentShape,
  PageBuilderCmsContentSummary,
} from '@proma/shared'
import type { PageBuilderCmsConfig } from './page-builder-cms-config'

export type CmsCatalogQuery = PageBuilderCmsCatalogQuery
export type CmsContentQuery = PageBuilderCmsContentQuery
export type NormalizedCmsCatalog = PageBuilderCmsCatalog
export type NormalizedCmsCatalogDetail = PageBuilderCmsCatalogDetail
export type NormalizedCmsAssetCounts = PageBuilderCmsAssetCounts
export type NormalizedCmsAssetHint = PageBuilderCmsAssetHint
export type CmsContentShape = PageBuilderCmsContentShape
export type NormalizedCmsContentSummary = PageBuilderCmsContentSummary
export type NormalizedCmsCatalogList = PageBuilderCmsCatalogList
export type NormalizedCmsContentList = PageBuilderCmsContentList

export class CmsGatewayError extends Error {
  constructor(
    readonly code: 'config' | 'auth' | 'upstream' | 'invalid_response',
    message: string,
  ) {
    super(message)
    this.name = 'CmsGatewayError'
  }
}

interface CmsGatewayOptions {
  config: PageBuilderCmsConfig
  fetchFn?: typeof fetch
}

export class CmsGateway {
  private readonly config: PageBuilderCmsConfig
  private readonly fetchFn: typeof fetch

  constructor(options: CmsGatewayOptions) {
    this.config = options.config
    this.fetchFn = options.fetchFn ?? fetch
  }

  async listCatalogs(query: CmsCatalogQuery = {}): Promise<NormalizedCmsCatalogList> {
    const payload = await this.requestJson('/ui/dimensions/1/catalogs', {
      contentType: query.contentType ?? '',
      searchKeyWord: query.searchKeyword ?? '',
    })

    const items = normalizeCatalogs(extractCatalogArray(payload))
    return {
      items,
      tree: buildCatalogTree(items),
    }
  }

  async getCatalogDetail(catalogId: string): Promise<NormalizedCmsCatalogDetail> {
    const payload = await this.requestJson(`/ui/catalogs/${encodeURIComponent(catalogId)}`, {})
    return normalizeCatalogDetail(payload, this.config.baseUrl)
  }

  async listContents(query: CmsContentQuery): Promise<NormalizedCmsContentList> {
    const payload = await this.requestJson('/ui/contentcore/contents', {
      catalogID: query.catalogId,
      contentSelectType: query.contentSelectType ?? '',
      keyWord: query.keyword ?? '',
      title: query.title ?? '',
      pageIndex: String(query.pageIndex ?? 0),
      pageSize: String(query.pageSize ?? 20),
    })

    return normalizeContentList(payload, query, this.config.baseUrl)
  }

  async fetchAsset(assetUrl: string): Promise<Response> {
    const resolvedAssetUrl = resolveCmsAssetUrl(this.config.baseUrl, assetUrl)
    if (!resolvedAssetUrl || !isCmsAssetUrlAllowed(this.config.baseUrl, resolvedAssetUrl)) {
      throw new CmsGatewayError('config', 'CMS 资源地址不合法')
    }

    const response = await this.fetchFn(resolvedAssetUrl, {
      method: 'GET',
      headers: {
        ...this.config.headers,
        Accept: 'image/*,*/*',
        Cookie: this.config.cookie,
      },
    })

    if (response.status === 401 || response.status === 403) {
      throw new CmsGatewayError('auth', 'CMS 鉴权失败，请检查宿主配置中的登录态是否有效')
    }

    if (!response.ok) {
      throw new CmsGatewayError('upstream', `CMS 资源请求失败（HTTP ${response.status}）`)
    }

    return response
  }

  private async requestJson(
    pathname: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(`${this.config.baseUrl}${pathname}`)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }

    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: {
        ...this.config.headers,
        Cookie: this.config.cookie,
      },
    })

    const rawText = await response.text()
    const payload = parseJsonSafely(rawText)
    const payloadStatus = payload && typeof payload === 'object'
      ? readNumber((payload as Record<string, unknown>).status)
      : undefined

    if (response.status === 401 || response.status === 403) {
      throw new CmsGatewayError('auth', 'CMS 鉴权失败，请检查宿主配置中的登录态是否有效')
    }

    if (response.ok && payloadStatus === 1) {
      return payload
    }

    const detail = sanitizeCmsErrorDetail(extractErrorMessage(payload) || rawText)

    if (looksLikeAuthFailure(payload, detail)) {
      throw new CmsGatewayError('auth', 'CMS 鉴权失败，请检查宿主配置中的登录态是否有效')
    }

    if (!response.ok) {
      throw new CmsGatewayError('upstream', detail
        ? `CMS 请求失败：${detail}`
        : `CMS 请求失败（HTTP ${response.status}）`)
    }

    if (payloadStatus !== undefined) {
      if (payloadStatus !== 1) {
        if (looksLikeAuthFailure(payload, detail)) {
          throw new CmsGatewayError('auth', 'CMS 鉴权失败，请检查宿主配置中的登录态是否有效')
        }

        throw new CmsGatewayError('upstream', detail
          ? `CMS 请求失败：${detail}`
          : 'CMS 请求失败，上游返回了非成功状态')
      }
    }

    return payload
  }
}

function parseJsonSafely(value: string): unknown {
  if (!value.trim()) {
    return {}
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return {}
  }
}

function looksLikeAuthFailure(payload: unknown, detail: string): boolean {
  const status = payload && typeof payload === 'object'
    ? readNumber((payload as Record<string, unknown>).status)
    : undefined
  const combined = detail.toLowerCase()

  return status === 401
    || combined.includes('unauthorized')
    || combined.includes('not logged in')
    || combined.includes('login')
    || combined.includes('鉴权')
    || combined.includes('权限')
  }

function sanitizeCmsErrorDetail(detail: string): string {
  return detail
    .replace(/ZUSID=[^;\s,]+/gi, 'ZUSID=[REDACTED]')
    .replace(/CurrentSite=[^;\s,]+/gi, 'CurrentSite=[REDACTED]')
    .replace(/cookie\s*=\s*[^,\n]+/gi, 'cookie=[REDACTED]')
    .replace(/authorization:\s*[^\s,]+/gi, 'authorization=[REDACTED]')
    .trim()
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const record = payload as Record<string, unknown>
  const candidates = [
    record.message,
    record.msg,
    record.error,
    readNestedValue(record, ['data', 'message']),
    readNestedValue(record, ['data', 'msg']),
    readNestedValue(record, ['error', 'message']),
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ''
}

function extractCatalogArray(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') {
    throw new CmsGatewayError('invalid_response', 'CMS 栏目响应格式不正确')
  }

  const record = payload as Record<string, unknown>
  const data = record.data
  if (Array.isArray(data)) {
    return data
  }

  if (Array.isArray(record.items)) {
    return record.items
  }

  throw new CmsGatewayError('invalid_response', 'CMS 栏目响应缺少 data 数组')
}

function normalizeCatalogs(items: unknown[]): NormalizedCmsCatalog[] {
  const tree = items
    .map((item) => normalizeCatalogNode(item))
    .filter((item): item is NormalizedCmsCatalog => item !== null)

  return flattenCatalogTree(tree)
}

function normalizeCatalogNode(item: unknown): NormalizedCmsCatalog | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const record = item as Record<string, unknown>
  const id = readString(record.ID ?? record.id)
  if (!id) {
    return null
  }

  const parentValue = readString(record.parentID ?? record.parentId)
  const parentId = !parentValue || parentValue === '0' ? null : parentValue
  const children = Array.isArray(record.children)
    ? record.children
        .map((child) => normalizeCatalogNode(child))
        .filter((child): child is NormalizedCmsCatalog => child !== null)
    : []

  return {
    id,
    name: readString(record.name) || '',
    parentId,
    path: readString(record.path) || '',
    contentType: readString(record.contentType) || '',
    contentTypeName: readString(record.contentTypeName) || '',
    hasChild: children.length > 0 || readBoolean(record.hasChild) || (readNumber(record.childCount) ?? 0) > 0,
    total: readNumber(record.total) ?? 0,
    children,
  }
}

function flattenCatalogTree(tree: NormalizedCmsCatalog[]): NormalizedCmsCatalog[] {
  const items: NormalizedCmsCatalog[] = []

  function visit(node: NormalizedCmsCatalog): void {
    items.push({
      ...node,
      children: [],
    })

    for (const child of node.children) {
      visit(child)
    }
  }

  for (const node of tree) {
    visit(node)
  }

  return items
}

function buildCatalogTree(items: NormalizedCmsCatalog[]): NormalizedCmsCatalog[] {
  const map = new Map<string, NormalizedCmsCatalog>()
  const clones = items.map((item) => ({ ...item, children: [] as NormalizedCmsCatalog[] }))
  for (const item of clones) {
    map.set(item.id, item)
  }

  const roots: NormalizedCmsCatalog[] = []
  for (const item of clones) {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)?.children.push(item)
      continue
    }
    roots.push(item)
  }

  return roots
}

function normalizeCatalogDetail(payload: unknown, baseUrl: string): NormalizedCmsCatalogDetail {
  if (!payload || typeof payload !== 'object') {
    throw new CmsGatewayError('invalid_response', 'CMS 栏目详情响应格式不正确')
  }

  const record = asRecord((payload as Record<string, unknown>).data) ?? asRecord(payload)
  if (!record) {
    throw new CmsGatewayError('invalid_response', 'CMS 栏目详情响应缺少 data 对象')
  }

  const id = readString(record.ID ?? record.id)
  if (!id) {
    throw new CmsGatewayError('invalid_response', 'CMS 栏目详情响应缺少栏目 ID')
  }

  const contentType = readString(record.contentType) || ''
  const logoUrl = resolveCmsAssetUrl(baseUrl, readString(record.logoSrc ?? record.logoFile))

  return {
    id,
    innerCode: readString(record.innerCode) || '',
    statusCode: readNumber(record.status) ?? null,
    statusLabel: resolveCatalogStatusLabel(readNumber(record.status)),
    name: readString(record.name) || '',
    alias: readString(record.alias) || '',
    contentType,
    contentTypeName: readString(record.contentTypeName) || resolveCatalogContentTypeName(contentType),
    description: readString(record.info) || '',
    ...(logoUrl ? { logoUrl } : {}),
  }
}

function normalizeContentList(
  payload: unknown,
  query: Pick<CmsContentQuery, 'pageIndex' | 'pageSize'>,
  baseUrl: string,
): NormalizedCmsContentList {
  if (!payload || typeof payload !== 'object') {
    throw new CmsGatewayError('invalid_response', 'CMS 内容响应格式不正确')
  }

  const root = payload as Record<string, unknown>
  const container = asRecord(root.data) ?? root
  const itemsRaw = extractContentArray(container)
  const items = itemsRaw
    .map((item) => normalizeContentItem(item, baseUrl))
    .filter((item): item is NormalizedCmsContentSummary => item !== null)

  const pageIndex = readNumber(container.pageIndex ?? container.pageNo ?? container.page) ?? query.pageIndex ?? 0
  const pageSize = readNumber(container.pageSize ?? container.size) ?? query.pageSize ?? items.length ?? 20
  const total = readNumber(container.total ?? container.totalCount ?? container.recordCount) ?? items.length

  return {
    pageIndex,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    items,
  }
}

function extractContentArray(container: Record<string, unknown>): unknown[] {
  const candidates = [
    container.list,
    container.rows,
    container.items,
    container.data,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  return []
}

function normalizeContentItem(item: unknown, baseUrl: string): NormalizedCmsContentSummary | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const record = item as Record<string, unknown>
  const id = readString(record.ID ?? record.id)
  const catalogId = readString(record.catalogID ?? record.catalogId)
  if (!id || !catalogId) {
    return null
  }

  const extendJson = parseExtendJson(record.extendJSON ?? record.extendJson)
  const assetHints = {
    images: extractAssetHints(extendJson, ['images', 'imageList', 'pictures']),
    audios: extractAssetHints(extendJson, ['audios', 'audioList', 'audio']),
    videos: extractAssetHints(extendJson, ['videos', 'videoList', 'video']),
    files: extractAssetHints(extendJson, ['files', 'attachments', 'fileList']),
  }

  const assetCounts = {
    images: readNumber(record.imagesTotal) ?? assetHints.images.length,
    audios: readNumber(record.audiosTotal ?? record.audioTotal) ?? assetHints.audios.length,
    videos: readNumber(record.videosTotal) ?? assetHints.videos.length,
    files: readNumber(record.filesTotal) ?? assetHints.files.length,
  }

  return {
    id,
    catalogId,
    title: readString(record.title) || '',
    summary: readString(record.summary ?? record.description ?? record.digest) || '',
    ...(resolveCmsAssetUrl(
      baseUrl,
      readString(record.listLogo ?? record.logoFile),
    ) ? {
      listLogoUrl: resolveCmsAssetUrl(baseUrl, readString(record.listLogo ?? record.logoFile))!,
    } : {}),
    ...(pickContentAddedAt(record) ? {
      addedAt: pickContentAddedAt(record)!,
    } : {}),
    publishUrl: readString(record.publishUrl ?? record.link ?? record.url) || '',
    shape: detectContentShape(assetCounts),
    assetCounts,
    assetHints,
  }
}

function detectContentShape(assetCounts: NormalizedCmsAssetCounts): CmsContentShape {
  const activeAssetTypes = [
    assetCounts.images > 0 ? 'images' : null,
    assetCounts.audios > 0 ? 'audios' : null,
    assetCounts.videos > 0 ? 'videos' : null,
    assetCounts.files > 0 ? 'files' : null,
  ].filter(Boolean)

  if (activeAssetTypes.length > 1) {
    return 'mixed'
  }

  if (assetCounts.images > 0) {
    return 'gallery'
  }

  if (assetCounts.videos > 0) {
    return 'video'
  }

  if (assetCounts.files > 0) {
    return 'file'
  }

  if (assetCounts.audios > 0) {
    return 'audio'
  }

  return 'single-article'
}

function parseExtendJson(value: unknown): Record<string, unknown> {
  if (!value) {
    return {}
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return asRecord(parsed) ?? {}
    } catch {
      return {}
    }
  }

  return asRecord(value) ?? {}
}

function extractAssetHints(
  extendJson: Record<string, unknown>,
  keys: string[],
): NormalizedCmsAssetHint[] {
  for (const key of keys) {
    const value = extendJson[key]
    if (!Array.isArray(value)) {
      continue
    }

    return value
      .map((item) => normalizeAssetHint(item))
      .filter((item): item is NormalizedCmsAssetHint => item !== null)
  }

  return []
}

function normalizeAssetHint(item: unknown): NormalizedCmsAssetHint | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const record = item as Record<string, unknown>
  const url = readString(record.url ?? record.src ?? record.link)
  const title = readString(record.title)
  const name = readString(record.name ?? record.fileName)
  const type = readString(record.type ?? record.mediaType)

  if (!url && !title && !name && !type) {
    return null
  }

  return {
    ...(url ? { url } : {}),
    ...(title ? { title } : {}),
    ...(name ? { name } : {}),
    ...(type ? { type } : {}),
  }
}

function resolveCmsAssetUrl(baseUrl: string, assetUrl: string | undefined): string | undefined {
  const trimmed = assetUrl?.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    if (baseUrl) {
      const base = new URL(baseUrl)
      if (trimmed.startsWith('/')) {
        const basePath = base.pathname.replace(/\/+$/, '')
        return `${base.origin}${basePath}${trimmed}`
      }

      return new URL(trimmed, base).toString()
    }

    return new URL(trimmed).toString()
  } catch {
    return undefined
  }
}

function isCmsAssetUrlAllowed(baseUrl: string, assetUrl: string): boolean {
  try {
    const base = new URL(baseUrl)
    const candidate = new URL(assetUrl)
    return base.origin === candidate.origin
  } catch {
    return false
  }
}

function resolveCatalogStatusLabel(statusCode: number | undefined): string {
  switch (statusCode) {
    case 20:
      return '启用'
    case 0:
      return '禁用'
    default:
      return '未知'
  }
}

function resolveCatalogContentTypeName(contentType: string): string {
  switch (contentType) {
    case 'Article':
      return '文章'
    case 'Image':
      return '图片'
    case 'Audio':
    case 'AudioGroup':
      return '音频'
    case 'Video':
    case 'VideoGroup':
      return '视频'
    case 'File':
      return '文件'
    case 'PageWeaver':
      return '专题'
    default:
      return contentType || ''
  }
}

function pickContentAddedAt(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.addTime,
    record.createTime,
    record.createDate,
    record.addDate,
    record.publishDate,
    record.publishTime,
  ]

  for (const candidate of candidates) {
    const formatted = formatCmsDateTime(readString(candidate))
    if (formatted) {
      return formatted
    }
  }

  return undefined
}

function formatCmsDateTime(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.replace('T', ' ').trim()
  const matched = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/)
  if (matched) {
    return `${matched[1]} ${matched[2]}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readNestedValue(record: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = record
  for (const key of path) {
    const next = asRecord(current)
    if (!next) {
      return undefined
    }
    current = next[key]
  }
  return current
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 'Y'
}
