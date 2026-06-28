import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CodeEditorTabFile {
  path: string
}

export interface CodeEditorTabsProps {
  openFiles: CodeEditorTabFile[]
  activePath: string | null
  dirtyPaths: Set<string>
  onSelect: (path: string) => void
  onClose: (path: string) => void
}

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

export function CodeEditorTabs({ openFiles, activePath, dirtyPaths, onSelect, onClose }: CodeEditorTabsProps) {
  if (openFiles.length === 0) {
    return null
  }

  return (
    <div className="flex items-stretch overflow-x-auto border-b border-border/55">
      {openFiles.map((file) => {
        const isActive = file.path === activePath
        const isDirty = dirtyPaths.has(file.path)
        return (
          <div
            key={file.path}
            className={cn(
              'group flex items-center gap-1.5 whitespace-nowrap border-r border-border/40 px-3 py-1.5 text-xs',
              isActive ? 'bg-background text-foreground' : 'bg-muted/40 text-muted-foreground hover:bg-muted/70',
            )}
          >
            <button type="button" className="flex items-center" onClick={() => onSelect(file.path)}>
              <span className={cn(isDirty && 'font-semibold')}>{basename(file.path)}</span>
              {isDirty && <span className="ml-1 size-1.5 rounded-full bg-foreground/70" />}
            </button>
            <button
              type="button"
              aria-label={`关闭 ${basename(file.path)}`}
              onClick={() => onClose(file.path)}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
