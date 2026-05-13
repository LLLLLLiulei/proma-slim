import { describe, expect, test } from 'bun:test'
import {
  buildCmsHandoffOpenUrl,
  normalizeCmsHandoffPublicOrigin,
  resolveCmsHandoffCookieSecure,
} from './cms-integration-config-helpers'

describe('cms integration config helpers', () => {
  test('normalizes origin-only public origin and rejects pathful values', () => {
    expect(normalizeCmsHandoffPublicOrigin('https://builder.example.com')).toBe('https://builder.example.com')
    expect(normalizeCmsHandoffPublicOrigin('https://builder.example.com/')).toBe('https://builder.example.com')
    expect(normalizeCmsHandoffPublicOrigin('https://builder.example.com/pagebuilder')).toBeNull()
    expect(normalizeCmsHandoffPublicOrigin('https://builder.example.com?x=1')).toBeNull()
    expect(normalizeCmsHandoffPublicOrigin('https://builder.example.com#hash')).toBeNull()
  })

  test('builds openUrl from public origin and base path without using request headers', () => {
    expect(buildCmsHandoffOpenUrl({
      publicOrigin: 'https://builder.example.com',
      basePath: '',
      handoffId: 'handoff-1',
    })).toBe('https://builder.example.com/api/integrations/cms/handoffs/handoff-1/open')

    expect(buildCmsHandoffOpenUrl({
      publicOrigin: 'https://builder.example.com',
      basePath: '/pagebuilder',
      handoffId: 'handoff-1',
    })).toBe('https://builder.example.com/pagebuilder/api/integrations/cms/handoffs/handoff-1/open')
  })

  test('resolves secure cookie flag from public origin scheme and trusted forwarded proto', () => {
    expect(resolveCmsHandoffCookieSecure('https://builder.example.com')).toBe(true)
    expect(resolveCmsHandoffCookieSecure('http://builder.example.com')).toBe(false)
    expect(resolveCmsHandoffCookieSecure('http://builder.example.com', 'https')).toBe(true)
    expect(resolveCmsHandoffCookieSecure('http://builder.example.com', 'http')).toBe(false)
  })
})
