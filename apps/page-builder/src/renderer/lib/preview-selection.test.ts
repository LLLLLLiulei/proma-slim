import { describe, expect, test } from 'bun:test'
import { decoratePageBuilderSelectionMessage } from './preview-selection'

function extractSelectionPayload(message: string): unknown {
  const match = message.match(/<page_builder_selection>\s*([\s\S]*?)\s*<\/page_builder_selection>/)
  if (!match) {
    throw new Error('missing page_builder_selection payload')
  }

  return JSON.parse(match[1]!)
}

describe('page builder preview selection helpers', () => {
  test('decorates the next builder message using the structured block target selection and visible user message', () => {
    const decorated = decoratePageBuilderSelectionMessage('把这里的文案改短一点', {
      kind: 'block',
      selector: '#hero',
      parentBlockSelector: '#hero',
      editBoundary: 'block',
    })

    expect(decorated).toContain('把这里的文案改短一点')
    expect(extractSelectionPayload(decorated)).toEqual({
      targetSelection: {
        kind: 'block',
        selector: '#hero',
        parentBlockSelector: '#hero',
        editBoundary: 'block',
      },
      selectionSemantics: {
        previewSurface: 'static-block',
        updateRule: 'update-selected-target',
      },
    })
  })

  test('decorates cms islands with source-atomic boundary metadata instead of rendered child semantics', () => {
    const decorated = decoratePageBuilderSelectionMessage('请把这里换成另一个栏目', {
      kind: 'cms-island',
      selector: 'section:nth-of-type(2) > cms-catalog:nth-of-type(1)',
      parentBlockSelector: '[data-proma-block-id="pb_blk_nav"]',
      component: 'cms-catalog',
      editBoundary: 'source-atomic',
    })

    expect(extractSelectionPayload(decorated)).toEqual({
      targetSelection: {
        kind: 'cms-island',
        selector: 'section:nth-of-type(2) > cms-catalog:nth-of-type(1)',
        parentBlockSelector: '[data-proma-block-id="pb_blk_nav"]',
        component: 'cms-catalog',
        editBoundary: 'source-atomic',
      },
      selectionSemantics: {
        previewSurface: 'cms-rendered-output',
        updateRule: 'replace-whole-source-component',
        forbidRenderedChildWrites: true,
      },
    })
  })
})
