import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Check, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { agentSessionsAtom } from '@/atoms/agent-atoms'
import { api } from '@/lib/api'

interface AgentHeaderProps {
  sessionId: string
}

export function AgentHeader({ sessionId }: AgentHeaderProps): React.ReactElement | null {
  const sessions = useAtomValue(agentSessionsAtom)
  const setSessions = useSetAtom(agentSessionsAtom)
  const session = sessions.find((item) => item.id === sessionId) ?? null
  const [editing, setEditing] = React.useState(false)
  const [draftTitle, setDraftTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [editing])

  if (!session) return null

  const saveTitle = async (): Promise<void> => {
    const trimmed = draftTitle.trim()
    if (!trimmed || trimmed === session.title) {
      setEditing(false)
      return
    }

    try {
      const updated = await api.updateSessionTitle(sessionId, trimmed)
      setSessions((prev) => prev.map((item) => item.id === updated.id ? updated : item))
    } catch (error) {
      console.error('[AgentHeader] 更新标题失败:', error)
      toast.error(error instanceof Error ? error.message : '更新标题失败')
    } finally {
      setEditing(false)
    }
  }

  return (
    <div className="relative z-[51] flex h-[48px] items-center gap-2 px-4 titlebar-drag-region">
      {editing ? (
        <div className="titlebar-no-drag flex min-w-0 flex-1 items-center gap-1.5">
          <input
            ref={inputRef}
            value={draftTitle}
            maxLength={100}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => { void saveTitle() }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveTitle()
              }
              if (event.key === 'Escape') {
                setEditing(false)
              }
            }}
            className="min-w-0 flex-1 border-b border-primary/50 bg-transparent px-0 py-0.5 text-sm font-medium outline-none"
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { void saveTitle() }}
            className="p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setEditing(false)}
            className="p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{session.title}</span>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setDraftTitle(session.title)
              setEditing(true)
            }}
            className="titlebar-no-drag p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="编辑标题"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
