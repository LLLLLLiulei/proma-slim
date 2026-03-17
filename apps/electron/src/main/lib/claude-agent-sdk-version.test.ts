import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('claude-agent-sdk pin', () => {
  test('pins the electron app to claude-agent-sdk 0.2.76', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dir, '../../../package.json'), 'utf-8'),
    ) as {
      dependencies?: Record<string, string>
    }

    expect(packageJson.dependencies?.['@anthropic-ai/claude-agent-sdk']).toBe('0.2.76')
  })
})
