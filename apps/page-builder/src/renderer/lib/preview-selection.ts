export interface PageBuilderSelectedBlock {
  selector: string
}

export type PageBuilderPreviewSelectionEvent =
  | { type: 'hover'; selector: string | null }
  | { type: 'selected'; selector: string }
  | { type: 'reset' }

export function decoratePageBuilderSelectionMessage(
  userMessage: string,
  selectedBlock: PageBuilderSelectedBlock,
): string {
  return [
    '<page_builder_selection>',
    `selector: ${selectedBlock.selector}`,
    '</page_builder_selection>',
    '',
    userMessage,
  ].join('\n')
}
