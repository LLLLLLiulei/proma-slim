import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Conversation, ConversationContent } from './conversation'

describe('Conversation layout', () => {
  test('renders a height-constrained flex root so the inner scroll viewport can own scrolling', () => {
    const markup = renderToStaticMarkup(
      <Conversation>
        <ConversationContent>hello</ConversationContent>
      </Conversation>
    )

    expect(markup).toContain('class="relative flex h-full min-h-0 flex-1 flex-col overflow-y-hidden scrollbar-none"')
    expect(markup).toContain('style="height:100%;width:100%;scrollbar-gutter:stable both-edges"')
  })
})
