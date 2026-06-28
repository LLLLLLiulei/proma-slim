import * as React from 'react'
import Editor, { loader, type BeforeMount, type OnMount } from '@monaco-editor/react'
import { shouldHandleCodeEditorSaveShortcut } from '@page-builder/lib/code-editor-shortcuts'
import {
  PAGE_BUILDER_CODE_EDITOR_THEME,
  createPageBuilderCodeEditorOptions,
} from '@page-builder/lib/code-editor-theme'
import { createPageBuilderMonacoLoaderConfig } from '@page-builder/lib/monaco-loader-config'
import { getPageBuilderPublicBasePath } from '@page-builder/lib/public-base-path'

// 使用 Monaco AMD 构建而非 ESM 构建：AMD 包会把 localize(index, fallback)
// 连接到 zh-cn NLS 表，右键菜单、查找框等内置 UI 才能真正中文化。
loader.config(createPageBuilderMonacoLoaderConfig(getPageBuilderPublicBasePath()))

const configureMonacoBeforeMount: BeforeMount = (monacoInstance) => {
  // 在浅色 vs 基础上增强 token 着色（仿 GitHub/VSCode Light+），不改保存逻辑。
  monacoInstance.editor.defineTheme('page-builder-light', PAGE_BUILDER_CODE_EDITOR_THEME)
}

export interface CodeEditorProps {
  value: string
  language: string
  active?: boolean
  readOnly?: boolean
  /** 拖动分隔条期间设为 false，避免 minimap 随容器宽度连续变化反复重绘闪烁 */
  minimapEnabled?: boolean
  onChange?: (value: string) => void
  onSave?: () => void
}

export function CodeEditor({
  value,
  language,
  active = true,
  readOnly,
  minimapEnabled = true,
  onChange,
  onSave,
}: CodeEditorProps) {
  // 用 ref 持有最新 onSave，避免 keydown 监听闭包过期（onSave 每次 render 都是新函数）
  const onSaveRef = React.useRef(onSave)
  onSaveRef.current = onSave
  const activeRef = React.useRef(active)
  const readOnlyRef = React.useRef(readOnly ?? false)
  const editorFocusedRef = React.useRef(false)

  React.useEffect(() => {
    activeRef.current = active
    readOnlyRef.current = readOnly ?? false
  }, [active, readOnly])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleCodeEditorSaveShortcut(event, {
        active: activeRef.current,
        editorFocused: editorFocusedRef.current,
        readOnly: readOnlyRef.current,
      })) {
        return
      }
      event.preventDefault()
      onSaveRef.current?.()
    }
    // window 级监听配合 Monaco 聚焦状态，preventDefault 阻止浏览器"保存网页"默认行为。
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleMount = React.useCallback<OnMount>((editor, monacoInstance) => {
    const focusDisposable = editor.onDidFocusEditorWidget(() => {
      editorFocusedRef.current = true
    })
    const blurDisposable = editor.onDidBlurEditorWidget(() => {
      editorFocusedRef.current = false
    })
    editor.onDidDispose(() => {
      focusDisposable.dispose()
      blurDisposable.dispose()
    })

    // Mac 下 Cmd+S 在编辑器焦点时会被 Monaco 拦截（window 级监听收不到），
    // 故在 Monaco 上下文注册命令；CtrlCmd 由 Monaco 按平台解析为 Mac Cmd / Win Ctrl。
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      if (!activeRef.current || readOnlyRef.current) {
        return
      }
      onSaveRef.current?.()
    })
  }, [])

  return (
    <Editor
      value={value}
      language={language}
      theme="page-builder-light"
      beforeMount={configureMonacoBeforeMount}
      onMount={handleMount}
      onChange={(next) => onChange?.(next ?? '')}
      options={createPageBuilderCodeEditorOptions({
        readOnly: readOnly ?? false,
        minimapEnabled,
      })}
    />
  )
}
