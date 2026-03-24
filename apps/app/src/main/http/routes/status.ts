import { Hono } from 'hono'
import { createStatusPayload } from '../responses'

export const statusRoutes = new Hono()

statusRoutes.get('/', (c) => {
  return c.json(createStatusPayload())
})
