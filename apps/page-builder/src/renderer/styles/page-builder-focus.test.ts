import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function getRuleBody(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'))

  if (!match) {
    throw new Error(`Missing CSS rule for selector: ${selector}`)
  }

  const ruleBody = match[1]
  if (typeof ruleBody !== 'string') {
    throw new Error(`Missing CSS rule body for selector: ${selector}`)
  }

  return ruleBody
}

describe('page builder home focus styles', () => {
  test('keeps the homepage input focus state border-only with a clearer accent border', () => {
    const css = readFileSync(resolve(import.meta.dir, 'page-builder.css'), 'utf8')

    const panelFocusRule = getRuleBody(css, '.page-builder-home-panel:focus-within')
    const inputSurfaceFocusRule = getRuleBody(css, '.page-builder-home-panel-focus:focus-within')
    const darkInputSurfaceFocusRule = getRuleBody(css, '.dark .page-builder-home-panel-focus:focus-within')

    expect(panelFocusRule).toContain('border-color')
    expect(panelFocusRule).not.toContain('box-shadow')
    expect(inputSurfaceFocusRule).toContain('border-color: hsl(var(--primary) /')
    expect(inputSurfaceFocusRule).not.toContain('box-shadow')
    expect(darkInputSurfaceFocusRule).toContain('border-color')
    expect(darkInputSurfaceFocusRule).not.toContain('box-shadow')
  })
})
