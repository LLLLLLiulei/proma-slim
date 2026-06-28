import { describe, expect, test } from 'bun:test'
import {
  buildPageBuilderMonacoAssetsBaseUrl,
  createPageBuilderMonacoLoaderConfig,
} from './monaco-loader-config'

describe('monaco-loader-config', () => {
  test('builds root-relative Monaco AMD asset URLs from the page-builder public base path', () => {
    expect(buildPageBuilderMonacoAssetsBaseUrl('')).toBe('/monaco/vs')
    expect(buildPageBuilderMonacoAssetsBaseUrl('/pagebuilder')).toBe('/pagebuilder/monaco/vs')
    expect(buildPageBuilderMonacoAssetsBaseUrl('/pagebuilder/')).toBe('/pagebuilder/monaco/vs')
  })

  test('builds absolute Monaco AMD asset URLs for worker loading', () => {
    expect(buildPageBuilderMonacoAssetsBaseUrl('/pagebuilder', 'http://localhost:5174')).toBe(
      'http://localhost:5174/pagebuilder/monaco/vs',
    )
  })

  test('configures the Monaco AMD loader to use local zh-cn assets', () => {
    expect(createPageBuilderMonacoLoaderConfig('/pagebuilder', 'http://localhost:5174')).toEqual({
      paths: {
        vs: 'http://localhost:5174/pagebuilder/monaco/vs',
      },
      'vs/nls': {
        availableLanguages: {
          '*': 'zh-cn',
        },
      },
    })
  })
})
