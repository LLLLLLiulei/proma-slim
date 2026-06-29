import { afterEach, describe, expect, test } from 'bun:test'

declare global {
  interface Window {
    __AI_PAGE_BUILDER_RUNTIME_CONFIG__?: {
      basePath?: string | null
      hiddenToolbarItems?: unknown
    }
  }
}

const originalBaseUrl = import.meta.env.BASE_URL
const globalWithOptionalWindow = globalThis as unknown as { window?: Window }
const globalWithDevToolbarItems = globalThis as unknown as { __AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS__?: unknown }
const originalWindow = globalWithOptionalWindow.window

afterEach(() => {
  import.meta.env.BASE_URL = originalBaseUrl
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalWithOptionalWindow, 'window')
  } else {
    globalWithOptionalWindow.window = originalWindow
    Reflect.deleteProperty(globalWithOptionalWindow.window, '__AI_PAGE_BUILDER_RUNTIME_CONFIG__')
  }
  Reflect.deleteProperty(globalWithDevToolbarItems, '__AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS__')
})

describe('page-builder public base path runtime config', () => {
  test('prefers runtime base path over Vite fallback base URL', async () => {
    import.meta.env.BASE_URL = './'
    globalWithOptionalWindow.window = {} as Window
    globalWithOptionalWindow.window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__ = {
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

  test('reads normalized hidden toolbar items from runtime config', async () => {
    globalWithOptionalWindow.window = {} as Window
    globalWithOptionalWindow.window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__ = {
      hiddenToolbarItems: ['export', 'unknown', 'saveTemplate', 'export'],
    }

    const { getPageBuilderHiddenToolbarItems } = await import(`./public-base-path.ts?test=${Date.now()}-${Math.random()}`)

    expect(getPageBuilderHiddenToolbarItems()).toEqual(['export', 'saveTemplate'])
  })

  test('falls back to Vite-injected hidden toolbar items when runtime config is absent', async () => {
    globalWithDevToolbarItems.__AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS__ = ['refresh', 'bad', 'projectName']

    const { getPageBuilderHiddenToolbarItems } = await import(`./public-base-path.ts?test=${Date.now()}-${Math.random()}`)

    expect(getPageBuilderHiddenToolbarItems()).toEqual(['refresh', 'projectName'])
  })

  test('prefers runtime hidden toolbar items over Vite-injected fallback even when empty', async () => {
    globalWithOptionalWindow.window = {} as Window
    globalWithOptionalWindow.window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__ = {
      hiddenToolbarItems: null,
    }
    globalWithDevToolbarItems.__AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS__ = ['refresh']

    const { getPageBuilderHiddenToolbarItems } = await import(`./public-base-path.ts?test=${Date.now()}-${Math.random()}`)

    expect(getPageBuilderHiddenToolbarItems()).toEqual([])
  })
})
