import { atom } from 'jotai'
import type { WorkspaceFileEntry } from '@page-builder/lib/workspace-files-api'

export type BuilderRightPanelTab = 'chat' | 'code'

/** 右侧栏当前激活 Tab（仅内存，不持久化到 localStorage） */
export const builderActiveTabAtom = atom<BuilderRightPanelTab>('chat')

export interface OpenCodeFile {
  path: string
  /** 最近一次从后端读取或保存成功的内容（脏判断基准） */
  savedContent: string
  /** 用户当前编辑中的内容；与 savedContent 不同即为脏 */
  draftContent: string
  /** 最近一次读取或保存成功时的内容版本，用于避免覆盖 Agent/外部更新 */
  version: string | null
  language: string
  largeFileWarning: boolean
  /** 该文件在编辑区的展示方式：Monaco 编辑 / 图片预览 / 二进制不可编辑提示 */
  viewMode: 'editor' | 'image' | 'binary'
}

export interface CodeEditorSession {
  openFiles: OpenCodeFile[]
  activePath: string | null
  fileTree: WorkspaceFileEntry[]
  fileTreeLoading: boolean
}

const DEFAULT_SESSION: CodeEditorSession = {
  openFiles: [],
  activePath: null,
  fileTree: [],
  fileTreeLoading: false,
}

type CodeEditorSessionMap = Record<string, CodeEditorSession>

export type { CodeEditorSessionMap }

/** 按工作区隔离的代码编辑器会话（打开文件 / 激活文件 / 文件树） */
export const codeEditorSessionsAtom = atom<CodeEditorSessionMap>({})

export function getCodeEditorSession(
  sessions: CodeEditorSessionMap,
  workspaceId: string,
): CodeEditorSession {
  return sessions[workspaceId] ?? DEFAULT_SESSION
}

export function isCodeEditorDirty(session: CodeEditorSession): boolean {
  return session.openFiles.some((file) => file.draftContent !== file.savedContent)
}
