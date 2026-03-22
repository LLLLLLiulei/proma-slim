import { describe, expect, test } from 'bun:test'
import { DEFAULT_THEME_MODE } from './settings'

describe('settings defaults', () => {
  test('uses light theme mode by default', () => {
    expect(DEFAULT_THEME_MODE).toBe('light')
  })
})
