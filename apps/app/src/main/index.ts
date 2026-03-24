import { createHttpServer } from './http-server'
import { seedDefaultSkills } from './lib/config-paths'
import { stopAllAgents } from './lib/agent-service'
import { initializeRuntime } from './lib/runtime-init'

let shuttingDown = false

function registerShutdownHandlers(server: ReturnType<typeof createHttpServer>): void {
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return
    shuttingDown = true

    console.log(`[HTTP] 收到 ${signal}，开始关闭服务...`)

    try {
      stopAllAgents()
    } finally {
      server.stop(true)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

async function main(): Promise<void> {
  await initializeRuntime()
  seedDefaultSkills()

  const server = createHttpServer()
  registerShutdownHandlers(server)

  console.log(`[HTTP] Proma 服务已启动: http://127.0.0.1:${server.port}`)
}

main().catch((error) => {
  console.error('[HTTP] 服务启动失败:', error)
  stopAllAgents()
  process.exit(1)
})
