import type React from 'react'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import { Server, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { MentionList } from './MentionList'
import type { MentionListRef } from './MentionList'
import { createMentionPopup, positionPopup } from './mention-popup-utils'

interface MentionSuggestionConfig<T> {
  char: string
  emptyText: string
  fetchItems: (workspaceId: string, query: string) => Promise<T[]>
  keyExtractor: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  toCommand: (item: T) => { id: string; label: string }
}

function createMentionSuggestion<T>(
  config: MentionSuggestionConfig<T>,
  workspaceIdRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
): Omit<SuggestionOptions<T>, 'editor'> {
  return {
    char: config.char,
    allowSpaces: false,
    items: async ({ query }: { query: string }): Promise<T[]> => {
      const workspaceId = workspaceIdRef.current
      if (!workspaceId) return []
      try {
        return await config.fetchItems(workspaceId, (query ?? '').toLowerCase())
      } catch {
        return []
      }
    },
    render: () => {
      let renderer: ReactRenderer<MentionListRef> | null = null
      let popup: HTMLDivElement | null = null

      return {
        onStart(props: SuggestionProps<T, { id: string; label: string }>) {
          mentionActiveRef.current = true
          renderer = new ReactRenderer(MentionList, {
            props: {
              items: props.items,
              selectedIndex: 0,
              emptyText: config.emptyText,
              keyExtractor: config.keyExtractor,
              renderItem: config.renderItem,
              onSelect: (item: T) => {
                const command = config.toCommand(item)
                props.command({ id: command.id, label: command.label })
              },
            },
            editor: props.editor,
          })
          popup = createMentionPopup(renderer.element)
          positionPopup(popup, props.clientRect?.())
        },
        onUpdate(props: SuggestionProps<T, { id: string; label: string }>) {
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

export interface SkillMentionItem {
  id: string
  name: string
  description?: string
}

export function createSkillMentionSuggestion(
  workspaceIdRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
) {
  return createMentionSuggestion<SkillMentionItem>(
    {
      char: '/',
      emptyText: '无匹配 Skill',
      fetchItems: async (workspaceId, query) => {
        const capabilities = await api.getWorkspaceCapabilities(workspaceId)
        return capabilities.skills
          .filter((skill) => skill.enabled)
          .filter((skill) => !query || skill.name.toLowerCase().includes(query) || skill.slug.toLowerCase().includes(query))
          .map((skill) => ({ id: skill.slug, name: skill.name, description: skill.description }))
      },
      keyExtractor: (item) => item.id,
      renderItem: (item) => (
        <>
          <Sparkles className="size-3.5 shrink-0 text-violet-500" />
          <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
          {item.description && (
            <span className="max-w-[120px] truncate text-[10px] text-muted-foreground/50">{item.description}</span>
          )}
        </>
      ),
      toCommand: (item) => ({ id: item.id, label: item.name }),
    },
    workspaceIdRef,
    mentionActiveRef,
  )
}

export interface McpMentionItem {
  id: string
  name: string
  type: string
}

export function createMcpMentionSuggestion(
  workspaceIdRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
) {
  return createMentionSuggestion<McpMentionItem>(
    {
      char: '#',
      emptyText: '无匹配 MCP 服务',
      fetchItems: async (workspaceId, query) => {
        const capabilities = await api.getWorkspaceCapabilities(workspaceId)
        return capabilities.mcpServers
          .filter((server) => server.enabled)
          .filter((server) => !query || server.name.toLowerCase().includes(query))
          .map((server) => ({ id: server.name, name: server.name, type: server.type }))
      },
      keyExtractor: (item) => item.id,
      renderItem: (item) => (
        <>
          <Server className="size-3.5 shrink-0 text-emerald-500" />
          <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
          <span className="max-w-[120px] truncate text-[10px] text-muted-foreground/50">{item.type}</span>
        </>
      ),
      toCommand: (item) => ({ id: item.id, label: item.name }),
    },
    workspaceIdRef,
    mentionActiveRef,
  )
}
