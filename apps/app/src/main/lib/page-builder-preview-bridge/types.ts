export interface BridgeRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface ReplaceImageTargetDescriptor {
  version: 1
  tagName: string
  childPath: number[]
}

export interface ReplaceImageCapability {
  supported: true
  targetDescriptor: ReplaceImageTargetDescriptor
}

export interface EditableTextTargetDescriptor {
  version: 1
  tagName: string
  childPath: number[]
}

export interface BlockTargetSelection {
  kind: 'block'
  selector: string
  parentBlockSelector: string
  editBoundary: 'block'
}

export interface CmsIslandTargetSelection {
  kind: 'cms-island'
  sourceId?: string
  selector: string
  parentBlockSelector: string
  component: string
  editBoundary: 'source-atomic'
}

export type TargetSelection = BlockTargetSelection | CmsIslandTargetSelection

export interface ResolvedTarget {
  key: string
  islandId?: string
  targetSelection: TargetSelection
  primaryElement: Element
  elements: Element[]
}

export interface CmsIslandMeta {
  islandId: string
  sourceId?: string
  component: string
  sourceSelector: string
  parentBlockSelector: string
  editBoundary: 'source-atomic'
  elements: Element[]
}

export interface PassiveCmsIslandOverlayPair {
  overlay: HTMLDivElement
  label: HTMLDivElement
}

export interface InlineEditContext {
  element: HTMLElement
  selector: string
  descriptor: EditableTextTargetDescriptor
  originalText: string
  previousContentEditable: string | null
  previousTabIndex: string | null
}

export interface PendingInlineSave {
  element: HTMLElement
  previousText: string
  nextText: string
}

export interface RuntimeState {
  selectionModeEnabled: boolean
  selectionInteractionLocked: boolean
  showCmsIslandOutlines: boolean
  hoveredTarget: ResolvedTarget | null
  selectedTarget: ResolvedTarget | null
  lastSelectedRectKey: string | null
  mutationObserver: MutationObserver | null
  readyAnnouncementAttempts: number
  readyAnnouncementTimer: number | null
  activeInlineEdit: InlineEditContext | null
  inlineSaveSequence: number
  pendingInlineSaves: Map<string, PendingInlineSave>
  passiveCmsIslandOverlays: Map<string, PassiveCmsIslandOverlayPair>
}
