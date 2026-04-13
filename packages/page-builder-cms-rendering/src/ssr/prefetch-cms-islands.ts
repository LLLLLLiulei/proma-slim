import type { CmsRuntimeClient } from '../runtime/cms-runtime-client'
import type { CmsIslandScanResult } from '../template/scan-cms-islands'
import { createCatalogQuery, createContentQuery } from '../components/helpers'
import { CmsIslandRenderPipelineError, createCmsIslandRenderFailure } from './island-render-errors'

export async function prefetchCmsIslands(options: {
  islands: CmsIslandScanResult[]
  cmsClient: CmsRuntimeClient
}): Promise<void> {
  const failures = (
    await Promise.all(
      options.islands.map(async (island) => {
        try {
          if (island.component === 'cms-catalog') {
            await options.cmsClient.listCatalogs(createCatalogQuery(island.props))
          } else {
            await options.cmsClient.listContents(createContentQuery(island.props))
          }

          return null
        } catch (error) {
          return createCmsIslandRenderFailure(island, 'prefetch', error)
        }
      }),
    )
  ).filter((failure) => failure !== null)

  if (failures.length > 0) {
    throw new CmsIslandRenderPipelineError('CMS island prefetch failed', failures)
  }
}
