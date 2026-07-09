import { Hono } from 'hono'
import { resolveAgentModelProviderRegistry } from '../../lib/agent-model-provider-config'

export const agentRoutes = new Hono()

agentRoutes.get('/model-options', (c) => {
  return c.json(resolveAgentModelProviderRegistry().publicOptions)
})
