import { createCmsResourceComponent } from './create-cms-resource-component'
import { createCatalogQuery } from './helpers'

export const CmsCatalog = createCmsResourceComponent({
  name: 'CmsCatalog',
  props: {
    level: { type: [String], required: false },
    parentId: { type: [String], required: false },
    contentType: { type: [String], required: false },
    searchKeyword: { type: [String], required: false },
    take: { type: [String, Number], required: false },
  },
  errorMessage: 'Failed to load catalogs',
  async loadItems(client, props) {
    const response = await client.listCatalogs(createCatalogQuery(props))
    return response.items
  },
})
