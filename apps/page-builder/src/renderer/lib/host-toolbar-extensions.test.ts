import { describe, expect, test } from 'bun:test'
import { applyHostToolbarButtonPatch } from './host-toolbar-extensions'

describe('host toolbar extensions renderer helpers', () => {
  test('applies controlled hex colors in toolbar button patches and ignores unsafe colors', () => {
    const buttons = applyHostToolbarButtonPatch([
      {
        id: 'publish',
        label: '发布',
        icon: 'rocket',
        themeColor: '#16a34a',
        textColor: '#ffffff',
      },
      {
        id: 'audit',
        label: '送审',
        icon: 'check',
      },
    ], 'publish', {
      themeColor: ' #2563EB ',
      textColor: '#FFF',
    })

    expect(buttons[0]).toMatchObject({
      id: 'publish',
      themeColor: '#2563eb',
      textColor: '#fff',
    })

    const unchanged = applyHostToolbarButtonPatch(buttons, 'publish', {
      themeColor: 'red',
      textColor: 'var(--bad)',
    })

    expect(unchanged[0]).toMatchObject({
      id: 'publish',
      themeColor: '#2563eb',
      textColor: '#fff',
    })
  })
})
