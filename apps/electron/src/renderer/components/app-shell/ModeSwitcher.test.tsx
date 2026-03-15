import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModeSwitcher } from './ModeSwitcher'

describe('ModeSwitcher', () => {
  test('renders agent-only mode affordance without chat toggle', () => {
    const markup = renderToStaticMarkup(<ModeSwitcher />)

    expect(markup).toContain('Agent')
    expect(markup).not.toContain('Chat')
    expect(markup).not.toContain('aria-pressed')
  })
})
