import { describe, expect, test } from 'bun:test'
import { decoratePageBuilderSelectionMessage } from './preview-selection'

describe('page builder preview selection helpers', () => {
  test('decorates the next builder message using only the selected selector and visible user message', () => {
    expect(decoratePageBuilderSelectionMessage('把这里的文案改短一点', {
      selector: '#hero',
    })).toBe([
      '<page_builder_selection>',
      'selector: #hero',
      '</page_builder_selection>',
      '',
      '把这里的文案改短一点',
    ].join('\n'))
  })
})
