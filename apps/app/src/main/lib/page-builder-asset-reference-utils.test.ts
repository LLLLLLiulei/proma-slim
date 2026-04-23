import { describe, expect, test } from 'bun:test'
import {
  isCmsRootRelativeAssetPath,
  resolveCmsAssetUrl,
} from './page-builder-asset-reference-utils'

describe('page-builder asset reference utils', () => {
  test('treats /assets paths as cms root-relative assets', () => {
    expect(
      isCmsRootRelativeAssetPath(
        'https://demo.zving.com/manager',
        '/assets/images/addpicture.png',
      ),
    ).toBe(true)
  })

  test('resolves /assets paths against the site origin instead of /manager', () => {
    expect(
      resolveCmsAssetUrl(
        'https://demo.zving.com/manager',
        '/assets/images/addpicture.png',
      ),
    ).toBe('https://demo.zving.com/assets/images/addpicture.png')
  })

  test('resolves /upload paths against the cms base path when needed', () => {
    expect(
      resolveCmsAssetUrl(
        'https://demo.zving.com/manager',
        '/upload/resources/image/inline-css.png',
      ),
    ).toBe('https://demo.zving.com/manager/upload/resources/image/inline-css.png')
  })
})
