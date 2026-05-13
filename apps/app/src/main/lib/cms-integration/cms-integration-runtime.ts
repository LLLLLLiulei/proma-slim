import {
  ACCESS_SESSION_DEFAULT_TTL_MS,
  BuilderAccessSessionService,
  InMemoryBuilderAccessSessionStore,
  createBuilderAccessSessionService,
} from './builder-access-session-service'
import {
  CMS_HANDOFF_DEFAULT_TTL_MS,
  CmsHandoffService,
  InMemoryCmsHandoffStore,
  createCmsHandoffService,
} from './cms-handoff-service'

const handoffStore = new InMemoryCmsHandoffStore()
const accessSessionStore = new InMemoryBuilderAccessSessionStore()

export function getSharedCmsHandoffService(ttlMs: number = CMS_HANDOFF_DEFAULT_TTL_MS): CmsHandoffService {
  return createCmsHandoffService({
    ttlMs,
    store: handoffStore,
  })
}

export function getSharedBuilderAccessSessionService(
  ttlMs: number = ACCESS_SESSION_DEFAULT_TTL_MS,
): BuilderAccessSessionService {
  return createBuilderAccessSessionService({
    ttlMs,
    store: accessSessionStore,
  })
}

export function resetCmsIntegrationRuntimeState(): void {
  handoffStore.clear()
  accessSessionStore.clear()
}
