/**
 * AI Elements - TipTap 富文本输入组件
 *
 * 独立受控组件，不依赖 PromptInput Provider。
 *
 * 功能：
 * - StarterKit + Placeholder + Underline + Link + CodeBlockLowlight
 * - 可选 Mention 扩展（@ 引用文件、/ 触发 Skill、# 触发 MCP）
 * - htmlToMarkdown 转换
 * - IME composition 处理
 * - Enter 提交 / Shift+Enter 换行
 * - 代码块内 Enter 换行例外
 * - 自动扩高
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Link from '@tiptap/extension-link'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { common, createLowlight } from 'lowlight'
import { createFileMentionSuggestion } from '@/components/file-browser/file-mention-suggestion'
import { createMcpMentionSuggestion, createSkillMentionSuggestion } from '@/components/agent/mention-suggestions'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const lowlight = createLowlight(common)

function htmlToMarkdown(html: string): string {
  if (!html || html === '<p></p>') return ''

  const div = document.createElement('div')
  div.innerHTML = html

  function processNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ''
    }

    const el = node as HTMLElement
    const tagName = el.tagName.toLowerCase()
    const children = Array.from(el.childNodes).map(processNode).join('')

    switch (tagName) {
      case 'p':
        return children + '\n\n'
      case 'br':
        return '\n'
      case 'strong':
      case 'b':
        return `**${children}**`
      case 'em':
      case 'i':
        return `*${children}*`
      case 'u':
        return `<u>${children}</u>`
      case 's':
      case 'strike':
      case 'del':
        return `~~${children}~~`
      case 'code':
        if (el.parentElement?.tagName.toLowerCase() === 'pre') {
          return children
        }
        return `\`${children}\``
      case 'pre': {
        const codeEl = el.querySelector('code')
        const langClass = codeEl?.className || ''
        const langMatch = langClass.match(/language-(\w+)/)
        const lang = langMatch ? langMatch[1] : ''
        const codeContent = codeEl ? processNode(codeEl) : children
        return `\`\`\`${lang}\n${codeContent}\n\`\`\`\n\n`
      }
      case 'a': {
        const href = el.getAttribute('href') || ''
        return `[${children}](${href})`
      }
      case 'ul':
        return Array.from(el.children)
          .map((li) => `- ${processNode(li).trim()}`)
          .join('\n') + '\n\n'
      case 'ol':
        return Array.from(el.children)
          .map((li, index) => `${index + 1}. ${processNode(li).trim()}`)
          .join('\n') + '\n\n'
      case 'li':
        return children
      case 'blockquote':
        return children
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') + '\n\n'
      case 'h1': return `# ${children}\n\n`
      case 'h2': return `## ${children}\n\n`
      case 'h3': return `### ${children}\n\n`
      case 'h4': return `#### ${children}\n\n`
      case 'h5': return `##### ${children}\n\n`
      case 'h6': return `###### ${children}\n\n`
      case 'hr': return '---\n\n'
      case 'span': {
        const dataType = el.getAttribute('data-type')
        const dataId = el.getAttribute('data-id') || ''
        const suggestionChar = el.getAttribute('data-mention-suggestion-char') || '@'
        if (dataType === 'mention') {
          if (suggestionChar === '/') return `/skill:${dataId}`
          if (suggestionChar === '#') return `#mcp:${dataId}`
          return `@file:${dataId}`
        }
        return children
      }
      default:
        return children
    }
  }

  return processNode(div).trim()
}

function countEditorLines(editor: ReturnType<typeof useEditor>): number {
  if (!editor) return 0

  const doc = editor.state.doc
  let lineCount = 0

  doc.descendants((node) => {
    if (node.type.name === 'paragraph') {
      const text = node.textContent
      if (!text) {
        lineCount += 1
      } else {
        lineCount += Math.max(1, Math.ceil(text.length / 50))
      }
    } else if (node.type.name === 'codeBlock') {
      const text = node.textContent
      lineCount += (text.match(/\n/g) || []).length + 1
    } else if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
      node.descendants((child) => {
        if (child.type.name === 'listItem') {
          lineCount += 1
        }
      })
    }
  })

  return lineCount
}

interface RichTextInputProps {
  value: string
  onChange: (markdown: string) => void
  onSubmit: () => void
  onPasteFiles?: (files: File[]) => void
  placeholder?: string
  suggestionActive?: boolean
  disabled?: boolean
  autoFocusTrigger?: string | null
  collapsible?: boolean
  workspaceId?: string | null
  workspacePath?: string | null
  workspaceSlug?: string | null
  attachedDirs?: string[]
  className?: string
}

export function RichTextInput({
  value,
  onChange,
  onSubmit,
  onPasteFiles,
  placeholder = '有什么可以帮助到你的呢？',
  suggestionActive = false,
  className,
  disabled = false,
  autoFocusTrigger,
  collapsible = false,
  workspaceId,
  workspacePath,
  workspaceSlug,
  attachedDirs = [],
}: RichTextInputProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(false)
  const lastEditorValueRef = useRef<string>('')
  const isComposingRef = useRef(false)
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const onPasteFilesRef = useRef(onPasteFiles)
  onPasteFilesRef.current = onPasteFiles
  const mentionActiveRef = useRef(false)
  const workspaceIdRef = useRef<string | null>(workspaceId ?? null)
  workspaceIdRef.current = workspaceId ?? null
  const workspacePathRef = useRef<string | null>(workspacePath ?? null)
  workspacePathRef.current = workspacePath ?? null
  const attachedDirsRef = useRef<string[]>(attachedDirs)
  attachedDirsRef.current = attachedDirs
  const workspaceSlugRef = useRef<string | null>(workspaceSlug ?? null)
  workspaceSlugRef.current = workspaceSlug ?? null

  const hasMentionSupport = Boolean(workspaceId && (workspacePath || workspaceSlug))

  const mentionSuggestion = useMemo(
    () => createFileMentionSuggestion(workspaceIdRef, workspacePathRef, mentionActiveRef, attachedDirsRef),
    [],
  )
  const skillSuggestion = useMemo(
    () => createSkillMentionSuggestion(workspaceIdRef, mentionActiveRef),
    [],
  )
  const mcpSuggestion = useMemo(
    () => createMcpMentionSuggestion(workspaceIdRef, mentionActiveRef),
    [],
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'rounded-md bg-muted p-3 font-mono text-sm',
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      ...(hasMentionSupport ? [
        Mention.extend({
          addAttributes() {
            return {
              ...this.parent?.(),
              mentionSuggestionChar: {
                default: '@',
                parseHTML: (element: HTMLElement) => element.getAttribute('data-mention-suggestion-char') || '@',
                renderHTML: (attrs: Record<string, string>) => ({
                  'data-mention-suggestion-char': attrs.mentionSuggestionChar,
                }),
              },
            }
          },
        }).configure({
          HTMLAttributes: {},
          renderHTML({ node, suggestion }) {
            const char = suggestion?.char ?? node.attrs.mentionSuggestionChar ?? '@'
            const label = node.attrs.label ?? node.attrs.id
            let chipClass = 'mention-chip'
            if (char === '/') chipClass = 'skill-mention-chip'
            else if (char === '#') chipClass = 'mcp-mention-chip'

            return [
              'span',
              {
                'data-type': 'mention',
                'data-id': node.attrs.id,
                'data-label': node.attrs.label,
                'data-mention-suggestion-char': char,
                class: chipClass,
              },
              `${char === '@' ? '@' : ''}${label}`,
            ]
          },
          suggestions: [mentionSuggestion, skillSuggestion, mcpSuggestion],
        }),
      ] : []),
    ],
    content: value || '',
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          'prose dark:prose-invert max-w-none focus:outline-none',
          'min-h-[60px] w-full text-[14px] leading-[1.6]',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3',
          '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm',
          '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        ),
      },
      handleDOMEvents: {
        compositionstart: () => {
          isComposingRef.current = true
          return false
        },
        compositionend: () => {
          isComposingRef.current = false
          return false
        },
      },
      handlePaste: (_view, event) => {
        const clipboardItems = event.clipboardData?.files
        if (clipboardItems && clipboardItems.length > 0 && onPasteFilesRef.current) {
          event.preventDefault()
          onPasteFilesRef.current(Array.from(clipboardItems))
          return true
        }
        return false
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          const { state } = view
          const { $from } = state.selection
          const parent = $from.parent
          if (parent.type.name === 'codeBlock') {
            return false
          }

          if (isComposingRef.current || event.isComposing) {
            return false
          }

          if (mentionActiveRef.current) {
            return false
          }

          event.preventDefault()
          onSubmitRef.current()
          return true
        }

        return false
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const html = currentEditor.getHTML()
      if (html === '<p></p>') {
        lastEditorValueRef.current = ''
        onChange('')
        setIsExpanded(false)
        setIsManuallyCollapsed(false)
      } else {
        const markdown = htmlToMarkdown(html)
        lastEditorValueRef.current = markdown
        onChange(markdown)

        const lineCount = countEditorLines(currentEditor)
        setIsExpanded(lineCount > 5)
      }
    },
  })

  useEffect(() => {
    if (!editor) return

    const controllerValue = value
    if (controllerValue === lastEditorValueRef.current) {
      return
    }

    if (controllerValue === '') {
      editor.commands.clearContent()
      lastEditorValueRef.current = ''
      setIsExpanded(false)
      setIsManuallyCollapsed(false)
      return
    }

    const html = controllerValue
      .split(/\n\n+/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('')
    editor.commands.setContent(html)
    lastEditorValueRef.current = controllerValue
  }, [editor, value])

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled)
    }
  }, [editor, disabled])

  useEffect(() => {
    if (!editor) return
    const placeholderExt = editor.extensionManager.extensions.find((extension) => extension.name === 'placeholder')
    if (placeholderExt) {
      placeholderExt.options.placeholder = placeholder
      editor.view.dispatch(editor.state.tr)
    }
  }, [editor, placeholder])

  useEffect(() => {
    if (editor && !disabled) {
      const timer = setTimeout(() => {
        editor.commands.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [editor, disabled, autoFocusTrigger])

  const showCollapseToggle = collapsible && isExpanded

  return (
    <div
      className={cn(
        'relative w-full overflow-y-auto transition-[max-height] duration-200 ease-in-out',
        isManuallyCollapsed ? 'max-h-[60px]' : isExpanded ? 'max-h-[500px]' : 'max-h-[200px]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <EditorContent editor={editor} className="w-full" />
      {showCollapseToggle && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="sticky bottom-1 float-right z-10 mr-2 rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted/80 hover:text-muted-foreground"
              onClick={() => setIsManuallyCollapsed((prev) => !prev)}
            >
              {isManuallyCollapsed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isManuallyCollapsed ? '展开输入框' : '折叠输入框'}
          </TooltipContent>
        </Tooltip>
      )}
      <style>{`
        .ProseMirror {
          outline: none;
          padding: 6px 15px 0px;
          font-style: normal;
        }
        .ProseMirror p {
          font-style: normal;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          height: 0;
          opacity: 0.5;
          font-style: ${suggestionActive ? 'italic' : 'normal'};
        }
        .ProseMirror::-webkit-scrollbar {
          width: 3px;
        }
        .mention-chip {
          background-color: hsl(var(--primary) / 0.1);
          color: hsl(var(--primary));
          border-radius: 4px;
          padding: 1px 4px 1px 2px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 2px;
          vertical-align: baseline;
        }
        .mention-chip::before {
          content: '';
          display: inline-block;
          width: 12px;
          height: 12px;
          background-color: currentColor;
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/%3E%3Cpath d='M14 2v4a2 2 0 0 0 2 2h4'/%3E%3C/svg%3E");
          mask-size: contain;
          mask-repeat: no-repeat;
          flex-shrink: 0;
        }
        .skill-mention-chip {
          background-color: hsl(270 60% 60% / 0.15);
          color: hsl(270 60% 50%);
          border-radius: 4px;
          padding: 1px 4px 1px 2px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 2px;
          vertical-align: baseline;
        }
        .skill-mention-chip::before {
          content: '';
          display: inline-block;
          width: 12px;
          height: 12px;
          background-color: currentColor;
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'/%3E%3C/svg%3E");
          mask-size: contain;
          mask-repeat: no-repeat;
          flex-shrink: 0;
        }
        .mcp-mention-chip {
          background-color: hsl(160 60% 45% / 0.15);
          color: hsl(160 60% 35%);
          border-radius: 4px;
          padding: 1px 4px 1px 2px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 2px;
          vertical-align: baseline;
        }
        .mcp-mention-chip::before {
          content: '';
          display: inline-block;
          width: 12px;
          height: 12px;
          background-color: currentColor;
          mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='20' height='8' x='2' y='2' rx='2' ry='2'/%3E%3Crect width='20' height='8' x='2' y='14' rx='2' ry='2'/%3E%3Cline x1='6' x2='6.01' y1='6' y2='6'/%3E%3Cline x1='6' x2='6.01' y1='18' y2='18'/%3E%3C/svg%3E");
          mask-size: contain;
          mask-repeat: no-repeat;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
