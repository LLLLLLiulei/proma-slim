import { createCmsResourceComponent } from './create-cms-resource-component'
import { assertValidContentSource, createContentQuery } from './helpers'
import { mapContent } from '../viewmodel/content'

export const CmsContent = createCmsResourceComponent({
  name: 'CmsContent',
  props: {
    siteId: { type: [String, Number], required: false },
    ids: { type: [String, Array], required: false },
    catalogId: { type: [String], required: false },
    keyword: { type: [String], required: false },
    pageIndex: { type: [String, Number], required: false },
    pageSize: { type: [String, Number], required: false },
  },
  errorMessage: 'Failed to load contents',
  async loadItems(client, props) {
    assertValidContentSource(props)
    const response = await client.listContents(createContentQuery(props))
    return response.items.map(mapContent)
  },
})
