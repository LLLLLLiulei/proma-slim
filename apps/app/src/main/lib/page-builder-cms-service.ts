import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import type {
  PageBuilderCmsAssetImportResult,
  PageBuilderCmsChannel,
  PageBuilderCmsContent,
  PageBuilderCmsContentPage,
} from '@proma/shared'
import { HttpError } from '../http/errors'
import { getWorkspaceFilesDir } from './config-paths'
import { createPageBuilderCmsClient } from './page-builder-cms-client'
import { normalizePageBuilderCmsChannels, normalizePageBuilderCmsContentPage } from './page-builder-cms-normalizer'
import { getAgentWorkspace } from './workspace-service'

interface ListChannelsOptions {
  search?: string
}

interface ListContentsOptions {
  catalogId: string
  title?: string
  pageIndex?: number
  pageSize?: number
}

interface GetContentDetailOptions {
  catalogId: string
  contentId: string
}

interface ImportAssetOptions {
  workspaceId: string
  relativePath: string
}

function ensureAssetsDir(workspaceFilesDir: string): string {
  const dir = join(workspaceFilesDir, 'assets', 'cms')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function buildImportedAssetFilename(relativePath: string): string {
  const basename = posix.basename(relativePath)
  const digest = createHash('sha1').update(relativePath).digest('hex').slice(0, 12)
  return `${digest}-${basename}`
}

function getClient() {
  return createPageBuilderCmsClient()
}

export function createPageBuilderCmsService() {
  return {
    async listChannels(options: ListChannelsOptions = {}): Promise<PageBuilderCmsChannel[]> {
      const response = await getClient().listChannels(options)
      return normalizePageBuilderCmsChannels(response.data as Parameters<typeof normalizePageBuilderCmsChannels>[0])
    },

    async listChannelChildren(channelId: string): Promise<PageBuilderCmsChannel[]> {
      const channels = await this.listChannels()
      const queue = [...channels]
      while (queue.length > 0) {
        const current = queue.shift()
        if (!current) continue
        if (current.id === channelId) {
          return current.children
        }
        queue.push(...current.children)
      }

      return []
    },

    async listContents(options: ListContentsOptions): Promise<PageBuilderCmsContentPage> {
      const response = await getClient().listContents(options)
      return normalizePageBuilderCmsContentPage(
        response as Parameters<typeof normalizePageBuilderCmsContentPage>[0],
        (await import('./page-builder-cms-settings-service')).readPageBuilderCmsSettings(),
        options.pageIndex ?? 0,
        options.pageSize ?? 20,
      )
    },

    async getContentDetail(options: GetContentDetailOptions): Promise<PageBuilderCmsContent> {
      const page = await this.listContents({
        catalogId: options.catalogId,
        pageIndex: 0,
        pageSize: 100,
      })
      const content = page.items.find((item) => item.id === options.contentId)
      if (!content) {
        throw new HttpError(404, `CMS 内容不存在: ${options.contentId}`)
      }
      return content
    },

    async importAssetToWorkspace(options: ImportAssetOptions): Promise<PageBuilderCmsAssetImportResult> {
      const workspace = getAgentWorkspace(options.workspaceId)
      if (!workspace) {
        throw new HttpError(404, `工作区不存在: ${options.workspaceId}`)
      }

      const response = await getClient().fetchPreviewAsset(options.relativePath)
      const bytes = new Uint8Array(await response.arrayBuffer())
      const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
      const assetsDir = ensureAssetsDir(workspaceFilesDir)
      const storedFilename = buildImportedAssetFilename(options.relativePath)
      const workspaceRelativePath = `assets/cms/${storedFilename}`
      const absolutePath = join(assetsDir, storedFilename)

      if (!existsSync(dirname(absolutePath))) {
        mkdirSync(dirname(absolutePath), { recursive: true })
      }
      writeFileSync(absolutePath, bytes)

      return {
        relativePath: options.relativePath,
        workspaceRelativePath,
        filename: posix.basename(options.relativePath),
        bytes: bytes.byteLength,
        mediaType: response.headers.get('content-type') ?? 'application/octet-stream',
      }
    },
  }
}

export async function createPageBuilderCmsAssetPreviewResponse(relativePath: string): Promise<Response> {
  const upstream = await getClient().fetchPreviewAsset(relativePath)
  return new Response(upstream.body, {
    headers: {
      'cache-control': 'no-store',
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      ...(upstream.headers.get('content-length')
        ? { 'content-length': upstream.headers.get('content-length')! }
        : {}),
    },
  })
}
