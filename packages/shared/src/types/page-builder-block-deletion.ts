import type { PageBuilderTargetSelection } from './page-builder-target-selection'

export interface PageBuilderBlockDeletionPayload {
  selector: string
  targetSelection?: PageBuilderTargetSelection
}
