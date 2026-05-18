type ProcessErrorEvent = 'unhandledRejection' | 'uncaughtException'

interface ProcessErrorEventTarget {
  on(event: ProcessErrorEvent, listener: (...args: unknown[]) => void): unknown
}

interface ProcessErrorHandlerDeps {
  process?: ProcessErrorEventTarget
  logger?: Pick<Console, 'error'>
  stopAllAgents: () => void
  exit?: (code: number) => void
}

export function registerProcessErrorHandlers(deps: ProcessErrorHandlerDeps): void {
  const targetProcess = deps.process ?? process
  const logger = deps.logger ?? console
  const exit = deps.exit ?? ((code: number) => process.exit(code))
  let uncaughtExceptionShutdownStarted = false

  targetProcess.on('unhandledRejection', (reason) => {
    logger.error('[HTTP] 未处理 Promise rejection:', reason)
  })

  targetProcess.on('uncaughtException', (error) => {
    logger.error('[HTTP] 未处理异常，准备停止 Agent 并退出进程:', error)

    if (!uncaughtExceptionShutdownStarted) {
      uncaughtExceptionShutdownStarted = true
      try {
        deps.stopAllAgents()
      } catch (stopError) {
        logger.error('[HTTP] 停止 Agent 时发生异常:', stopError)
      }
    }

    exit(1)
  })
}
