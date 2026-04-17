import type { PageBuilderTargetSelection } from '@proma/shared'

export type PageBuilderSelectedTarget = PageBuilderTargetSelection

export type PageBuilderPreviewSelectionEvent =
  | { type: 'hover'; selector?: string | null; targetSelection: PageBuilderTargetSelection | null }
  | { type: 'selected'; selector?: string; targetSelection: PageBuilderTargetSelection }
  | { type: 'reset' }

export function decoratePageBuilderSelectionMessage(
  userMessage: string,
  targetSelection: PageBuilderSelectedTarget,
): string {
  const selectionSemantics = targetSelection.kind === 'cms-island'
    ? {
        previewSurface: 'cms-rendered-output',
        updateRule: 'replace-whole-source-component',
        forbidRenderedChildWrites: true,
        forbidSiblingInsertion: true,
      }
    : {
        previewSurface: 'static-block',
        updateRule: 'replace-selected-target-in-place',
        preserveExistingStructure: true,
        forbidSiblingInsertion: true,
        fallbackOnIncompatibleStructure: 'ask-user-question',
      }

  return [
    `<page_builder_selection>${JSON.stringify({
      targetSelection,
      selectionSemantics,
    })}</page_builder_selection>`,
    '',
    userMessage,
  ].join('\n')
}
