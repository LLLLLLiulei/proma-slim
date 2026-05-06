import * as React from 'react'
import { FileText, Folder } from 'lucide-react'
import type { FileIndexEntry } from '@ai-page-builder/shared'
import { cn } from '@/lib/utils'

export interface FileMentionListProps {
  items: FileIndexEntry[]
  selectedIndex: number
  onSelect: (item: FileIndexEntry) => void
}

export interface FileMentionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export const FileMentionList = React.forwardRef<FileMentionRef, FileMentionListProps>(
  function FileMentionList({ items, selectedIndex, onSelect }, ref) {
    const [localIndex, setLocalIndex] = React.useState(selectedIndex)
    const containerRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
      setLocalIndex(0)
    }, [items])

    React.useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const item = container.children[localIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }, [localIndex])

    React.useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setLocalIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1))
          return true
        }
        if (event.key === 'ArrowDown') {
          setLocalIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1))
          return true
        }
        if (event.key === 'Enter') {
          const item = items[localIndex]
          if (item) onSelect(item)
          return true
        }
        if (event.key === 'Escape') {
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="rounded-lg border bg-popover p-2 text-[11px] text-muted-foreground shadow-lg">
          无匹配文件
        </div>
      )
    }

    return (
      <div ref={containerRef} className="max-h-[200px] min-w-[200px] overflow-y-auto rounded-lg border bg-popover shadow-lg">
        {items.map((item, index) => (
          <button
            key={item.path}
            type="button"
            className={cn(
              'flex w-full items-center gap-1.5 px-2.5 py-1 text-left text-xs transition-colors hover:bg-accent',
              index === localIndex && 'bg-accent text-accent-foreground',
            )}
            onClick={() => onSelect(item)}
          >
            {item.type === 'dir'
              ? <Folder className="size-3 shrink-0 text-amber-500" />
              : <FileText className="size-3 shrink-0 text-muted-foreground" />}
            <span className="flex-1 truncate">{item.name}</span>
            {item.path !== item.name && (
              <span className="max-w-[120px] truncate text-[10px] text-muted-foreground/60">
                {item.path}
              </span>
            )}
          </button>
        ))}
      </div>
    )
  },
)
