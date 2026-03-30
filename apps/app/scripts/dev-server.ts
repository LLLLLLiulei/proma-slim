import { createWriteStream } from 'node:fs'
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
