import { Hono } from 'hono'
import { getSettings, updateSettings } from '../../lib/settings-service'
import { readJsonBody } from '../responses'

export const settingsRoutes = new Hono()

settingsRoutes.get('/', (c) => {
  return c.json(getSettings())
})

settingsRoutes.patch('/', async (c) => {
  const updates = await readJsonBody<Record<string, unknown>>(c.req.raw)
  return c.json(updateSettings(updates))
})
