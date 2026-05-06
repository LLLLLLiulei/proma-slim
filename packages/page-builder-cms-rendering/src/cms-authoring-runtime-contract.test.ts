import { expect, test } from 'bun:test'
import { PAGE_BUILDER_CMS_AUTHORING_CONTRACT } from '@ai-page-builder/shared/types/page-builder-cms-authoring-contract'
import {
  CMS_AUTHORING_RUNTIME_ALLOWED_PROPS,
  CMS_AUTHORING_RUNTIME_DEFAULT_SITE_ID,
} from './cms-authoring-runtime-contract'

test('preview runtime CMS authoring constants stay aligned with canonical contract', () => {
  expect(CMS_AUTHORING_RUNTIME_DEFAULT_SITE_ID).toBe(PAGE_BUILDER_CMS_AUTHORING_CONTRACT.legacySiteIdFallback)
  expect(CMS_AUTHORING_RUNTIME_ALLOWED_PROPS['cms-catalog'].join(',')).toBe(
    PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components['cms-catalog'].allowedProps.join(','),
  )
  expect(CMS_AUTHORING_RUNTIME_ALLOWED_PROPS['cms-content'].join(',')).toBe(
    PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components['cms-content'].allowedProps.join(','),
  )
})
