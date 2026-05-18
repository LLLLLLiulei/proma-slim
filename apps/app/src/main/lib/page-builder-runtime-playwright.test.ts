import { describe, expect, test } from 'bun:test'
import { resolvePageBuilderInternalPreviewUrl } from './page-builder-runtime-playwright'

describe('page builder runtime playwright', () => {
  test('strips public base path before composing the internal preview url', () => {
    const url = resolvePageBuilderInternalPreviewUrl('/pagebuilder/api/workspaces/workspace-1/preview/', {
      AI_PAGE_BUILDER_BASE_PATH: '/pagebuilder',
      AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: 'http://server:8888',
    })

    expect(url).toBe('http://server:8888/api/workspaces/workspace-1/preview/')
  })

  test('strips multi-level public base path before composing the internal preview url', () => {
    const url = resolvePageBuilderInternalPreviewUrl('/ai/pagebuilder/api/workspaces/workspace-1/preview/', {
      AI_PAGE_BUILDER_BASE_PATH: '/ai/pagebuilder',
      AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: 'http://server:8888/',
    })

    expect(url).toBe('http://server:8888/api/workspaces/workspace-1/preview/')
  })

  test('keeps internal preview urls stable when public base path is empty or root', () => {
    expect(resolvePageBuilderInternalPreviewUrl('/api/workspaces/workspace-1/preview/', {
      AI_PAGE_BUILDER_BASE_PATH: '',
      AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: 'http://server:8888',
    })).toBe('http://server:8888/api/workspaces/workspace-1/preview/')

    expect(resolvePageBuilderInternalPreviewUrl('/api/workspaces/workspace-1/preview/', {
      AI_PAGE_BUILDER_BASE_PATH: '/',
      AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: 'http://server:8888',
    })).toBe('http://server:8888/api/workspaces/workspace-1/preview/')
  })
})
