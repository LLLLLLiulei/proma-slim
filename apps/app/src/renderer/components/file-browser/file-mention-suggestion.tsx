import type React from 'react'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import type { FileIndexEntry } from '@ai-page-builder/shared'
import { api } from '@/lib/api'
import { createMentionPopup, positionPopup } from '@/components/agent/mention-popup-utils'
import { FileMentionList } from './FileMentionList'
import type { FileMentionRef } from './FileMentionList'

export function createFileMentionSuggestion(
  workspaceIdRef: React.RefObject<string | null>,
  workspacePathRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  attachedDirsRef?: React.RefObject<string[]>,
): Omit<SuggestionOptions<FileIndexEntry>, 'editor'> {
  return {
    char: '@',
    allowSpaces: false,
    items: async ({ query }: { query: string }): Promise<FileIndexEntry[]> => {
      const workspaceId = workspaceIdRef.current
      const workspacePath = workspacePathRef.current
      if (!workspaceId || !workspacePath) return []

      try {
        const result = await api.searchWorkspaceFiles(
          workspaceId,
          query ?? '',
          8,
          attachedDirsRef?.current ?? [],
        )
        return result.entries
      } catch {
        return []
      }
    },
    render: () => {
      let renderer: ReactRenderer<FileMentionRef> | null = null
      let popup: HTMLDivElement | null = null

      return {
        onStart(props: SuggestionProps<FileIndexEntry, { id: string; label: string }>) {
          mentionActiveRef.current = true
          renderer = new ReactRenderer(FileMentionList, {
            props: {
              items: props.items,
              selectedIndex: 0,
              onSelect: (item: FileIndexEntry) => {
                props.command({ id: item.path, label: item.name })
              },
            },
            editor: props.editor,
          })

          popup = createMentionPopup(renderer.element)
          positionPopup(popup, props.clientRect?.())
        },
        onUpdate(props: SuggestionProps<FileIndexEntry, { id: string; label: string }>) {
          renderer?.updateProps({ items: props.items })
          positionPopup(popup, props.clientRect?.())
        },
        onKeyDown(props: SuggestionKeyDownProps) {
          return renderer?.ref?.onKeyDown({ event: props.event }) ?? false
        },
        onExit() {
          mentionActiveRef.current = false
          popup?.remove()
          popup = null
          renderer?.destroy()
          renderer = null
        },
      }
    },
  }
}
