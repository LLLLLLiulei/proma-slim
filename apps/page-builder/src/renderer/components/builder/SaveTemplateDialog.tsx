import * as React from 'react'
import type { PageBuilderTemplateSaveRequest } from '@ai-page-builder/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface SaveTemplateDialogProps {
  cmsIntegrated?: boolean
  defaultName?: string
  errorMessage?: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: PageBuilderTemplateSaveRequest) => void | Promise<void>
  open: boolean
  submitting?: boolean
}

export function SaveTemplateDialog({
  cmsIntegrated = false,
  defaultName = '',
  errorMessage,
  onOpenChange,
  onSubmit,
  open,
  submitting = false,
}: SaveTemplateDialogProps): React.ReactElement {
  const [name, setName] = React.useState(defaultName)
  const nameInputRef = React.useRef<HTMLInputElement>(null)
  const normalizedName = name.trim()
  const submitDisabled = submitting || normalizedName.length === 0

  React.useEffect(() => {
    if (!open) return
    setName(defaultName)
  }, [defaultName, open])

  const handleSubmit = React.useCallback(async () => {
    if (submitDisabled) return

    await onSubmit({
      name: normalizedName,
    })
  }, [normalizedName, onSubmit, submitDisabled])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {open ? (
        <DialogContent
          className="rounded-[24px] border-border/60 sm:max-w-[520px]"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            nameInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>另存为模板</DialogTitle>
            <DialogDescription>
              保存后可在首页模板库中预览并复用该模板。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {cmsIntegrated ? (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-900 dark:text-amber-100">
                CMS 数据会被固化为静态模板，模板不保留 CMS 动态绑定或鉴权信息。
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="page-builder-template-name">
                模板名称
              </label>
              <Input
                aria-label="模板名称"
                disabled={submitting}
                id="page-builder-template-name"
                maxLength={100}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="请输入模板名称"
                ref={nameInputRef}
                value={name}
              />
            </div>

            {errorMessage ? (
              <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={submitDisabled}
              onClick={() => {
                void handleSubmit()
              }}
              type="button"
            >
              {submitting ? '保存中...' : '保存模板'}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
