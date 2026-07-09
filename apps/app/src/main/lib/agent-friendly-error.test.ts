import { describe, expect, test } from 'bun:test'
import {
  AUTHENTICATION_ERROR_MESSAGE,
  BASE_URL_CONFIGURATION_ERROR_MESSAGE,
  LOGIN_CONFIGURATION_ERROR_MESSAGE,
  mapAgentFriendlyError,
} from './agent-friendly-error'

describe('mapAgentFriendlyError', () => {
  test('maps login prompts to an environment-aware message', () => {
    const result = mapAgentFriendlyError('Not logged in. Please run /login to authenticate.')

    expect(result.matched).toBe(true)
    expect(result.userMessage).toBe(LOGIN_CONFIGURATION_ERROR_MESSAGE)
    expect(result.originalMessage).toBe('Not logged in. Please run /login to authenticate.')
  })

  test('maps api key authentication failures', () => {
    const result = mapAgentFriendlyError('Authentication failed: invalid x-api-key header')

    expect(result.matched).toBe(true)
    expect(result.userMessage).toBe(AUTHENTICATION_ERROR_MESSAGE)
  })

  test('maps base url configuration failures', () => {
    const result = mapAgentFriendlyError('Failed to connect to ANTHROPIC_BASE_URL: getaddrinfo ENOTFOUND')

    expect(result.matched).toBe(true)
    expect(result.userMessage).toBe(BASE_URL_CONFIGURATION_ERROR_MESSAGE)
  })

  test('passes through unknown errors unchanged', () => {
    const result = mapAgentFriendlyError('unexpected sandbox failure')

    expect(result.matched).toBe(false)
    expect(result.userMessage).toBe('unexpected sandbox failure')
    expect(result.originalMessage).toBe('unexpected sandbox failure')
  })

  test('redacts provider secrets and baseUrl from unmatched errors', () => {
    const result = mapAgentFriendlyError(
      'upstream failed: Authorization: Bearer sk-secret-token apiKey=sk-zhipu-secret at https://open.bigmodel.cn/api/anthropic',
    )

    expect(result.matched).toBe(false)
    expect(result.userMessage).not.toContain('sk-secret-token')
    expect(result.userMessage).not.toContain('sk-zhipu-secret')
    expect(result.userMessage).not.toContain('open.bigmodel.cn')
    expect(result.userMessage).not.toContain('api/anthropic')
    expect(result.originalMessage).toBe(result.userMessage)
  })
})
