import { afterEach, describe, expect, test } from 'bun:test'

declare global {
  interface Window {
    __AI_PAGE_BUILDER_RUNTIME_CONFIG__?: {
      basePath?: string | null
    }
  }
}

const originalBaseUrl = import.meta.env.BASE_URL
const originalWindow = globalThis.window

afterEach(() => {
  import.meta.env.BASE_URL = originalBaseUrl
  if (originalWindow === undefined) {
    delete (globalThis as typeof globalThis & { window?: Window }).window
  } else {
    globalThis.window = originalWindow
    delete globalThis.window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__
  }
})

describe('page-builder public base path runtime config', () => {
  test('prefers runtime base path over Vite fallback base URL', async () => {
    import.meta.env.BASE_URL = './'
    globalThis.window = {} as Window
    globalThis.window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__ = {
      basePath: '/ai/pagebuilder',
    }

    const { getPageBuilderPublicBasePath } = await import(`./public-base-path.ts?test=${Date.now()}-${Math.random()}`)

    expect(getPageBuilderPublicBasePath()).toBe('/ai/pagebuilder')
  })

  test('falls back to Vite base URL when runtime config is absent', async () => {
    import.meta.env.BASE_URL = '/pagebuilder/'

    const { getPageBuilderPublicBasePath } = await import(`./public-base-path.ts?test=${Date.now()}-${Math.random()}`)

    expect(getPageBuilderPublicBasePath()).toBe('/pagebuilder')
  })

  test('treats Vite relative asset base as root public path when runtime config is absent', async () => {
    import.meta.env.BASE_URL = './'

    const { getPageBuilderPublicBasePath } = await import(`./public-base-path.ts?test=${Date.now()}-${Math.random()}`)

    expect(getPageBuilderPublicBasePath()).toBe('')
  })
})
