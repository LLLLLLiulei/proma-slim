import * as React from 'react'
import { useAtom } from 'jotai'
import { ImageOff, LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, resolveApiUrl, type WorkspacePreviewState } from '@/lib/api'
import type { PageBuilderEditLockCredentials } from '@ai-page-builder/shared'
import {
  codeEditorSessionsAtom,
  getCodeEditorSession,
  isCodeEditorDirty,
  type CodeEditorSession,
  type CodeEditorSessionMap,
  type OpenCodeFile,
} from '@page-builder/atoms/builder-code-atoms'
import { workspaceFilesApi } from '@page-builder/lib/workspace-files-api'
import { useBuilderActiveTab } from './BuilderRightPanel'
import { CodeExplorer } from './CodeExplorer'
import { CodeEditorTabs } from './CodeEditorTabs'
import { CodeEditor } from './CodeEditor'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'])
const ENTRY_HTML_PATH = 'index.html'

function getExtension(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return ''
  return path.slice(dot + 1).toLowerCase()
}

function inferLanguage(path: string): string {
  switch (getExtension(path)) {
    case 'html': case 'htm': return 'html'
    case 'css': return 'css'
    case 'js': case 'mjs': case 'cjs': return 'javascript'
    case 'ts': case 'tsx': return 'typescript'
    case 'json': return 'json'
    case 'md': return 'markdown'
    case 'svg': case 'xml': return 'xml'
    case 'yml': case 'yaml': return 'yaml'
    default: return 'plaintext'
  }
}

function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(path))
}

function encodeFilePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function updateSession(
  sessions: CodeEditorSessionMap,
  workspaceId: string,
  updater: (session: CodeEditorSession) => CodeEditorSession,
): CodeEditorSessionMap {
  return { ...sessions, [workspaceId]: updater(getCodeEditorSession(sessions, workspaceId)) }
}

export interface BuilderCodeTabProps {
  workspaceId: string
  /** Agent 运行中或编辑锁失效时为 true，Monaco 只读、写操作禁用 */
  readOnly: boolean
  editLock?: PageBuilderEditLockCredentials
  /** 保存成功后用最新 previewState 驱动左侧预览刷新 */
  onSaved: (previewState: WorkspacePreviewState) => void
  onEditLockRejected?: (error: unknown) => void
}

export function BuilderCodeTab({ workspaceId, readOnly, editLock, onSaved, onEditLockRejected }: BuilderCodeTabProps) {
  const [sessions, setSessions] = useAtom(codeEditorSessionsAtom)
  const session = getCodeEditorSession(sessions, workspaceId)
  const activeTab = useBuilderActiveTab()

  const activeFile = session.openFiles.find((file) => file.path === session.activePath) ?? null

  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [explorerWidth, setExplorerWidth] = React.useState(208)
  const [isDragging, setIsDragging] = React.useState(false)
  const draggingRef = React.useRef(false)

  React.useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setExplorerWidth(Math.min(480, Math.max(160, event.clientX - rect.left)))
    }
    const handleUp = () => {
      draggingRef.current = false
      setIsDragging(false)
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [])

  const handleSplitDown = (event: React.PointerEvent) => {
    draggingRef.current = true
    setIsDragging(true)
    document.body.style.userSelect = 'none'
    event.preventDefault()
  }

  const dirtyPaths = React.useMemo(
    () => new Set(session.openFiles.filter((file) => file.draftContent !== file.savedContent).map((file) => file.path)),
    [session.openFiles],
  )

  const refreshTree = React.useCallback(async () => {
    setSessions((prev) => updateSession(prev, workspaceId, (s) => ({ ...s, fileTreeLoading: true })))
    try {
      const tree = await workspaceFilesApi.list(workspaceId)
      setSessions((prev) => updateSession(prev, workspaceId, (s) => ({ ...s, fileTree: tree.entries, fileTreeLoading: false })))
    } catch (error) {
      setSessions((prev) => updateSession(prev, workspaceId, (s) => ({ ...s, fileTreeLoading: false })))
      toast.error(error instanceof Error ? error.message : '读取文件列表失败')
    }
  }, [setSessions, workspaceId])

  React.useEffect(() => {
    if (activeTab === 'code') {
      void refreshTree()
    }
  }, [activeTab, refreshTree])

  const openFile = React.useCallback(async (path: string) => {
    if (session.openFiles.some((file) => file.path === path)) {
      setSessions((prev) => updateSession(prev, workspaceId, (s) => ({ ...s, activePath: path })))
      return
    }

    if (isImage(path)) {
      const file: OpenCodeFile = {
        path, savedContent: '', draftContent: '', version: null, language: inferLanguage(path), largeFileWarning: false, viewMode: 'image',
      }
      setSessions((prev) => updateSession(prev, workspaceId, (s) => ({ ...s, openFiles: [...s.openFiles, file], activePath: path })))
      return
    }

    try {
      const content = await workspaceFilesApi.read(workspaceId, path)
      const file: OpenCodeFile = {
        path,
        savedContent: content.content,
        draftContent: content.content,
        version: content.version,
        language: inferLanguage(path),
        largeFileWarning: content.largeFileWarning,
        viewMode: 'editor',
      }
      setSessions((prev) => updateSession(prev, workspaceId, (s) => ({
        ...s,
        openFiles: [...s.openFiles.filter((existing) => existing.path !== path), file],
        activePath: path,
      })))
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const file: OpenCodeFile = {
          path, savedContent: '', draftContent: '', version: null, language: 'plaintext', largeFileWarning: false, viewMode: 'binary',
        }
        setSessions((prev) => updateSession(prev, workspaceId, (s) => ({ ...s, openFiles: [...s.openFiles, file], activePath: path })))
      } else if (error instanceof ApiError && error.status === 413) {
        toast.error('文件过大，暂不支持在编辑器中加载')
      } else {
        toast.error(error instanceof Error ? error.message : '打开文件失败')
      }
    }
  }, [session.openFiles, setSessions, workspaceId])

  // 首次进入代码 Tab 且无打开文件时，默认打开入口 index.html
  React.useEffect(() => {
    if (activeTab !== 'code' || session.openFiles.length > 0) return
    if (session.fileTree.some((entry) => entry.type === 'file' && entry.path === ENTRY_HTML_PATH)) {
      void openFile(ENTRY_HTML_PATH)
    }
  }, [activeTab, session.openFiles.length, session.fileTree, openFile])

  const handleChange = React.useCallback((path: string, next: string) => {
    setSessions((prev) => updateSession(prev, workspaceId, (s) => ({
      ...s,
      openFiles: s.openFiles.map((file) => (file.path === path ? { ...file, draftContent: next } : file)),
    })))
  }, [setSessions, workspaceId])

  const saveFile = React.useCallback(async (path: string) => {
    if (readOnly || !editLock) return
    const target = session.openFiles.find((file) => file.path === path)
    if (!target || target.draftContent === target.savedContent) return

    try {
      const result = await workspaceFilesApi.save(workspaceId, path, target.draftContent, {
        editLock,
        ...(target.version ? { baseVersion: target.version } : {}),
      })
      setSessions((prev) => updateSession(prev, workspaceId, (s) => ({
        ...s,
        openFiles: s.openFiles.map((file) => (file.path === path
          ? { ...file, savedContent: file.draftContent, version: result.version }
          : file)),
      })))
      onSaved(result.previewState)
      toast.success('已保存')
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        onEditLockRejected?.(error)
      }
      toast.error(error instanceof Error ? error.message : '保存失败')
    }
  }, [readOnly, session.openFiles, workspaceId, editLock, setSessions, onSaved, onEditLockRejected])

  const closeFile = React.useCallback((path: string) => {
    setSessions((prev) => {
      const current = getCodeEditorSession(prev, workspaceId)
      const target = current.openFiles.find((file) => file.path === path)
      if (target && target.draftContent !== target.savedContent) {
        if (!window.confirm(`${path} 有未保存改动，确定关闭并丢弃？`)) {
          return prev
        }
      }
      const openFiles = current.openFiles.filter((file) => file.path !== path)
      const activePath = current.activePath === path
        ? (openFiles[openFiles.length - 1]?.path ?? null)
        : current.activePath
      return updateSession(prev, workspaceId, (s) => ({ ...s, openFiles, activePath }))
    })
  }, [workspaceId, setSessions])

  // 未保存改动保护：关闭页面前拦截
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (event: BeforeUnloadEvent) => {
      if (isCodeEditorDirty(session)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [session])

  const imagePreviewUrl = activeFile?.viewMode === 'image'
    ? resolveApiUrl(`/api/workspaces/${encodeURIComponent(workspaceId)}/preview/${encodeFilePath(activeFile.path)}`)
    : null

  return (
    <div className="flex h-full min-h-0" ref={containerRef}>
      <div className="hidden shrink-0 border-r border-border/55 bg-muted/20 md:block" style={{ width: explorerWidth }}>
        <CodeExplorer
          entries={session.fileTree}
          activePath={session.activePath}
          dirtyPaths={dirtyPaths}
          onSelect={(path) => void openFile(path)}
        />
      </div>
      <div
        onPointerDown={handleSplitDown}
        aria-label="调整目录树宽度"
        className="hidden w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-border md:block"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <CodeEditorTabs
          openFiles={session.openFiles}
          activePath={session.activePath}
          dirtyPaths={dirtyPaths}
          onSelect={openFile}
          onClose={closeFile}
        />
        <div className="relative min-h-0 flex-1">
          {readOnly && (
            <div className="absolute inset-x-0 top-0 z-10 bg-amber-500/10 px-3 py-1 text-center text-xs text-amber-700">
              当前代码只读，无法保存
            </div>
          )}
          {activeFile?.viewMode === 'editor' && (
            <>
              {activeFile.largeFileWarning && (
                <div className="bg-amber-500/10 px-3 py-1 text-xs text-amber-700">该文件较大（&gt;5MB），编辑可能卡顿</div>
              )}
              <CodeEditor
                active={activeTab === 'code'}
                value={activeFile.draftContent}
                language={activeFile.language}
                readOnly={readOnly}
                minimapEnabled={!isDragging}
                onChange={(value) => handleChange(activeFile.path, value)}
                onSave={() => void saveFile(activeFile.path)}
              />
            </>
          )}
          {activeFile?.viewMode === 'image' && imagePreviewUrl && (
            <div className="flex h-full items-center justify-center overflow-auto bg-muted/30 p-4">
              <img src={imagePreviewUrl} alt={activeFile.path} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {activeFile?.viewMode === 'binary' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <ImageOff className="size-8" />
              <span>该文件为二进制文件，无法在编辑器中编辑</span>
            </div>
          )}
          {!activeFile && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              {session.fileTreeLoading ? <LoaderCircle className="size-5 animate-spin" /> : <span>从左侧选择文件以开始编辑</span>}
            </div>
          )}
        </div>
        {activeFile?.viewMode === 'editor' && (
          <div className="flex items-center justify-between border-t border-border/55 px-3 py-1 text-xs text-muted-foreground">
            <span>{activeFile.language}</span>
            <button
              type="button"
              disabled={readOnly || !editLock || activeFile.draftContent === activeFile.savedContent}
              onClick={() => void saveFile(activeFile.path)}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-muted disabled:opacity-40"
            >
              <Save className="size-3" /> 保存 (⌘S)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
