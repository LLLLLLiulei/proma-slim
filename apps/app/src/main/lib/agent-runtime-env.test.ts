import { describe, expect, test } from 'bun:test'
import { resolveAnthropicRuntimeEnv } from './agent-runtime-env'

describe('resolveAnthropicRuntimeEnv', () => {
  test('uses page-builder Anthropic env vars when SDK env vars are absent', () => {
    expect(resolveAnthropicRuntimeEnv({
      AI_PAGE_BUILDER_ANTHROPIC_API_KEY: 'builder-api-key',
      AI_PAGE_BUILDER_ANTHROPIC_BASE_URL: 'https://example.com/anthropic',
    })).toEqual({
      apiKey: 'builder-api-key',
      baseUrl: 'https://example.com/anthropic',
    })
  })

  test('prefers direct Anthropic env vars over page-builder aliases', () => {
    expect(resolveAnthropicRuntimeEnv({
      ANTHROPIC_API_KEY: 'direct-api-key',
      ANTHROPIC_BASE_URL: 'https://direct.example.com',
      AI_PAGE_BUILDER_ANTHROPIC_API_KEY: 'builder-api-key',
      AI_PAGE_BUILDER_ANTHROPIC_BASE_URL: 'https://builder.example.com',
    })).toEqual({
      apiKey: 'direct-api-key',
      baseUrl: 'https://direct.example.com',
    })
  })
})
