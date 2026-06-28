import * as React from 'react'
import {
  ChevronRight,
  File,
  FileCode,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react'
import type { WorkspaceFileEntry } from '@page-builder/lib/workspace-files-api'
import { cn } from '@/lib/utils'

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children: TreeNode[]
}

function buildTree(entries: WorkspaceFileEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'directory', children: [] }
  for (const entry of entries) {
    const parts = entry.path.split('/')
    let node = root
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      if (!part) continue
      const isLast = index === parts.length - 1
      const partType = isLast ? entry.type : 'directory'
      let child = node.children.find((c) => c.name === part && c.type === partType)
      if (!child) {
        child = { name: part, path: parts.slice(0, index + 1).join('/'), type: partType, children: [] }
        node.children.push(child)
      }
      node = child
    }
  }

  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name)))
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(root.children)
  return root.children
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'])
const CODE_EXTS = new Set([
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'html', 'htm', 'css', 'scss', 'less',
  'json', 'xml', 'yaml', 'yml', 'vue', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'cs', 'rb', 'php', 'sh',
])
const DOC_EXTS = new Set(['md', 'markdown', 'txt', 'rtf'])

function getExtension(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase()
}

function FileTypeIcon({ path, className }: { path: string; className?: string }) {
  const ext = getExtension(path)
  const Icon = IMAGE_EXTS.has(ext)
    ? FileImage
    : CODE_EXTS.has(ext)
      ? FileCode
      : DOC_EXTS.has(ext)
        ? FileText
        : File
  return <Icon className={className} />
}

const TREE_ROW_EXPANDER_SLOT_CLASS = 'flex size-4 shrink-0 items-center justify-center'
const TREE_ROW_ICON_SLOT_CLASS = 'flex size-4 shrink-0 items-center justify-center'

export interface CodeExplorerProps {
  entries: WorkspaceFileEntry[]
  activePath: string | null
  dirtyPaths: Set<string>
  onSelect: (path: string) => void
}

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

function dirname(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

export function CodeExplorer({
  entries,
  activePath,
  dirtyPaths,
  onSelect,
}: CodeExplorerProps) {
  const tree = React.useMemo(() => buildTree(entries), [entries])

  return (
    <div className="flex h-full flex-col overflow-hidden text-sm">
      <div className="border-b border-border/40 px-2 py-1 text-xs text-muted-foreground">
        <span>workspace-files</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {tree.map((node) => (
          <TreeNodeView
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            dirtyPaths={dirtyPaths}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

interface TreeNodeViewProps {
  node: TreeNode
  depth: number
  activePath: string | null
  dirtyPaths: Set<string>
  onSelect: (path: string) => void
}

function TreeNodeView(props: TreeNodeViewProps) {
  const { node, depth, activePath, dirtyPaths } = props
  // 默认只展开到二级：depth 0（第一层）目录展开，更深层目录默认折叠
  const [expanded, setExpanded] = React.useState(depth < 1)
  const isActive = node.type === 'file' && node.path === activePath
  const isDirty = node.type === 'file' && dirtyPaths.has(node.path)
  const padding = { paddingLeft: `${depth * 12 + 8}px` }

  if (node.type === 'directory') {
    return (
      <div>
        <div
          className="flex items-center gap-1 py-1 pr-2 text-muted-foreground hover:bg-muted/40"
          data-code-explorer-row-depth={depth}
          style={padding}
        >
          <button
            type="button"
            aria-label={expanded ? '折叠' : '展开'}
            onClick={() => setExpanded((v) => !v)}
            className={TREE_ROW_EXPANDER_SLOT_CLASS}
            data-code-explorer-expander-slot={true}
          >
            <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
          </button>
          <span className={TREE_ROW_ICON_SLOT_CLASS} data-code-explorer-icon-slot={true}>
            {expanded
              ? <FolderOpen className="size-3.5 text-foreground/70" />
              : <Folder className="size-3.5 text-foreground/70" />}
          </span>
          <span className="flex-1 truncate text-foreground/80">{node.name}</span>
        </div>
        {expanded
          && node.children.map((child) => (
            <TreeNodeView key={child.path} {...props} node={child} depth={depth + 1} />
          ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 py-1 pr-2',
        isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40',
      )}
      data-code-explorer-row-depth={depth}
      style={padding}
    >
      <span aria-hidden={true} className={TREE_ROW_EXPANDER_SLOT_CLASS} data-code-explorer-expander-slot={true} />
      <span className={TREE_ROW_ICON_SLOT_CLASS} data-code-explorer-icon-slot={true}>
        <FileTypeIcon path={node.path} className="size-3.5 text-muted-foreground" />
      </span>
      <button type="button" className="flex flex-1 items-center gap-1.5 truncate" onClick={() => props.onSelect(node.path)}>
        <span className={cn('truncate', isDirty && 'font-semibold')}>{node.name}</span>
        {isDirty && <span className="size-1.5 rounded-full bg-foreground/70" />}
      </button>
    </div>
  )
}

export { basename, dirname }
