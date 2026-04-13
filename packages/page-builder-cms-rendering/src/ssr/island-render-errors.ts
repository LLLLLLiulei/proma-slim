import type { CmsIslandComponentName, CmsIslandScanResult } from '../template/scan-cms-islands'

export type CmsIslandRenderStage = 'prefetch' | 'render'

export interface CmsIslandRenderFailure {
  stage: CmsIslandRenderStage
  component: CmsIslandComponentName
  props: Record<string, string>
  message: string
}

export class CmsIslandRenderPipelineError extends Error {
  constructor(
    message: string,
    readonly failures: CmsIslandRenderFailure[],
  ) {
    super(message)
    this.name = 'CmsIslandRenderPipelineError'
  }
}

export function createCmsIslandRenderFailure(
  island: Pick<CmsIslandScanResult, 'component' | 'props'>,
  stage: CmsIslandRenderStage,
  error: unknown,
): CmsIslandRenderFailure {
  return {
    stage,
    component: island.component,
    props: island.props,
    message: error instanceof Error ? error.message : String(error),
  }
}
