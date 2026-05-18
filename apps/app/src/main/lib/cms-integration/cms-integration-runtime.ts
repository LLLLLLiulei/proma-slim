import {
  ACCESS_SESSION_DEFAULT_TTL_MS,
  BuilderAccessSessionService,
  createBuilderAccessSessionService,
} from './builder-access-session-service'
import {
  CMS_HANDOFF_DEFAULT_TTL_MS,
  CmsHandoffService,
  createCmsHandoffService,
} from './cms-handoff-service'
import {
  type BuilderAccessSessionStore,
  type CmsHandoffStore,
  createFileCmsRuntimeStores,
  getCmsRuntimeStoreDir,
} from './cms-runtime-store'

interface BuilderAccessSessionRuntimeOptions {
  ttlMs?: number
  renewThresholdMs?: number
}

interface RuntimeStores {
  handoffStore: CmsHandoffStore
  accessSessionStore: BuilderAccessSessionStore
}

let runtimeStores: RuntimeStores | null = null
let runtimeStoreDir: string | null = null
let runtimeStoresOverride: RuntimeStores | null = null

function getSharedRuntimeStores(): RuntimeStores {
  if (runtimeStoresOverride) {
    return runtimeStoresOverride
  }

  const dir = getCmsRuntimeStoreDir()
  if (runtimeStores && runtimeStoreDir === dir) {
    return runtimeStores
  }

  runtimeStores = createFileCmsRuntimeStores(dir)
  runtimeStoreDir = dir
  return runtimeStores
}

export function getSharedCmsHandoffService(ttlMs: number = CMS_HANDOFF_DEFAULT_TTL_MS): CmsHandoffService {
  const stores = getSharedRuntimeStores()
  return createCmsHandoffService({
    ttlMs,
    store: stores.handoffStore,
  })
}

export function getSharedBuilderAccessSessionService(
  options: number | BuilderAccessSessionRuntimeOptions = ACCESS_SESSION_DEFAULT_TTL_MS,
): BuilderAccessSessionService {
  const normalizedOptions = typeof options === 'number' ? { ttlMs: options } : options
  const stores = getSharedRuntimeStores()

  return createBuilderAccessSessionService({
    ttlMs: normalizedOptions.ttlMs ?? ACCESS_SESSION_DEFAULT_TTL_MS,
    renewThresholdMs: normalizedOptions.renewThresholdMs,
    store: stores.accessSessionStore,
  })
}

export function setCmsIntegrationRuntimeStoresForTest(stores: RuntimeStores | null): void {
  runtimeStoresOverride = stores
}

export async function resetCmsIntegrationRuntimeState(options: { clearStore?: boolean } = {}): Promise<void> {
  const clearStore = options.clearStore ?? true
  if (clearStore && runtimeStoresOverride) {
    await runtimeStoresOverride.handoffStore.clear()
    await runtimeStoresOverride.accessSessionStore.clear()
  }
  if (clearStore && runtimeStores) {
    await runtimeStores.handoffStore.clear()
    await runtimeStores.accessSessionStore.clear()
  }
  runtimeStores = null
  runtimeStoreDir = null
  runtimeStoresOverride = null
}
