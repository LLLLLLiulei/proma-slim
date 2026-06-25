/**
 * AI Elements - plain text input component.
 *
 * The composer intentionally accepts plain text only. It avoids rich text and
 * Markdown conversion so pasted formatted content cannot alter the draft shape.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface PlainTextInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onPasteFiles?: (files: File[]) => void
  placeholder?: string
  suggestionActive?: boolean
  disabled?: boolean
  submitDisabled?: boolean
  autoFocusTrigger?: string | null
  collapsible?: boolean
  workspaceId?: string | null
  workspacePath?: string | null
  workspaceSlug?: string | null
  attachedDirs?: string[]
  className?: string
}

function countVisualLines(value: string): number {
  if (!value) return 1

  return value.split('\n').reduce((total, line) => (
    total + Math.max(1, Math.ceil(line.length / 56))
  ), 0)
}

function insertPlainTextAtSelection(input: HTMLTextAreaElement, text: string): {
  nextValue: string
  nextCursor: number
} {
  const selectionStart = input.selectionStart ?? input.value.length
  const selectionEnd = input.selectionEnd ?? selectionStart
  return {
    nextValue: `${input.value.slice(0, selectionStart)}${text}${input.value.slice(selectionEnd)}`,
    nextCursor: selectionStart + text.length,
  }
}

export function PlainTextInput({
  value,
  onChange,
  onSubmit,
  onPasteFiles,
  placeholder = '有什么可以帮助到你的呢？',
  suggestionActive = false,
  className,
  disabled = false,
  submitDisabled = false,
  autoFocusTrigger,
  collapsible = false,
}: PlainTextInputProps): React.ReactElement {
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const visualLineCount = useMemo(() => countVisualLines(value), [value])
  const isExpanded = visualLineCount > 5
  const showCollapseToggle = collapsible && isExpanded

  useEffect(() => {
    if (disabled) return

    const timer = setTimeout(() => {
      textareaRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [autoFocusTrigger, disabled])

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(event.clipboardData.files ?? [])
    if (files.length > 0 && onPasteFiles) {
      event.preventDefault()
      onPasteFiles(files)
      return
    }

    const plainText = event.clipboardData.getData('text/plain')
    const htmlText = event.clipboardData.getData('text/html')
    if (!plainText && !htmlText) {
      return
    }

    event.preventDefault()
    if (!plainText) {
      return
    }

    const { nextValue, nextCursor } = insertPlainTextAtSelection(event.currentTarget, plainText)
    onChange(nextValue)

    const scheduleSelectionUpdate = globalThis.requestAnimationFrame ?? ((callback: FrameRequestCallback) => {
      return globalThis.setTimeout(callback, 0)
    })
    scheduleSelectionUpdate(() => {
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    if (isComposingRef.current || event.nativeEvent.isComposing) {
      return
    }

    if (submitDisabled) {
      return
    }

    event.preventDefault()
    onSubmit()
  }

  return (
    <div
      className={cn(
        'relative w-full overflow-y-auto transition-[max-height] duration-200 ease-in-out',
        isManuallyCollapsed ? 'max-h-[60px]' : isExpanded ? 'max-h-[500px]' : 'max-h-[200px]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <textarea
        ref={textareaRef}
        aria-label="消息输入框"
        className={cn(
          'min-h-[60px] w-full resize-none bg-transparent px-[15px] pb-0 pt-1.5 text-[14px] leading-[1.6] text-foreground outline-none',
          'placeholder:text-muted-foreground/50',
          suggestionActive && 'placeholder:italic',
        )}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        onCompositionEnd={() => {
          isComposingRef.current = false
        }}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        rows={3}
        spellCheck={false}
        value={value}
      />
      {showCollapseToggle && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="sticky bottom-1 float-right z-10 mr-2 rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted/80 hover:text-muted-foreground"
              onClick={() => setIsManuallyCollapsed((prev) => !prev)}
            >
              {isManuallyCollapsed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isManuallyCollapsed ? '展开输入框' : '折叠输入框'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
