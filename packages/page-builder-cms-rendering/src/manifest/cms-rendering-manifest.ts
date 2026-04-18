import type { CmsIslandComponentName } from '../template/scan-cms-islands-dom'
import type { CmsIslandPropValue } from '../template/scan-cms-islands-dom'

export const CMS_RENDERING_MANIFEST_VERSION = 1

export interface CmsRenderingManifestEntry {
  blockId: string | null
  sourceId: string | null
  selectorSnapshot: string | null
  component: CmsIslandComponentName
  props: Record<string, CmsIslandPropValue>
  htmlPath: string
  islandIndex: number
}

export interface CmsRenderingManifest {
  version: typeof CMS_RENDERING_MANIFEST_VERSION
  generatedAt: string
  entries: CmsRenderingManifestEntry[]
}
