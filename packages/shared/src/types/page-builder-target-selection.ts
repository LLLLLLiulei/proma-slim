export type PageBuilderTargetSelectionKind = 'block' | 'cms-island'

export type PageBuilderTargetEditBoundary = 'block' | 'source-atomic'

export type PageBuilderCmsIslandComponent = 'cms-catalog' | 'cms-content'

interface PageBuilderTargetSelectionBase {
  selector: string
  parentBlockSelector: string
}

export interface PageBuilderBlockTargetSelection extends PageBuilderTargetSelectionBase {
  kind: 'block'
  editBoundary: 'block'
}

export interface PageBuilderCmsIslandTargetSelection extends PageBuilderTargetSelectionBase {
  kind: 'cms-island'
  sourceId?: string
  component: PageBuilderCmsIslandComponent
  editBoundary: 'source-atomic'
}

export type PageBuilderTargetSelection =
  | PageBuilderBlockTargetSelection
  | PageBuilderCmsIslandTargetSelection

export function createPageBuilderBlockTargetSelection(selector: string): PageBuilderBlockTargetSelection {
  return {
    kind: 'block',
    selector,
    parentBlockSelector: selector,
    editBoundary: 'block',
  }
}

export function createPageBuilderCmsIslandTargetSelection(
  selector: string,
  parentBlockSelector: string,
  component: PageBuilderCmsIslandComponent,
  sourceId?: string,
): PageBuilderCmsIslandTargetSelection {
  return {
    kind: 'cms-island',
    ...(sourceId ? { sourceId } : {}),
    selector,
    parentBlockSelector,
    component,
    editBoundary: 'source-atomic',
  }
}
