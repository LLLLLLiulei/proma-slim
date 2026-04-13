export interface CmsRuntimePrefetchCache {
  getOrLoad<TResult>(key: string, loader: () => Promise<TResult>): Promise<TResult>
}

export function createCmsRuntimePrefetchCache(): CmsRuntimePrefetchCache {
  const entries = new Map<string, Promise<unknown>>()

  return {
    getOrLoad<TResult>(key: string, loader: () => Promise<TResult>): Promise<TResult> {
      const cached = entries.get(key)
      if (cached) {
        return cached as Promise<TResult>
      }

      const pending = Promise.resolve().then(loader)
      entries.set(key, pending)
      return pending
    },
  }
}
