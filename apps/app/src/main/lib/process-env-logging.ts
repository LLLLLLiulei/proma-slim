export type ProcessEnvLogger = (message: string) => void

export function logCurrentProcessEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  logger: ProcessEnvLogger = console.log,
): void {
  logger('[HTTP] 当前环境变量开始')

  for (const [key, value] of Object.entries(env)) {
    logger(`[HTTP] ${key}=${value ?? ''}`)
  }

  logger('[HTTP] 当前环境变量结束')
}
