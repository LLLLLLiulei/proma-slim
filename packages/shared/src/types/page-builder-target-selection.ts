export type PageBuilderTargetSelectionKind = 'block' | 'cms-island'

export type PageBuilderTargetEditBoundary = 'block' | 'source-atomic'

export type PageBuilderCmsIslandComponent = 'cms-catalog' | 'cms-content'

export const PAGE_BUILDER_DEFAULT_HTML_PATH = 'index.html'

interface PageBuilderBlockTargetSelectionBase {
  selector: string
  parentBlockSelector: string
}

export interface PageBuilderBlockTargetSelection extends PageBuilderBlockTargetSelectionBase {
  kind: 'block'
  editBoundary: 'block'
}

export interface PageBuilderCmsIslandLocator {
  htmlPath: string
  sourceSelector: string
  parentBlockSelector: string
  component: PageBuilderCmsIslandComponent
}

export interface PageBuilderCmsIslandTargetSelection extends PageBuilderCmsIslandLocator {
  kind: 'cms-island'
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
  sourceSelector: string,
  parentBlockSelector: string,
  component: PageBuilderCmsIslandComponent,
  htmlPath = PAGE_BUILDER_DEFAULT_HTML_PATH,
): PageBuilderCmsIslandTargetSelection {
  return {
    kind: 'cms-island',
    htmlPath,
    sourceSelector,
    parentBlockSelector,
    component,
    editBoundary: 'source-atomic',
  }
}
