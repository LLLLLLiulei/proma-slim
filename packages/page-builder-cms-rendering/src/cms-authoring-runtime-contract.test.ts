import { expect, test } from 'bun:test'
import { PAGE_BUILDER_CMS_AUTHORING_CONTRACT } from '@proma/shared/types/page-builder-cms-authoring-contract'
import {
  CMS_AUTHORING_RUNTIME_ALLOWED_PROPS,
  CMS_AUTHORING_RUNTIME_DEFAULT_SITE_ID,
} from './cms-authoring-runtime-contract'

test('preview runtime CMS authoring constants stay aligned with canonical contract', () => {
  expect(CMS_AUTHORING_RUNTIME_DEFAULT_SITE_ID).toBe(PAGE_BUILDER_CMS_AUTHORING_CONTRACT.legacySiteIdFallback)
  expect(CMS_AUTHORING_RUNTIME_ALLOWED_PROPS['cms-catalog']).toEqual(
    PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components['cms-catalog'].allowedProps,
  )
  expect(CMS_AUTHORING_RUNTIME_ALLOWED_PROPS['cms-content']).toEqual(
    PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components['cms-content'].allowedProps,
  )
})
