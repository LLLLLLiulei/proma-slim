import * as React from 'react'
import { AlertTriangle, ArrowUp, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { getPageBuilderPublicBasePath } from '@page-builder/lib/public-base-path'
import { buildBuilderPath } from '@page-builder/lib/routes'
import { clearBootstrapPayload, writeBootstrapPayload } from '@page-builder/lib/bootstrap-cache'
import { PageBuilderHistorySection } from '@page-builder/components/home/PageBuilderHistorySection'
import {
  PageBuilderProjectStartError,
  createPageBuilderProject,
  retryPageBuilderSession,
} from '@page-builder/lib/project-start'

interface RecoverableState {
  workspaceId: string
  prompt: string
}

type IntegrationGateState =
  | { status: 'checking' }
  | { status: 'standalone' }
  | { status: 'cms' }
  | { status: 'error'; message: string }

function navigateTo(pathname: string): void {
  window.history.pushState(null, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function HomePage(): React.ReactElement {
  const [prompt, setPrompt] = React.useState('')
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [recoverable, setRecoverable] = React.useState<RecoverableState | null>(null)
  const [integrationGate, setIntegrationGate] = React.useState<IntegrationGateState>({ status: 'checking' })
  const publicBasePath = getPageBuilderPublicBasePath()

  const loadIntegrationStatus = React.useCallback(async (): Promise<void> => {
    setIntegrationGate({ status: 'checking' })

    try {
      const status = await api.getCmsIntegrationStatus()
      setIntegrationGate(status.integrationMode === 'cms' && status.enabled
        ? { status: 'cms' }
        : { status: 'standalone' })
    } catch (nextError) {
      setIntegrationGate({
        status: 'error',
        message: nextError instanceof Error ? nextError.message : '无法读取集成状态',
      })
    }
  }, [])

  React.useEffect(() => {
    void loadIntegrationStatus()
  }, [loadIntegrationStatus])

  const persistBootstrap = React.useCallback((sessionId: string, workspaceId: string, initialPrompt: string) => {
    if (typeof window === 'undefined') return
    clearBootstrapPayload(window.sessionStorage, sessionId)
    writeBootstrapPayload(window.sessionStorage, {
      sessionId,
      workspaceId,
      initialPrompt,
    })
  }, [])

  const handleStart = React.useCallback(async (): Promise<void> => {
    const initialPrompt = prompt.trim()
    if (integrationGate.status !== 'standalone' || !initialPrompt || starting) return

    setStarting(true)
    setError(null)
    setRecoverable(null)

    try {
      const { workspace, session } = await createPageBuilderProject({
        createWorkspace: api.createWorkspace,
        createSession: api.createSession,
      })

      persistBootstrap(session.id, workspace.id, initialPrompt)
      navigateTo(buildBuilderPath(workspace.id, session.id, publicBasePath))
    } catch (nextError) {
      if (nextError instanceof PageBuilderProjectStartError) {
        setRecoverable({
          workspaceId: nextError.workspace.id,
          prompt: initialPrompt,
        })
        setError('项目已创建，但首个对话初始化失败。你可以直接重试。')
      } else {
        setError(nextError instanceof Error ? nextError.message : '创建项目失败')
      }
    } finally {
      setStarting(false)
    }
  }, [integrationGate.status, persistBootstrap, prompt, publicBasePath, starting])

  const handleRetry = React.useCallback(async (): Promise<void> => {
    if (integrationGate.status !== 'standalone' || !recoverable || starting) return

    setStarting(true)
    setError(null)

    try {
      const session = await retryPageBuilderSession(recoverable.workspaceId, {
        createSession: api.createSession,
      })
      persistBootstrap(session.id, recoverable.workspaceId, recoverable.prompt)
      navigateTo(buildBuilderPath(recoverable.workspaceId, session.id, publicBasePath))
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : '重试创建会话失败'
      setError(message)
      toast.error(message)
    } finally {
      setStarting(false)
    }
  }, [integrationGate.status, persistBootstrap, publicBasePath, recoverable, starting])

  const handlePromptChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(event.target.value)
  }, [])

  const handlePromptPaste = React.useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const plainText = event.clipboardData.getData('text/plain')
    if (!plainText) {
      return
    }

    event.preventDefault()

    const textarea = event.currentTarget
    const selectionStart = textarea.selectionStart ?? textarea.value.length
    const selectionEnd = textarea.selectionEnd ?? selectionStart
    const nextPrompt = `${textarea.value.slice(0, selectionStart)}${plainText}${textarea.value.slice(selectionEnd)}`

    setPrompt(nextPrompt)

    const nextCursorPosition = selectionStart + plainText.length
    const scheduleSelectionRestore = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(0), 0)

    scheduleSelectionRestore(() => {
      if (typeof textarea.setSelectionRange === 'function') {
        textarea.setSelectionRange(nextCursorPosition, nextCursorPosition)
      }
    })
  }, [])

  const handlePromptKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    void handleStart()
  }, [handleStart])

  return (
    <div className="page-builder-home-shell h-[100dvh] overflow-x-hidden overflow-y-auto">
      <div aria-hidden className="page-builder-home-ambient page-builder-home-ambient-animated">
        <div className="page-builder-home-grid" />
        <div className="page-builder-home-orb page-builder-home-orb-left" />
        <div className="page-builder-home-orb page-builder-home-orb-right" />
      </div>

      <div className="page-builder-home-scroll mx-auto flex min-h-full w-full max-w-[1120px] flex-col">
        <section className="page-builder-home-stage flex min-h-[100dvh] items-center justify-center px-4 py-8 sm:px-6">
          <div className="page-builder-home-content flex w-full flex-col items-center gap-8">
            <div className="page-builder-home-copy max-w-[760px] text-center">
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-muted-foreground">Intelligent Page Builder</p>
              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
                几分钟内创建您的网页
              </h1>
              <p className="mx-auto mt-4 max-w-[52ch] text-base leading-7 text-muted-foreground">
                输入你想要的内容和效果，回车后即可创建项目并进入构建页继续完善。
              </p>
            </div>

            {integrationGate.status === 'checking' && (
              <div className="page-builder-home-panel w-full max-w-[520px] p-4 sm:p-5">
                <div className="page-builder-home-surface page-builder-home-panel-surface page-builder-home-panel-flat rounded-[24px] border border-border/55 bg-background/90 px-6 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl">
                  <LoaderCircle className="mx-auto size-6 animate-spin text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">正在检查入口...</p>
                </div>
              </div>
            )}

            {integrationGate.status === 'cms' && (
              <div className="page-builder-home-panel w-full max-w-[600px] p-4 sm:p-5">
                <div className="page-builder-home-surface page-builder-home-panel-surface page-builder-home-panel-flat rounded-[24px] border border-border/55 bg-background/90 px-6 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">请从 CMS 系统进入 PageBuilder</h2>
                  <p className="mx-auto mt-3 max-w-[42ch] text-sm leading-6 text-muted-foreground">
                    当前已启用 CMS 集成模式，需要通过 CMS 项目入口完成访问校验后继续编辑。
                  </p>
                </div>
              </div>
            )}

            {integrationGate.status === 'error' && (
              <div className="page-builder-home-panel w-full max-w-[600px] p-4 sm:p-5">
                <div className="page-builder-home-surface page-builder-home-panel-surface page-builder-home-panel-flat rounded-[24px] border border-destructive/20 bg-destructive/10 px-6 py-8 text-center text-destructive shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-xl">
                  <AlertTriangle className="mx-auto size-6" />
                  <h2 className="mt-4 text-lg font-semibold tracking-tight">服务暂不可用</h2>
                  <p className="mx-auto mt-3 max-w-[42ch] text-sm leading-6">
                    {integrationGate.message}
                  </p>
                  <Button className="mt-5" onClick={() => { void loadIntegrationStatus() }} type="button" variant="outline">
                    重试
                  </Button>
                </div>
              </div>
            )}

            {integrationGate.status === 'standalone' && (
              <>
                <div className="page-builder-home-panel w-full max-w-[960px] p-4 sm:p-5">
                  <div className="page-builder-home-surface page-builder-home-panel-surface page-builder-home-panel-flat page-builder-home-panel-focus rounded-[24px] border border-border/55 bg-background/90 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl">
                    <textarea
                      aria-label="页面需求输入框"
                      className="page-builder-home-textarea min-h-[210px] w-full resize-none bg-transparent px-4 py-4 text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/80"
                      disabled={starting}
                      onChange={handlePromptChange}
                      onKeyDown={handlePromptKeyDown}
                      onPaste={handlePromptPaste}
                      value={prompt}
                      placeholder="例如：为一家 AI 咨询公司生成官网，科技感、极简、带案例展示与联系表单。"
                      rows={7}
                      spellCheck={false}
                    />

                    <div className="flex justify-end px-2 pb-2 pt-1">
                      <Button
                        className="page-builder-home-submit size-10 rounded-full"
                        disabled={!prompt.trim() || starting}
                        onClick={() => { void handleStart() }}
                        size="icon"
                        type="button"
                      >
                        {starting
                          ? <LoaderCircle className="size-4 animate-spin" />
                          : <ArrowUp className="size-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {(error || recoverable) && (
                  <div className="page-builder-home-error flex w-full max-w-[960px] flex-col gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>{error ?? '创建项目失败'}</span>
                    </div>
                    {recoverable && (
                      <Button className="self-start sm:self-auto" onClick={() => { void handleRetry() }} type="button" variant="outline">
                        重试创建会话
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {integrationGate.status === 'standalone' && (
          <div className="page-builder-home-history-shell px-4 pb-8 sm:px-6 sm:pb-10">
            <PageBuilderHistorySection />
          </div>
        )}
      </div>
    </div>
  )
}
