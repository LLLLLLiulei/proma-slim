import { Hono } from 'hono'
import { getUserProfile, updateUserProfile } from '../../lib/user-profile-service'
import { readJsonBody } from '../responses'

export const userProfileRoutes = new Hono()

userProfileRoutes.get('/', (c) => {
  return c.json(getUserProfile())
})

userProfileRoutes.patch('/', async (c) => {
  const updates = await readJsonBody<Record<string, unknown>>(c.req.raw)
  return c.json(updateUserProfile(updates))
})
