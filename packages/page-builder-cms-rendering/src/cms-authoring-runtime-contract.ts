export const CMS_AUTHORING_RUNTIME_DEFAULT_SITE_ID = '1' as const

export const CMS_AUTHORING_RUNTIME_ALLOWED_PROPS = {
  'cms-catalog': ['site-id', 'ids', 'level', 'parent-id', 'content-type', 'search-keyword', 'take'],
  'cms-content': ['site-id', 'ids', 'catalog-id', 'keyword', 'page-index', 'page-size'],
} as const
