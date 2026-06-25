import * as React from 'react'
import { CornerUpLeft, Database, Image, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PageBuilderBlockActionBar({
  actionsDisabled = false,
  className,
  onClearSelection,
  onDelete,
  onOpenCms,
  onReplaceImage,
  onSelectParent,
  replaceImageDisabled = false,
  style,
}: {
  actionsDisabled?: boolean
  className?: string
  onClearSelection?: () => void
  onDelete?: () => void
  onOpenCms?: () => void
  onReplaceImage?: () => void
  onSelectParent?: () => void
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
      <Button
        aria-label="选择上一级"
        className="h-7 shrink-0 justify-start rounded-sm px-2 text-[11px] font-medium text-foreground shadow-none hover:bg-muted/70"
        disabled={actionsDisabled || !onSelectParent}
        onClick={onSelectParent}
        size="sm"
        type="button"
        variant="ghost"
      >
        <CornerUpLeft className="size-3.25" />
        选择上一级
      </Button>
      <Button
        aria-label="取消选择"
        className="h-7 shrink-0 justify-start rounded-sm px-2 text-[11px] font-medium text-foreground shadow-none hover:bg-muted/70"
        disabled={actionsDisabled || !onClearSelection}
        onClick={onClearSelection}
        size="sm"
        type="button"
        variant="ghost"
      >
        <X className="size-3.25" />
        取消选择
      </Button>
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
      {onOpenCms ? (
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
      ) : null}
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
