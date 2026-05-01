import type {
  PageBuilderCmsCatalog,
  PageBuilderCmsCatalogDetail,
  PageBuilderCmsCatalogList,
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
  PageBuilderCmsContentSummary,
  PageBuilderCmsSiteSummary,
} from '@proma/shared'
import {
  CmsTokenProviderError,
  getSharedCmsTokenProvider,
  type CmsAuthorizationProvider,
} from './cms-token-provider'
import type { PageBuilderCmsConfig } from './page-builder-cms-config'
import {
  isAbsoluteHttpUrl,
  isAllowedCmsAssetUrl as isAllowedCmsAssetUrlShared,
  resolveCmsAssetUrl as resolveCmsAssetUrlShared,
} from './page-builder-asset-reference-utils'

const AUTH_FAILURE_MESSAGE = 'CMS 鉴权失败，请检查宿主配置中的账号密码是否正确'
const CATALOGS_PAGE_SIZE = 500
const CONTENTS_PAGE_SIZE = 100

export type CmsCatalogQuery = PageBuilderCmsCatalogQuery
export type CmsContentQuery = PageBuilderCmsContentQuery
export type NormalizedCmsCatalog = PageBuilderCmsCatalog
export type NormalizedCmsCatalogDetail = PageBuilderCmsCatalogDetail
export type NormalizedCmsContentSummary = PageBuilderCmsContentSummary
export type NormalizedCmsCatalogList = PageBuilderCmsCatalogList
export type NormalizedCmsContentList = PageBuilderCmsContentList
export type NormalizedCmsSiteSummary = PageBuilderCmsSiteSummary

export class CmsGatewayError extends Error {
  constructor(
    readonly code: 'config' | 'auth' | 'upstream' | 'invalid_response' | 'invalid_request',
    message: string,
  ) {
    super(message)
    this.name = 'CmsGatewayError'
  }
}

interface CmsGatewayOptions {
  config: PageBuilderCmsConfig
  fetchFn?: typeof fetch
  tokenProvider?: CmsAuthorizationProvider
}

interface CmsAssetResolutionContext {
  baseUrl: string
  defaultSiteId: string
  siteUrlById: Map<string, string>
}

type CmsSiteUrlMapLoader = () => Promise<Map<string, string>>

export class CmsGateway {
  private readonly config: PageBuilderCmsConfig
  private readonly fetchFn: typeof fetch
  private readonly tokenProvider: CmsAuthorizationProvider

  constructor(options: CmsGatewayOptions) {
    this.config = options.config
    this.fetchFn = options.fetchFn ?? fetch
    this.tokenProvider = options.tokenProvider ?? getSharedCmsTokenProvider({
      config: this.config,
      fetchFn: this.fetchFn,
    })
  }

  async listSites(): Promise<NormalizedCmsSiteSummary[]> {
    const payload = await this.requestJson('/api/sites', {})
    const items = extractSiteArray(payload)

    return items.map((item) => normalizeSiteSummary(item))
  }

  async listCatalogs(query: CmsCatalogQuery = {}): Promise<NormalizedCmsCatalogList> {
    const siteId = resolveSiteId(query.siteId)
    const ids = normalizeOrderedIds(query.ids)
    if (ids) {
      assertValidCatalogExactIdsQuery(query, ids)
      return this.listCatalogsByIds(siteId, ids)
    }

    const payload = await this.requestJson('/api/catalogsTree', {
      siteID: siteId,
      ...(query.contentType ? { contentType: query.contentType } : {}),
      ...(query.searchKeyword ? { keyword: query.searchKeyword } : {}),
    })

    const treeItems = extractCatalogArray(payload)
    if (treeItems.length === 0) {
      return {
        items: [],
        tree: [],
      }
    }

    const metadataItems = await this.fetchCatalogMetadata(siteId)
    const enrichedTreeItems = enrichCatalogTreeWithMetadata(treeItems, metadataItems)
    const assetContext = await this.createAssetResolutionContext(
      siteId,
      [...enrichedTreeItems, ...metadataItems],
      this.createSiteUrlMapLoader(),
    )
    const items = normalizeCatalogs(enrichedTreeItems, assetContext)
    return {
      items,
      tree: buildCatalogTree(items),
    }
  }

  async getCatalogDetail(catalogId: string, siteId?: string): Promise<NormalizedCmsCatalogDetail> {
    const resolvedSiteId = resolveSiteId(siteId)
    const items = await this.fetchCatalogMetadata(resolvedSiteId)
    const catalog = items.find((item) => readString(item.id ?? item.ID) === catalogId)

    if (!catalog) {
      throw new CmsGatewayError('invalid_response', `CMS 栏目详情不存在：${catalogId}`)
    }

    const assetContext = await this.createAssetResolutionContext(
      resolvedSiteId,
      [catalog],
      this.createSiteUrlMapLoader(),
    )
    return normalizeCatalogDetail(catalog, assetContext)
  }

  async listContents(query: CmsContentQuery): Promise<NormalizedCmsContentList> {
    const siteId = resolveSiteId(query.siteId)
    const ids = normalizeOrderedIds(query.ids)
    if (ids) {
      const catalogId = assertValidContentExactIdsQuery(query, ids)
      return this.listContentsByIds(siteId, catalogId, ids)
    }

    const catalogId = normalizeRequiredId(query.catalogId, 'catalogId')
    const payload = await this.requestJson(
      `/api/catalogs/${encodeURIComponent(catalogId)}/contents`,
      {
        siteID: siteId,
        pageIndex: String(query.pageIndex ?? 0),
        pageSize: String(query.pageSize ?? 20),
        loadextend: 'true',
        ...(query.keyword ? { keyword: query.keyword } : {}),
      },
    )

    const assetContext = await this.createAssetResolutionContext(
      siteId,
      [payload],
      this.createSiteUrlMapLoader(),
    )
    return normalizeContentList(payload, query, assetContext)
  }

  async fetchAsset(assetUrl: string): Promise<Response> {
    const resolvedAssetUrl = resolveCmsAssetUrl(this.config.baseUrl, assetUrl)
    if (!resolvedAssetUrl) {
      throw new CmsGatewayError('config', 'CMS 资源地址不合法')
    }

    let response: Response
    try {
      response = await this.fetchFn(resolvedAssetUrl, {
        method: 'GET',
      })
    } catch (error) {
      throw buildUpstreamGatewayError('CMS 资源请求失败', error)
    }

    if (response.status === 401 || response.status === 403) {
      throw new CmsGatewayError('auth', AUTH_FAILURE_MESSAGE)
    }

    if (!response.ok) {
      throw new CmsGatewayError('upstream', `CMS 资源请求失败（HTTP ${response.status}）`)
    }

    return response
  }

  private async fetchCatalogMetadata(siteId: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = []
    let pageIndex = 0

    while (true) {
      const payload = await this.requestJson('/api/catalogs', {
        siteID: siteId,
        level: 'All',
        pageIndex: String(pageIndex),
        pageSize: String(CATALOGS_PAGE_SIZE),
      })
      const root = asRecord(payload)
      const pageItems = extractCatalogArray(payload)
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
      items.push(...pageItems)

      const total = readNumber(root?.total)
        ?? readNumber(asRecord(root?.data)?.total)

      if (
        pageItems.length === 0
        || pageItems.length < CATALOGS_PAGE_SIZE
        || (total !== undefined && items.length >= total)
      ) {
        return items
      }

      pageIndex += 1
    }
  }

  private async listCatalogsByIds(
    siteId: string,
    ids: string[],
  ): Promise<NormalizedCmsCatalogList> {
    const records = (
      await Promise.all(ids.map((catalogId) => this.fetchCatalogById(siteId, catalogId)))
    ).flatMap((item) => item ? [item] : [])
    const assetContext = await this.createAssetResolutionContext(
      siteId,
      records,
      this.createSiteUrlMapLoader(),
    )
    const items = records.flatMap((item) => {
      if (!item) {
        return []
      }

      const normalized = normalizeCatalogNode(item, assetContext)
      return normalized ? [stripCatalogChildren(normalized)] : []
    })

    return {
      items,
      tree: items.map((item) => ({ ...item, children: [] })),
    }
  }

  private async fetchCatalogById(
    siteId: string,
    catalogId: string,
  ): Promise<Record<string, unknown> | null> {
    const payload = await this.requestJson('/api/catalogs', {
      siteID: siteId,
      id: catalogId,
      level: 'CurrentAndChild',
    })

    return findCatalogRecord(payload, catalogId)
  }

  private async listContentsByIds(
    siteId: string,
    catalogId: string,
    ids: string[],
  ): Promise<NormalizedCmsContentList> {
    const targetIds = new Set(ids)
    const itemsById = new Map<string, NormalizedCmsContentSummary>()
    const loadSiteUrlMap = this.createSiteUrlMapLoader()
    let pageIndex = 0

    while (true) {
      const payload = await this.requestJson(
        `/api/catalogs/${encodeURIComponent(catalogId)}/contents`,
        {
          siteID: siteId,
          pageIndex: String(pageIndex),
          pageSize: String(CONTENTS_PAGE_SIZE),
          loadextend: 'true',
        },
      )
      const assetContext = await this.createAssetResolutionContext(siteId, [payload], loadSiteUrlMap)
      const page = normalizeContentList(payload, {
        pageIndex,
        pageSize: CONTENTS_PAGE_SIZE,
      }, assetContext)

      for (const item of page.items) {
        if (targetIds.has(item.id) && item.catalogId === catalogId) {
          itemsById.set(item.id, item)
        }
      }

      if (itemsById.size >= targetIds.size) {
        break
      }

      if (
        page.items.length === 0
        || page.items.length < CONTENTS_PAGE_SIZE
        || (page.pageIndex + 1) * page.pageSize >= page.total
      ) {
        break
      }

      pageIndex += 1
    }

    const items = ids.flatMap((contentId) => {
      const item = itemsById.get(contentId)
      return item ? [item] : []
    })

    return {
      pageIndex: 0,
      pageSize: items.length,
      total: items.length,
      totalPages: 1,
      items,
    }
  }

  private async requestJson(
    pathname: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(`${this.config.baseUrl}${pathname}`)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }

    let authorizationHeader: string
    try {
      authorizationHeader = await this.tokenProvider.getAuthorizationHeader()
    } catch (error) {
      if (error instanceof CmsTokenProviderError) {
        throw new CmsGatewayError(error.code, error.message)
      }
      throw error
    }

    let response: Response
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: authorizationHeader,
        },
      })
    } catch (error) {
      throw buildUpstreamGatewayError('CMS 请求失败', error)
    }

    const rawText = await response.text()
    const payload = parseJsonSafely(rawText)
    const payloadStatus = payload && typeof payload === 'object'
      ? readNumber((payload as Record<string, unknown>).status)
      : undefined

    if (response.status === 401 || response.status === 403) {
      throw new CmsGatewayError('auth', AUTH_FAILURE_MESSAGE)
    }

    if (response.ok && payloadStatus === 1) {
      return payload
    }

    const detail = sanitizeCmsErrorDetail(extractErrorMessage(payload) || rawText)

    if (looksLikeAuthFailure(payload, detail)) {
      throw new CmsGatewayError('auth', AUTH_FAILURE_MESSAGE)
    }

    if (!response.ok) {
      throw new CmsGatewayError(
        'upstream',
        detail ? `CMS 请求失败：${detail}` : `CMS 请求失败（HTTP ${response.status}）`,
      )
    }

    if (payloadStatus !== undefined && payloadStatus !== 1) {
      throw new CmsGatewayError(
        'upstream',
        detail ? `CMS 请求失败：${detail}` : 'CMS 请求失败，上游返回了非成功状态',
      )
    }

    return payload
  }

  private createSiteUrlMapLoader(): CmsSiteUrlMapLoader {
    let promise: Promise<Map<string, string>> | undefined

    return () => {
      promise ??= this.loadSiteUrlMap()
      return promise
    }
  }

  private async loadSiteUrlMap(): Promise<Map<string, string>> {
    const payload = await this.requestJson('/api/sites', {})
    const siteUrlById = new Map<string, string>()

    for (const item of extractSiteArray(payload)) {
      const site = normalizeSiteSummary(item)
      const siteUrl = normalizeCmsSiteUrl(site.url)
      if (siteUrl) {
        siteUrlById.set(site.id, siteUrl)
      }
    }

    return siteUrlById
  }

  private async createAssetResolutionContext(
    defaultSiteId: string,
    candidates: unknown[],
    loadSiteUrlMap: CmsSiteUrlMapLoader,
  ): Promise<CmsAssetResolutionContext> {
    const needsSiteUrl = candidates.some(containsRelativeCmsCoverAsset)
    return {
      baseUrl: this.config.baseUrl,
      defaultSiteId,
      siteUrlById: needsSiteUrl ? await loadSiteUrlMap() : new Map(),
    }
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
    .replace(/authorization\s*[:=]?\s*bearer\s+[^\s,;]+/gi, 'authorization=[REDACTED]')
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/username\s*[:=]\s*[^\s,;]+/gi, 'username=[REDACTED]')
    .replace(/password\s*[:=]\s*[^\s,;]+/gi, 'password=[REDACTED]')
    .trim()
}

function buildUpstreamGatewayError(prefix: string, error: unknown): CmsGatewayError {
  const detail = sanitizeCmsErrorDetail(extractUnknownErrorMessage(error))
  return new CmsGatewayError(
    'upstream',
    detail ? `${prefix}：${detail}` : prefix,
  )
}

function extractUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return ''
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
  const root = asRecord(payload)
  if (!root) {
    throw new CmsGatewayError('invalid_response', 'CMS 栏目响应格式不正确')
  }

  const data = root.data
  if (Array.isArray(data)) {
    return data
  }

  const container = asRecord(data)
  if (Array.isArray(container?.data)) {
    return container.data
  }

  if (Array.isArray(root.items)) {
    return root.items
  }

  throw new CmsGatewayError('invalid_response', 'CMS 栏目响应缺少 data 数组')
}

function extractSiteArray(payload: unknown): unknown[] {
  const root = asRecord(payload)
  if (!root) {
    throw new CmsGatewayError('invalid_response', 'CMS 站点响应格式不正确')
  }

  if (Array.isArray(root.data)) {
    return root.data
  }

  throw new CmsGatewayError('invalid_response', 'CMS 站点响应缺少 data 数组')
}

function enrichCatalogTreeWithMetadata(
  treeItems: unknown[],
  metadataItems: Record<string, unknown>[],
): unknown[] {
  const metadataById = new Map<string, Record<string, unknown>>()
  for (const metadata of metadataItems) {
    const id = readString(metadata.ID ?? metadata.id)
    if (id) {
      metadataById.set(id, metadata)
    }
  }

  return treeItems.map((item) => enrichCatalogTreeNodeWithMetadata(item, metadataById))
}

function enrichCatalogTreeNodeWithMetadata(
  item: unknown,
  metadataById: Map<string, Record<string, unknown>>,
): unknown {
  const record = asRecord(item)
  if (!record) {
    return item
  }

  const id = readString(record.ID ?? record.id)
  const metadata = id ? metadataById.get(id) : undefined
  const children = Array.isArray(record.children)
    ? record.children.map((child) => enrichCatalogTreeNodeWithMetadata(child, metadataById))
    : record.children

  return {
    ...record,
    ...(metadata ?? {}),
    // The tree endpoint remains the hierarchy authority; metadata only enriches display/link fields.
    ...(record.ID !== undefined ? { ID: record.ID } : {}),
    ...(record.id !== undefined ? { id: record.id } : {}),
    ...(record.parentID !== undefined ? { parentID: record.parentID } : {}),
    ...(record.parentId !== undefined ? { parentId: record.parentId } : {}),
    ...(Array.isArray(record.children) ? { children } : {}),
  }
}

function normalizeSiteSummary(item: unknown): NormalizedCmsSiteSummary {
  const record = asRecord(item)
  if (!record) {
    throw new CmsGatewayError('invalid_response', 'CMS 站点条目格式不正确')
  }

  const id = readString(record.id ?? record.ID)
  const name = readString(record.name)
  const url = readString(record.url) ?? ''
  const branchInnerCode = readString(record.branchInnerCode) ?? ''

  if (!id || !name) {
    throw new CmsGatewayError('invalid_response', 'CMS 站点条目缺少 id 或 name')
  }

  return {
    id,
    name,
    url,
    parentId: normalizeParentId(record.parentId ?? record.parentID),
    branchInnerCode,
  }
}

function normalizeCmsSiteUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined
    }
    return url.toString()
  } catch {
    return undefined
  }
}

function resolveSiteId(siteId: string | undefined): string {
  const next = siteId?.trim()
  return next || '1'
}

function normalizeOrderedIds(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined
  }

  const normalized = value
    .map((entry) => entry.trim())
    .filter(Boolean)

  return normalized.length > 0 ? normalized : undefined
}

function readFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = readString(value)
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

function assertValidCatalogExactIdsQuery(query: CmsCatalogQuery, ids: string[]): void {
  if (ids.length === 0) {
    return
  }

  if (readString(query.contentType) || readString(query.searchKeyword)) {
    throw new CmsGatewayError('invalid_request', 'catalog ids 不能与 contentType 或 searchKeyword 混用')
  }
}

function assertValidContentExactIdsQuery(query: CmsContentQuery, ids: string[]): string {
  if (ids.length === 0) {
    throw new CmsGatewayError('invalid_request', 'content ids 不能为空')
  }

  const catalogId = readString(query.catalogId)
  if (!catalogId) {
    throw new CmsGatewayError('invalid_request', 'content ids 模式要求提供 catalogId')
  }

  if (
    readString(query.keyword)
    || query.pageIndex !== undefined
    || query.pageSize !== undefined
  ) {
    throw new CmsGatewayError('invalid_request', 'content ids 不能与 keyword、pageIndex 或 pageSize 混用')
  }

  return catalogId
}

function normalizeRequiredId(value: string | undefined, label: string): string {
  const normalized = readString(value)
  if (!normalized) {
    throw new CmsGatewayError('invalid_request', `${label} 不能为空`)
  }

  return normalized
}

function normalizeParentId(value: unknown): string | null {
  const parentValue = readString(value)
  return !parentValue || parentValue === '0' ? null : parentValue
}

function stripCatalogChildren(item: NormalizedCmsCatalog): NormalizedCmsCatalog {
  return {
    ...item,
    children: [],
  }
}

function containsRelativeCmsCoverAsset(candidate: unknown): boolean {
  const record = asRecord(candidate)
  if (!record) {
    return false
  }

  const assetUrl = readFirstString(
    record.logoFile,
    record.logoSrc,
    record.logoUrl,
    record.logo,
    record.listLogo,
  )
  if (assetUrl && !isAbsoluteHttpUrl(assetUrl)) {
    return true
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value) && value.some(containsRelativeCmsCoverAsset)) {
      return true
    }

    if (asRecord(value) && containsRelativeCmsCoverAsset(value)) {
      return true
    }
  }

  return false
}

function normalizeCatalogs(items: unknown[], assetContext: CmsAssetResolutionContext): NormalizedCmsCatalog[] {
  const tree = items
    .map((item) => normalizeCatalogNode(item, assetContext))
    .filter((item): item is NormalizedCmsCatalog => item !== null)

  return flattenCatalogTree(tree)
}

function normalizeCatalogNode(item: unknown, assetContext: CmsAssetResolutionContext): NormalizedCmsCatalog | null {
  const record = asRecord(item)
  if (!record) {
    return null
  }

  const id = readString(record.ID ?? record.id)
  if (!id) {
    return null
  }

  const parentValue = readString(record.parentID ?? record.parentId)
  const parentId = !parentValue || parentValue === '0' ? null : parentValue
  const logoUrl = resolveCmsCoverAssetUrl(
    assetContext,
    readFirstString(record.logoFile, record.logoSrc, record.logoUrl, record.logo),
    readString(record.siteID ?? record.siteId),
  )
  const children = Array.isArray(record.children)
    ? record.children
        .map((child) => normalizeCatalogNode(child, assetContext))
        .filter((child): child is NormalizedCmsCatalog => child !== null)
    : []

  return {
    id,
    name: readString(record.name) || '',
    parentId,
    path: readFirstString(record.listLink, record.link, record.url, record.path) || '',
    contentType: readString(record.contentType) || '',
    contentTypeName: readString(record.contentTypeName) || '',
    ...(logoUrl ? { logoUrl } : {}),
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

function normalizeCatalogDetail(
  item: Record<string, unknown>,
  assetContext: CmsAssetResolutionContext,
): NormalizedCmsCatalogDetail {
  const id = readString(item.ID ?? item.id)
  if (!id) {
    throw new CmsGatewayError('invalid_response', 'CMS 栏目详情响应缺少栏目 ID')
  }

  const contentType = readString(item.contentType) || ''
  const logoUrl = resolveCmsCoverAssetUrl(
    assetContext,
    readFirstString(item.logoFile, item.logoSrc),
    readString(item.siteID ?? item.siteId),
  )

  return {
    id,
    innerCode: readString(item.innerCode) || '',
    statusCode: readNumber(item.status) ?? null,
    statusLabel: resolveCatalogStatusLabel(readNumber(item.status)),
    name: readString(item.name) || '',
    alias: readString(item.alias) || '',
    contentType,
    contentTypeName: readString(item.contentTypeName) || resolveCatalogContentTypeName(contentType),
    description: readString(item.info) || '',
    ...(logoUrl ? { logoUrl } : {}),
  }
}

function normalizeContentList(
  payload: unknown,
  query: Pick<CmsContentQuery, 'pageIndex' | 'pageSize'>,
  assetContext: CmsAssetResolutionContext,
): NormalizedCmsContentList {
  const root = asRecord(payload)
  if (!root) {
    throw new CmsGatewayError('invalid_response', 'CMS 内容响应格式不正确')
  }

  const container = asRecord(root.data) ?? root
  const itemsRaw = extractContentArray(container)
  const items = itemsRaw
    .map((item) => normalizeContentItem(item, assetContext))
    .filter((item): item is NormalizedCmsContentSummary => item !== null)

  const pageIndex = readNumber(container.pageIndex ?? container.pageNo ?? container.page) ?? query.pageIndex ?? 0
  const pageSize = readNumber(container.pageSize ?? container.size) ?? query.pageSize ?? items.length ?? 20
  const total = readNumber(container.total ?? root.total ?? container.totalCount ?? container.recordCount) ?? items.length

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
    container.data,
    container.list,
    container.rows,
    container.items,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }

    const record = asRecord(candidate)
    if (record && readString(record.ID ?? record.id)) {
      return [record]
    }
  }

  return []
}

function findCatalogRecord(payload: unknown, catalogId: string): Record<string, unknown> | null {
  const root = asRecord(payload)
  if (!root) {
    throw new CmsGatewayError('invalid_response', 'CMS 栏目响应格式不正确')
  }

  return findMatchingRecord([
    root,
    root.data,
    asRecord(root.data)?.data,
    root.items,
  ], catalogId)
}

function findContentRecord(payload: unknown, contentId: string): Record<string, unknown> | null {
  const root = asRecord(payload)
  if (!root) {
    throw new CmsGatewayError('invalid_response', 'CMS 内容响应格式不正确')
  }

  const dataRecord = asRecord(root.data)

  return findMatchingRecord([
    root,
    root.data,
    dataRecord?.data,
    dataRecord?.items,
    dataRecord?.list,
    dataRecord?.rows,
    root.items,
    root.list,
    root.rows,
  ], contentId)
}

function findMatchingRecord(candidates: unknown[], id: string): Record<string, unknown> | null {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const record = asRecord(item)
        if (record && readString(record.ID ?? record.id) === id) {
          return record
        }
      }
      continue
    }

    const record = asRecord(candidate)
    if (record && readString(record.ID ?? record.id) === id) {
      return record
    }
  }

  return null
}

function normalizeContentItem(
  item: unknown,
  assetContext: CmsAssetResolutionContext,
): NormalizedCmsContentSummary | null {
  const record = asRecord(item)
  if (!record) {
    return null
  }

  const id = readString(record.ID ?? record.id)
  const catalogId = readString(record.catalogID ?? record.catalogId)
  if (!id || !catalogId) {
    return null
  }

  const logoUrl = resolveCmsCoverAssetUrl(
    assetContext,
    readFirstString(record.logoFile, record.listLogo),
    readString(record.siteID ?? record.siteId),
  )
  const addedAt = pickContentAddedAt(record)

  return {
    id,
    catalogId,
    title: readString(record.title) || '',
    summary: readString(record.summary ?? record.description ?? record.digest) || '',
    ...(logoUrl ? { listLogoUrl: logoUrl } : {}),
    ...(addedAt ? { addedAt } : {}),
    publishUrl: readFirstString(record.link, record.url, record.publishUrl) || '',
  }
}

function resolveCmsCoverAssetUrl(
  context: CmsAssetResolutionContext,
  assetUrl: string | undefined,
  siteId: string | undefined,
): string | undefined {
  const trimmed = assetUrl?.trim()
  if (!trimmed) {
    return undefined
  }

  if (isAbsoluteHttpUrl(trimmed)) {
    return trimmed
  }

  const siteBaseUrl = context.siteUrlById.get(siteId || context.defaultSiteId)
  if (siteBaseUrl) {
    try {
      const base = new URL(siteBaseUrl.endsWith('/') ? siteBaseUrl : `${siteBaseUrl}/`)
      return new URL(trimmed, base).toString()
    } catch {
      // Fall through to API baseUrl fallback below.
    }
  }

  const sharedResolved = resolveCmsAssetUrlShared(context.baseUrl, trimmed)
  if (sharedResolved) {
    return sharedResolved
  }

  try {
    const base = new URL(context.baseUrl.endsWith('/') ? context.baseUrl : `${context.baseUrl}/`)
    return new URL(trimmed, base).toString()
  } catch {
    return undefined
  }
}

function resolveCmsAssetUrl(baseUrl: string, assetUrl: string | undefined): string | undefined {
  const trimmed = assetUrl?.trim()
  if (!trimmed) {
    return undefined
  }

  const sharedResolved = resolveCmsAssetUrlShared(baseUrl, trimmed)
  if (sharedResolved) {
    return sharedResolved
  }

  try {
    const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
    return new URL(trimmed, base).toString()
  } catch {
    return undefined
  }
}

function isCmsAssetUrlAllowed(baseUrl: string, assetUrl: string): boolean {
  return isAllowedCmsAssetUrlShared(baseUrl, assetUrl)
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
