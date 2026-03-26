import { describe, expect, test } from 'bun:test'
import { DEFAULT_ASK_USER_TIMEOUT_MS, DEFAULT_THEME_MODE } from './settings'

describe('settings defaults', () => {
  test('uses light theme mode by default', () => {
    expect(DEFAULT_THEME_MODE).toBe('light')
  })

  test('uses no timeout for AskUserQuestion by default', () => {
    expect(DEFAULT_ASK_USER_TIMEOUT_MS).toBe(0)
  })
})
