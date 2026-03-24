import * as React from 'react'
import { cn } from '@/lib/utils'

export interface MentionListProps<T> {
  items: T[]
  selectedIndex: number
  onSelect: (item: T) => void
  emptyText: string
  keyExtractor: (item: T) => string
  renderItem: (item: T) => React.ReactNode
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

function MentionListInner<T>(
  { items, onSelect, emptyText, keyExtractor, renderItem }: MentionListProps<T>,
  ref: React.ForwardedRef<MentionListRef>,
): React.ReactElement {
  const [localIndex, setLocalIndex] = React.useState(0)
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
      <div className="w-[280px] rounded-lg border bg-popover p-2 text-[11px] text-muted-foreground shadow-lg">
        {emptyText}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="max-h-[240px] w-[280px] overflow-y-auto rounded-lg border bg-popover shadow-lg">
      {items.map((item, index) => (
        <button
          key={keyExtractor(item)}
          type="button"
          className={cn(
            'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent',
            index === localIndex && 'bg-accent text-accent-foreground',
          )}
          onClick={() => onSelect(item)}
        >
          {renderItem(item)}
        </button>
      ))}
    </div>
  )
}

export const MentionList = React.forwardRef(MentionListInner) as <T>(
  props: MentionListProps<T> & { ref?: React.Ref<MentionListRef> },
) => React.ReactElement
