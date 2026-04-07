import * as React from 'react'
import { TooltipProvider } from './components/ui/tooltip'
import { AppShell } from './components/app-shell/AppShell'
import { api, type AppStatus } from './lib/api'

function getStatusMessage(status: AppStatus | null, error: string | null): string | null {
  if (error) return `无法连接后端服务: ${error}`
  if (!status) return null
  if (status.ok) return null
  if (!status.apiKeyConfigured) return '未检测到 ANTHROPIC_API_KEY，发送消息前请先配置环境变量。'
  if (!status.sdkCliAvailable) return '未检测到 Claude Agent SDK CLI。请先执行 bun install 安装依赖，并确认 Claude Code CLI 可用后重启服务。'
  return '后端服务尚未就绪。'
}

export default function App(): React.ReactElement {
  const [status, setStatus] = React.useState<AppStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    async function initialize(): Promise<void> {
      try {
        const nextStatus = await api.getStatus()
        if (!cancelled) {
          setStatus(nextStatus)
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : '未知错误')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void initialize()
    return () => {
      cancelled = true
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">正在连接服务...</p>
        </div>
      </div>
    )
  }

  const statusMessage = getStatusMessage(status, error)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="proma-app-background flex h-screen min-h-0 flex-col overflow-hidden">
        {statusMessage && (
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            {statusMessage}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <AppShell />
        </div>
      </div>
    </TooltipProvider>
  )
}
