import * as React from 'react'
import { Database, Image, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PageBuilderBlockActionBar({
  actionsDisabled = false,
  className,
  onDelete,
  onOpenCms,
  onReplaceImage,
  replaceImageDisabled = false,
  style,
}: {
  actionsDisabled?: boolean
  className?: string
  onDelete?: () => void
  onOpenCms: () => void
  onReplaceImage?: () => void
  replaceImageDisabled?: boolean
  style?: React.CSSProperties
}): React.ReactElement {
  return (
    <div
      className={cn(
        'pointer-events-auto absolute z-20 flex items-center gap-0.5 rounded-md border border-border/80 bg-background px-[3px] py-[3px] shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className,
      )}
      style={style}
    >
      {onReplaceImage ? (
        <Button
          aria-label="替换图片"
          className="h-7 shrink-0 justify-start rounded-sm px-2 text-[11px] font-medium text-foreground shadow-none hover:bg-muted/70"
          disabled={actionsDisabled || replaceImageDisabled}
          onClick={onReplaceImage}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Image className="size-3.25" />
          替换图片
        </Button>
      ) : null}
      <Button
        aria-label="从 CMS 选择数据"
        className="h-7 shrink-0 justify-start rounded-sm px-2 text-[11px] font-medium text-foreground shadow-none hover:bg-muted/70"
        disabled={actionsDisabled}
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
        className="h-7 shrink-0 justify-start rounded-sm px-2 text-[11px] font-medium text-destructive shadow-none hover:bg-muted/70 hover:text-destructive"
        disabled={actionsDisabled || !onDelete}
        onClick={onDelete}
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
