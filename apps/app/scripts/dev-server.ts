import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { applyAgentSdkEnvFileOverrides } from '../src/main/lib/agent-runtime-env'
import { resolveDevServerLoggingRuntime } from '../src/main/lib/dev-server-logging'

interface DevServerCliOptions {
  entryPath: string
  logFileName: string
}

function parseArgs(argv: string[]): DevServerCliOptions {
  let entryPath = ''
  let logFileName = ''

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (current === '--entry') {
      entryPath = argv[index + 1] ?? ''
      index += 1
      continue
    }

    if (current === '--log-name') {
      logFileName = argv[index + 1] ?? ''
      index += 1
    }
  }

  if (!entryPath) {
    throw new Error('缺少 --entry 参数')
  }

  if (!logFileName) {
    throw new Error('缺少 --log-name 参数')
  }

  return { entryPath, logFileName }
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir

  while (true) {
    const packageJsonPath = join(current, 'package.json')
    if (existsSync(packageJsonPath) && readFileSync(packageJsonPath, 'utf-8').includes('"workspaces"')) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) return startDir
    current = parent
  }
}

function applyLocalAgentSdkEnvOverrides(): void {
  if (process.env.NODE_ENV !== 'development') return

  const envFilePath = join(findWorkspaceRoot(process.cwd()), '.env.local')
  if (!existsSync(envFilePath)) return

  const result = applyAgentSdkEnvFileOverrides(readFileSync(envFilePath, 'utf-8'), process.env)
  if (result.appliedKeys.length > 0) {
    console.log(`[开发服务] 已使用 .env.local 覆盖 Agent SDK 环境变量: ${result.appliedKeys.join(', ')}`)
  }
}

async function pipeToOutputs(
  stream: ReadableStream<Uint8Array> | null | undefined,
  target: NodeJS.WriteStream,
  logFile: ReturnType<typeof createWriteStream>,
): Promise<void> {
  if (!stream) return

  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    if (!value) continue

    const chunk = Buffer.from(value)
    target.write(chunk)
    logFile.write(chunk)
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  applyLocalAgentSdkEnvOverrides()

  const runtime = resolveDevServerLoggingRuntime({
    cwd: process.cwd(),
    entryPath: options.entryPath,
    logFileName: options.logFileName,
  })
  const logFile = createWriteStream(runtime.logFilePath, { flags: 'w' })

  console.log(`[开发服务] 配置目录: ${runtime.configDir}`)
  console.log(`[开发服务] 后端日志: ${runtime.logFilePath}`)

  const child = Bun.spawn(
    [process.execPath, '--watch', runtime.entryPath],
    {
      cwd: process.cwd(),
      env: process.env,
      stdin: 'inherit',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  const handleSigint = () => child.kill('SIGINT')
  const handleSigterm = () => child.kill('SIGTERM')

  process.on('SIGINT', handleSigint)
  process.on('SIGTERM', handleSigterm)

  try {
    const [exitCode] = await Promise.all([
      child.exited,
      pipeToOutputs(child.stdout, process.stdout, logFile),
      pipeToOutputs(child.stderr, process.stderr, logFile),
    ])

    await new Promise<void>((resolve) => {
      logFile.end(() => resolve())
    })
    process.exit(exitCode)
  } finally {
    process.off('SIGINT', handleSigint)
    process.off('SIGTERM', handleSigterm)
  }
}

void main().catch((error) => {
  console.error('[开发服务] 启动失败:', error)
  process.exit(1)
})
