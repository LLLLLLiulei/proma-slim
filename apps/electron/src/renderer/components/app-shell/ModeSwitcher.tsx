import * as React from 'react'
import { Bot } from 'lucide-react'

export function ModeSwitcher(): React.ReactElement {
  return (
    <div className="px-2 pt-2">
      <div
        className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/90 px-3 py-2 shadow-sm"
        aria-label="当前模式"
      >
        <Bot className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Agent</span>
      </div>
    </div>
  )
}
