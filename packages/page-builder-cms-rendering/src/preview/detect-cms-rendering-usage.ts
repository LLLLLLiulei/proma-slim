import { scanCmsIslands, type CmsIslandComponentName } from '../template/scan-cms-islands'

export interface DetectCmsRenderingUsageResult {
  hasCmsRendering: boolean
  islandCount: number
  components: CmsIslandComponentName[]
}

export function detectCmsRenderingUsage(source: string | ParentNode): DetectCmsRenderingUsageResult {
  const islands = scanCmsIslands(source)
  const components = Array.from(new Set(islands.map((island) => island.component)))

  return {
    hasCmsRendering: islands.length > 0,
    islandCount: islands.length,
    components,
  }
}
