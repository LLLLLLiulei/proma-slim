import { fileURLToPath } from 'node:url'
import { createHttpRouter } from './http-router'

const DEFAULT_PORT = 3000

function getPort(): number {
  const rawPort = process.env.PORT?.trim()
  if (!rawPort) return DEFAULT_PORT

  const parsed = Number(rawPort)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`无效的 PORT: ${rawPort}`)
  }

  return parsed
}

function getDistDir(): string {
  return fileURLToPath(new URL('../../dist', import.meta.url))
}

export function createHttpServer() {
  const router = createHttpRouter({
    distDir: getDistDir(),
    isDev: process.env.NODE_ENV !== 'production',
  })

  return Bun.serve({
    port: getPort(),
    idleTimeout: 255,
    fetch(request) {
      return router.handle(request)
    },
    error(error) {
      console.error('[HTTP] 未处理的服务错误:', error)
      return new Response('Internal Server Error', { status: 500 })
    },
  })
}
