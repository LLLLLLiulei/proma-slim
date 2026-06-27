import { describe, expect, test } from 'bun:test'
import {
  applyAgentSdkEnvFileOverrides,
  resolveAgentSdkRuntimeEnv,
  resolveAnthropicRuntimeEnv,
} from './agent-runtime-env'

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

describe('resolveAgentSdkRuntimeEnv', () => {
  test('accepts auth token as an Agent SDK credential without API key', () => {
    expect(resolveAgentSdkRuntimeEnv({
      ANTHROPIC_AUTH_TOKEN: ' deepseek-token ',
    })).toEqual({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'deepseek-token',
      },
      hasCredential: true,
    })
  })

  test('collects supported Agent SDK env vars and ignores unsupported Anthropic vars', () => {
    expect(resolveAgentSdkRuntimeEnv({
      ANTHROPIC_MODEL: 'deepseek-v4-pro[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro[1m]',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro[1m]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
      CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-flash',
      CLAUDE_CODE_EFFORT_LEVEL: 'max',
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '1000000',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      API_TIMEOUT_MS: '3000000',
      ANTHROPIC_UNSUPPORTED_FLAG: 'should-not-pass',
    })).toEqual({
      env: {
        ANTHROPIC_MODEL: 'deepseek-v4-pro[1m]',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro[1m]',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro[1m]',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
        CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-flash',
        CLAUDE_CODE_EFFORT_LEVEL: 'max',
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: '1000000',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        API_TIMEOUT_MS: '3000000',
      },
      hasCredential: false,
    })
  })

  test('prefers official Anthropic vars and falls back to page-builder aliases', () => {
    expect(resolveAgentSdkRuntimeEnv({
      ANTHROPIC_API_KEY: 'official-api-key',
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      AI_PAGE_BUILDER_ANTHROPIC_API_KEY: 'legacy-api-key',
      AI_PAGE_BUILDER_ANTHROPIC_BASE_URL: 'https://legacy.example.com/anthropic',
    })).toEqual({
      env: {
        ANTHROPIC_API_KEY: 'official-api-key',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      },
      hasCredential: true,
    })

    expect(resolveAgentSdkRuntimeEnv({
      AI_PAGE_BUILDER_ANTHROPIC_API_KEY: 'legacy-api-key',
      AI_PAGE_BUILDER_ANTHROPIC_BASE_URL: 'https://legacy.example.com/anthropic',
    })).toEqual({
      env: {
        ANTHROPIC_API_KEY: 'legacy-api-key',
        ANTHROPIC_BASE_URL: 'https://legacy.example.com/anthropic',
      },
      hasCredential: true,
    })
  })

  test('filters blank values from supported Agent SDK env vars', () => {
    expect(resolveAgentSdkRuntimeEnv({
      ANTHROPIC_AUTH_TOKEN: '   ',
      ANTHROPIC_MODEL: '',
      CLAUDE_CODE_EFFORT_LEVEL: ' max ',
    })).toEqual({
      env: {
        CLAUDE_CODE_EFFORT_LEVEL: 'max',
      },
      hasCredential: false,
    })
  })
})

describe('applyAgentSdkEnvFileOverrides', () => {
  test('lets env file values override host Agent SDK env values only for supported keys', () => {
    const targetEnv: Record<string, string | undefined> = {
      ANTHROPIC_MODEL: 'host-model',
      ANTHROPIC_AUTH_TOKEN: 'host-token',
      AI_PAGE_BUILDER_ANTHROPIC_API_KEY: 'host-legacy-key',
      PATH: '/usr/bin',
      PROMA_CMS_BASE_URL: 'https://host-cms.example.com',
    }

    const result = applyAgentSdkEnvFileOverrides(
      [
        'ANTHROPIC_MODEL=file-model',
        'ANTHROPIC_AUTH_TOKEN="file-token"',
        'AI_PAGE_BUILDER_ANTHROPIC_API_KEY=file-legacy-key',
        'PROMA_CMS_BASE_URL=https://file-cms.example.com',
        'PATH=/tmp/bin',
      ].join('\n'),
      targetEnv,
    )

    expect(result).toEqual({
      appliedKeys: [
        'ANTHROPIC_MODEL',
        'ANTHROPIC_AUTH_TOKEN',
        'AI_PAGE_BUILDER_ANTHROPIC_API_KEY',
      ],
    })
    expect(targetEnv.ANTHROPIC_MODEL).toBe('file-model')
    expect(targetEnv.ANTHROPIC_AUTH_TOKEN).toBe('file-token')
    expect(targetEnv.AI_PAGE_BUILDER_ANTHROPIC_API_KEY).toBe('file-legacy-key')
    expect(targetEnv.PROMA_CMS_BASE_URL).toBe('https://host-cms.example.com')
    expect(targetEnv.PATH).toBe('/usr/bin')
  })
})
