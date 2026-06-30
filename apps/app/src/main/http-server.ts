import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createHttpApp } from './http/app'

const DEFAULT_PORT = 3000

interface ClosableConnectionsServer {
  closeAllConnections?: () => void
}

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
  const app = createHttpApp({
    distDir: getDistDir(),
    isDev: process.env.NODE_ENV !== 'production',
  })
  const port = getPort()
  const server = serve({
    port,
    fetch(request) {
      return app.fetch(request)
    },
  })

  return {
    get port(): number {
      const address = server.address()
      return typeof address === 'object' && address ? address.port : port
    },
    stop(force?: boolean): void {
      const closableServer = server as ClosableConnectionsServer
      if (force && typeof closableServer.closeAllConnections === 'function') {
        closableServer.closeAllConnections()
      }
      server.close((error) => {
        if (error) {
          console.error('[HTTP] 关闭服务失败:', error)
        }
      })
    },
  }
}
