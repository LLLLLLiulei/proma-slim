import * as React from 'react'
import { Database, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PageBuilderBlockActionBar({
  className,
  onOpenCms,
  style,
}: {
  className?: string
  onOpenCms: () => void
  style?: React.CSSProperties
}): React.ReactElement {
  return (
    <div
      className={cn(
        'pointer-events-auto absolute z-20 flex items-center gap-1 rounded-md border border-border/80 bg-background px-1 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className,
      )}
      style={style}
    >
      <Button
        aria-label="从 CMS 选择数据"
        className="h-7 min-w-[148px] justify-start rounded-sm px-2.5 text-[11px] font-medium text-foreground shadow-none hover:bg-muted/70"
        onClick={onOpenCms}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Database className="size-3.25" />
        从 CMS 选择数据
      </Button>
      <Button
        aria-label="删除"
        className="h-7 min-w-[68px] justify-start rounded-sm px-2.5 text-[11px] font-medium text-destructive shadow-none hover:bg-muted/70 hover:text-destructive"
        disabled
        size="sm"
        type="button"
        variant="ghost"
      >
        <Trash2 className="size-3.25" />
        删除
      </Button>
    </div>
  )
}
