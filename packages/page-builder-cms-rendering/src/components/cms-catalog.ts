import { createCmsResourceComponent } from './create-cms-resource-component'
import {
  assertValidCatalogSource,
  createCatalogDisplayOptions,
  createCatalogQuery,
  selectCatalogNodes,
} from './helpers'
import { mapCatalog } from '../viewmodel/catalog'

export const CmsCatalog = createCmsResourceComponent({
  name: 'CmsCatalog',
  props: {
    siteId: { type: [String, Number], required: false },
    ids: { type: [String, Array], required: false },
    level: { type: [String], required: false },
    parentId: { type: [String], required: false },
    contentType: { type: [String], required: false },
    searchKeyword: { type: [String], required: false },
    take: { type: [String, Number], required: false },
  },
  errorMessage: 'Failed to load catalogs',
  async loadItems(client, props) {
    assertValidCatalogSource(props)
    const query = createCatalogQuery(props)
    const response = await client.listCatalogs(query)
    if (query.ids) {
      return response.items.map(mapCatalog)
    }
    const catalogs = selectCatalogNodes(response.tree, createCatalogDisplayOptions(props))
    return catalogs.map(mapCatalog)
  },
})
