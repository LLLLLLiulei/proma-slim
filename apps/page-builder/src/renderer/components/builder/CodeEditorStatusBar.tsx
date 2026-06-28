import * as React from 'react'
import { Moon, Save, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PAGE_BUILDER_CODE_EDITOR_THEMES,
  type PageBuilderCodeEditorThemeId,
} from '@page-builder/lib/code-editor-theme'

export interface CodeEditorStatusBarProps {
  themeId: PageBuilderCodeEditorThemeId
  saveDisabled: boolean
  onThemeChange: (themeId: PageBuilderCodeEditorThemeId) => void
  onSave: () => void
}

export function CodeEditorStatusBar({
  themeId,
  saveDisabled,
  onThemeChange,
  onSave,
}: CodeEditorStatusBarProps) {
  const isDark = themeId === 'dark'
  const nextThemeId: PageBuilderCodeEditorThemeId = isDark ? 'light' : 'dark'
  const currentThemeLabel = PAGE_BUILDER_CODE_EDITOR_THEMES[themeId].label
  const nextThemeLabel = PAGE_BUILDER_CODE_EDITOR_THEMES[nextThemeId].label

  return (
    <div className="flex items-center justify-between border-t border-border/55 px-3 py-1 text-xs text-muted-foreground">
      <button
        type="button"
        aria-label="保存文件"
        disabled={saveDisabled}
        onClick={onSave}
        className="inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-muted disabled:opacity-40"
      >
        <Save className="size-3" /> 保存 (⌘S)
      </button>
      <div className="inline-flex items-center">
        <button
          type="button"
          role="switch"
          aria-label="编辑器主题"
          aria-checked={isDark}
          title={`当前${currentThemeLabel}，点击切换为${nextThemeLabel}`}
          onClick={() => onThemeChange(nextThemeId)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            isDark ? 'border-slate-700 bg-slate-950' : 'border-border bg-muted',
          )}
        >
          <span
            className={cn(
              'inline-flex size-4 items-center justify-center rounded-full shadow-sm transition-transform',
              isDark
                ? 'translate-x-[18px] bg-black text-white'
                : 'translate-x-0.5 bg-background text-muted-foreground',
            )}
          >
            {isDark ? <Moon className="size-3" /> : <Sun className="size-3" />}
          </span>
        </button>
      </div>
    </div>
  )
}
