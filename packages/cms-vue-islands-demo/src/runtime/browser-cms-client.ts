import type { CmsRuntimeClient } from './cms-runtime-client'

export function createBrowserCmsClient(cmsApiBase: string): CmsRuntimeClient {
  return {
    async listCatalogs(query = {}) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.set(key, String(value))
        }
      }

      const response = await fetch(`${cmsApiBase}/catalogs?${searchParams.toString()}`)
      if (!response.ok) {
        throw new Error(`Catalog request failed with HTTP ${response.status}`)
      }

      return response.json()
    },

    async listContents(query) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.set(key, String(value))
        }
      }

      const response = await fetch(`${cmsApiBase}/contents?${searchParams.toString()}`)
      if (!response.ok) {
        throw new Error(`Content request failed with HTTP ${response.status}`)
      }

      return response.json()
    },
  }
}
