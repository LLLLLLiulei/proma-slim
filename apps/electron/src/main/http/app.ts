import { Hono } from 'hono'
import { HttpError } from './errors'
import type { HttpAppOptions } from './static-handler'
import { serveStatic } from './static-handler'
import { json } from './responses'
import { settingsRoutes } from './routes/settings'
import { sessionRoutes } from './routes/sessions'
import { statusRoutes } from './routes/status'
import { userProfileRoutes } from './routes/user-profile'
import { workspaceRoutes } from './routes/workspaces'

export function createHttpApp(options: HttpAppOptions) {
  const app = new Hono()

  app.route('/api/status', statusRoutes)
  app.route('/api/settings', settingsRoutes)
  app.route('/api/user-profile', userProfileRoutes)
  app.route('/api/workspaces', workspaceRoutes)
  app.route('/api/sessions', sessionRoutes)

  app.notFound(async (c) => {
    if (c.req.path.startsWith('/api/')) {
      return json({ error: '接口不存在' }, 404)
    }

    return serveStatic(c.req.raw, options)
  })

  app.onError((error) => {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status)
    }

    console.error('[HTTP] 路由处理失败:', error)
    return json({ error: '服务器内部错误' }, 500)
  })

  return app
}
