import { Hono } from 'hono'
import { deletePageBuilderProject, listPageBuilderProjects } from '../../lib/page-builder-project-service'
import { readPageBuilderPreviewBridgeScript } from '../../lib/page-builder-preview-bridge'
import { HttpError } from '../errors'
import { noContent } from '../responses'

export const pageBuilderRoutes = new Hono()

pageBuilderRoutes.get('/preview-bridge.js', () => {
  return new Response(readPageBuilderPreviewBridgeScript(), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/javascript; charset=utf-8',
    },
  })
})

pageBuilderRoutes.get('/projects', (c) => {
  return c.json(listPageBuilderProjects())
})

pageBuilderRoutes.delete('/projects/:workspaceId', (c) => {
  try {
    deletePageBuilderProject(c.req.param('workspaceId'))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('page-builder 项目不存在:')) {
      throw new HttpError(404, error.message)
    }
    throw error
  }

  return noContent()
})
