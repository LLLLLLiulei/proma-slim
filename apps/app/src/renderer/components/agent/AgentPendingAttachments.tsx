import * as React from 'react'
import { Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PendingAgentAttachment } from './agent-attachments'

function truncateName(name: string, max = 20): string {
  return name.length > max ? name.slice(0, max - 3) + '...' : name
}

export function AgentPendingAttachments({
  attachments,
  onRemove,
}: {
  attachments: PendingAgentAttachment[]
  onRemove: (id: string) => void
}): React.ReactElement | null {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-1 px-[15px] py-[5px]">
      {attachments.map((attachment) => (
        attachment.previewUrl ? (
          <div
            key={attachment.id}
            className="group/attachment relative size-[72px] shrink-0 overflow-hidden rounded-lg"
          >
            <img
              src={attachment.previewUrl}
              alt={attachment.file.name}
              className="size-full object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(attachment.id)}
              className={cn(
                'absolute right-1 top-1 flex size-[18px] items-center justify-center rounded-full',
                'bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200',
                'group-hover/attachment:opacity-100 hover:bg-black/70',
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <div
            key={attachment.id}
            className={cn(
              'group/attachment relative flex shrink-0 items-center gap-2 rounded-lg',
              'border border-[#37a5aa]/20 bg-[#37a5aa]/10 pl-2.5 pr-7 py-1.5 text-[13px] text-[#37a5aa]',
              'transition-colors hover:bg-[#37a5aa]/15',
            )}
          >
            <Paperclip className="size-4 shrink-0" />
            <span className="max-w-[160px] truncate">{truncateName(attachment.file.name)}</span>
            <button
              type="button"
              onClick={() => onRemove(attachment.id)}
              className={cn(
                'absolute right-1.5 top-1/2 flex size-[18px] -translate-y-1/2 items-center justify-center rounded-full',
                'text-[#37a5aa]/60 opacity-0 transition-all duration-200',
                'group-hover/attachment:opacity-100 hover:bg-[#37a5aa]/20 hover:text-[#37a5aa]',
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        )
      ))}
    </div>
  )
}
