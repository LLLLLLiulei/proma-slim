import type {
  PageBuilderInlineTextSaveRequest,
  PageBuilderInlineTextSaveResult,
} from './page-builder-inline-text'

export const PAGE_BUILDER_PREVIEW_PARENT_SOURCE = 'page-builder-preview-parent'
export const PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE = 'page-builder-preview-bridge'

export interface PageBuilderPreviewAnchorRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export type PageBuilderPreviewParentMessage =
  | {
    source: typeof PAGE_BUILDER_PREVIEW_PARENT_SOURCE
    type: 'selection-mode'
    enabled: boolean
  }
  | {
    source: typeof PAGE_BUILDER_PREVIEW_PARENT_SOURCE
    type: 'selection-clear'
  }
  | ({
    source: typeof PAGE_BUILDER_PREVIEW_PARENT_SOURCE
    type: 'inline-text-save-result'
  } & PageBuilderInlineTextSaveResult)

export type PageBuilderPreviewBridgeMessage =
  | {
    source: typeof PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE
    type: 'ready'
  }
  | {
    source: typeof PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE
    type: 'hover'
    selector: string | null
  }
  | {
    source: typeof PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE
    type: 'selected'
    selector: string
    rect: PageBuilderPreviewAnchorRect
  }
  | {
    source: typeof PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE
    type: 'reset'
  }
  | ({
    source: typeof PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE
    type: 'inline-text-save-request'
  } & PageBuilderInlineTextSaveRequest)
