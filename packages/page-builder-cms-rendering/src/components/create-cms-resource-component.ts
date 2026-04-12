import { defineComponent, onMounted, onServerPrefetch, ref, type ComponentObjectPropsOptions } from 'vue'
import { createSlotScope, renderCmsSlot, useInjectedCmsClient } from './helpers'
import type { CmsSlotError, CmsSlotScope, CmsRuntimeClient } from '../runtime/cms-runtime-client'

export function createCmsResourceComponent<
  TItem,
  TProps extends ComponentObjectPropsOptions = ComponentObjectPropsOptions,
>(options: {
  name: string
  props: TProps
  errorMessage: string
  loadItems: (client: CmsRuntimeClient, props: Record<string, unknown>) => Promise<TItem[]>
}) {
  return defineComponent({
    name: options.name,
    props: options.props,
    setup(props, { slots }) {
      const client = useInjectedCmsClient()
      const items = ref<TItem[]>([])
      const loading = ref(true)
      const error = ref<CmsSlotError | null>(null)

      const load = async () => {
        try {
          loading.value = true
          error.value = null
          items.value = await options.loadItems(client, props as Record<string, unknown>)
        } catch (caughtError) {
          error.value = {
            message: caughtError instanceof Error ? caughtError.message : options.errorMessage,
          }
          items.value = []
        } finally {
          loading.value = false
        }
      }

      onServerPrefetch(load)
      onMounted(load)

      return () =>
        renderCmsSlot(
          createSlotScope(items.value, loading.value, error.value) as CmsSlotScope<TItem>,
          slots,
        )
    },
  })
}
