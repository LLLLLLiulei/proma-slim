import { parseHTML } from 'linkedom'
import { scanCmsIslandsFromDom, type CmsIslandScanResult } from './scan-cms-islands-dom'

export type { CmsIslandComponentName, CmsIslandScanResult } from './scan-cms-islands-dom'

export function scanCmsIslands(source: string | ParentNode): CmsIslandScanResult[] {
  const root = typeof source === 'string' ? parseHTML(source).document : source
  return scanCmsIslandsFromDom(root)
}
