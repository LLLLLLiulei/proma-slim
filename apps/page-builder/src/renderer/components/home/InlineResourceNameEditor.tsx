import * as React from 'react'
import { Check, Pencil, X } from 'lucide-react'

interface InlineResourceNameEditorProps {
  disabled?: boolean
  editAriaLabel: string
  inputAriaLabel: string
  onSave: (name: string) => Promise<void> | void
  saving?: boolean
  value: string
}

export function InlineResourceNameEditor({
  disabled = false,
  editAriaLabel,
  inputAriaLabel,
  onSave,
  saving = false,
  value,
}: InlineResourceNameEditorProps): React.ReactElement {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)
  const [error, setError] = React.useState<string | null>(null)
  const [localSaving, setLocalSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const busy = saving || localSaving

  React.useEffect(() => {
    if (!editing) {
      setDraft(value)
    }
  }, [editing, value])

  React.useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const startEditing = React.useCallback(() => {
    if (disabled || busy) return
    setDraft(value)
    setError(null)
    setEditing(true)
  }, [busy, disabled, value])

  const cancelEditing = React.useCallback(() => {
    if (busy) return
    setDraft(value)
    setError(null)
    setEditing(false)
  }, [busy, value])

  const saveDraft = React.useCallback(async () => {
    if (busy) return

    const normalized = draft.trim()
    if (!normalized) {
      setError('名称不能为空')
      return
    }

    if (normalized === value) {
      setError(null)
      setEditing(false)
      return
    }

    setLocalSaving(true)
    setError(null)
    try {
      await onSave(normalized)
      setEditing(false)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '名称保存失败')
    } finally {
      setLocalSaving(false)
    }
  }, [busy, draft, onSave, value])

  if (!editing) {
    return (
      <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
        <button
          className="min-w-0 truncate text-left outline-none transition-colors hover:text-foreground/72 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || busy}
          onClick={startEditing}
          title={value}
          type="button"
        >
          {value}
        </button>
        <button
          aria-label={editAriaLabel}
          className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || busy}
          onClick={startEditing}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          <Pencil className="size-3.5" />
        </button>
      </h3>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          aria-label={inputAriaLabel}
          className="min-w-0 flex-1 border-b border-primary/40 bg-transparent px-0 py-0.5 text-sm font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          maxLength={100}
          onBlur={() => {
            void saveDraft()
          }}
          onChange={(event) => {
            setDraft(event.currentTarget.value)
            if (error) setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void saveDraft()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelEditing()
            }
          }}
          ref={inputRef}
          value={draft}
        />
        <button
          aria-label="确认名称修改"
          className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          onClick={() => {
            void saveDraft()
          }}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          <Check className="size-3.5" />
        </button>
        <button
          aria-label="取消名称修改"
          className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          onClick={cancelEditing}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
