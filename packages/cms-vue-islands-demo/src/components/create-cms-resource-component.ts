import { defineComponent, onMounted, onServerPrefetch, ref } from 'vue'
import type { ComponentObjectPropsOptions } from 'vue'
import { renderCmsSlot, useInjectedCmsClient } from './helpers'
import type { CmsCatalogItemViewModel, CmsContentItemViewModel, CmsRuntimeClient, CmsSlotError } from '../runtime/cms-runtime-client'

type CmsResourceItem = CmsCatalogItemViewModel | CmsContentItemViewModel

export function createCmsResourceComponent<
  TItem extends CmsResourceItem,
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

      onMounted(load)
      onServerPrefetch(load)

      return () => renderCmsSlot(items.value, loading.value, error.value, slots)
    },
  })
}
