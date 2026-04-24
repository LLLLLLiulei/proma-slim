import * as React from 'react'
import { useAtom } from 'jotai'
import { Check, Shield, ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { allPendingPermissionRequestsAtom } from '@/atoms/agent-atoms'
import { api } from '@/lib/api'
import type { DangerLevel } from '@proma/shared'
import { formatAgentToolLabel } from './tool-labels'

const DANGER_ICON_STYLES: Record<DangerLevel, string> = {
  safe: 'text-green-500',
  normal: 'text-primary',
  dangerous: 'text-amber-500',
}

interface PermissionBannerProps {
  sessionId: string
}

function isMissingPermissionRequestError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('权限请求不存在:')
}

export function PermissionBanner({ sessionId }: PermissionBannerProps): React.ReactElement | null {
  const [allRequests, setAllRequests] = useAtom(allPendingPermissionRequestsAtom)
  const requests = allRequests.get(sessionId) ?? []
  const request = requests[0] ?? null
  const [responding, setResponding] = React.useState(false)

  if (!request) return null

  const iconColor = DANGER_ICON_STYLES[request.dangerLevel]
  const IconComponent = request.dangerLevel === 'dangerous' ? ShieldAlert : Shield

  const respond = async (behavior: 'allow' | 'deny', alwaysAllow = false): Promise<void> => {
    if (responding) return
    setResponding(true)

    try {
      await api.respondPermission(sessionId, {
        requestId: request.requestId,
        behavior,
        alwaysAllow,
      })
      setAllRequests((prev) => {
        const map = new Map(prev)
        const current = map.get(sessionId) ?? []
        const next = current.filter((item) => item.requestId !== request.requestId)
        if (next.length === 0) {
          map.delete(sessionId)
        } else {
          map.set(sessionId, next)
        }
        return map
      })
    } catch (error) {
      if (isMissingPermissionRequestError(error)) {
        setAllRequests((prev) => {
          const map = new Map(prev)
          const current = map.get(sessionId) ?? []
          const next = current.filter((item) => item.requestId !== request.requestId)
          if (next.length === 0) {
            map.delete(sessionId)
          } else {
            map.set(sessionId, next)
          }
          return map
        })
      } else {
        console.error('[PermissionBanner] 响应权限失败:', error)
      }
    } finally {
      setResponding(false)
    }
  }

  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <IconComponent className={`size-4 ${iconColor}`} />
          <span className="text-sm font-medium">需要确认</span>
          {requests.length > 1 && <span className="text-xs text-muted-foreground">(+{requests.length - 1})</span>}
        </div>
        <span className="text-xs font-mono text-muted-foreground">{formatAgentToolLabel(request.toolName)}</span>
      </div>

      <div className="px-3 pb-2">
        {request.command ? (
          <pre className="max-h-[120px] overflow-auto whitespace-pre-wrap rounded bg-background/70 px-2 py-1.5 text-xs font-mono">{request.command}</pre>
        ) : Object.keys(request.toolInput).length > 0 ? (
          <pre className="max-h-[120px] overflow-auto whitespace-pre-wrap rounded bg-background/70 px-2 py-1.5 text-xs font-mono">{JSON.stringify(request.toolInput, null, 2)}</pre>
        ) : (
          <p className="text-xs text-muted-foreground">{request.description}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-3 pb-3">
        <Button variant="ghost" size="sm" disabled={responding} onClick={() => { void respond('deny') }}>
          <X className="mr-1 size-3" />
          拒绝
        </Button>
        <Button variant="outline" size="sm" disabled={responding} onClick={() => { void respond('allow', true) }}>
          会话内总是允许
        </Button>
        <Button size="sm" disabled={responding} onClick={() => { void respond('allow') }}>
          <Check className="mr-1 size-3" />
          允许
        </Button>
      </div>
    </div>
  )
}
