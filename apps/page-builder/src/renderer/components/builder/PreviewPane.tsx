import * as React from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  Calendar,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clipboard,
  ClipboardCheck,
  Clock,
  CloudDownload,
  CloudUpload,
  Copy,
  Download,
  Edit,
  Ellipsis,
  Eye,
  EyeOff,
  ExternalLink,
  FileArchive,
  FileDown,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Globe,
  History,
  Home,
  House,
  Image,
  Images,
  Info,
  Laptop,
  LayoutTemplate,
  Layers,
  Link,
  Link2,
  List,
  ListChecks,
  LoaderCircle,
  Lock,
  Logs,
  Mail,
  MessageSquare,
  Milestone,
  Minus,
  Monitor,
  MoreHorizontal,
  MousePointerClick,
  Newspaper,
  Package,
  PackageOpen,
  PanelTopOpen,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Redo2,
  Rocket,
  RotateCcw,
  Route,
  Save,
  ScrollText,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Square,
  Sparkles,
  Trash,
  Trash2,
  TriangleAlert,
  Undo2,
  Unlock,
  Upload,
  UserCheck,
  Users,
  WandSparkles,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react'
import type {
  PageBuilderHostToolbarButton,
  PageBuilderHostToolbarButtonIcon,
  PageBuilderHostToolbarDropdownItem,
  PageBuilderPreviewAnchorRect,
  PageBuilderPreviewBridgeMessage,
  PageBuilderImageReplacementPayload,
  PageBuilderImageTargetDescriptor,
  PageBuilderInlineTextSaveRequest,
  PageBuilderInlineTextSaveResult,
  PageBuilderPreviewParentMessage,
  PageBuilderTargetSelection,
} from '@ai-page-builder/shared'
import {
  createPageBuilderBlockTargetSelection,
  PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@ai-page-builder/shared'
import { Button } from '@/components/ui/button'
import { PageBuilderBlockActionBar } from '@page-builder/components/builder/PageBuilderBlockActionBar'
import type { PageBuilderPreviewSelectionEvent } from '@page-builder/lib/preview-selection'
import {
  getPageBuilderVisiblePreviewDeviceMode,
  isPageBuilderToolbarItemHidden,
  normalizePageBuilderHiddenToolbarItems,
  type PageBuilderToolbarItemKey,
} from '@page-builder/lib/toolbar-visibility'
import { cn } from '@/lib/utils'

const BLOCK_ACTION_BAR_ESTIMATED_WIDTH = 336
const BLOCK_ACTION_BAR_WITH_IMAGE_ACTION_ESTIMATED_WIDTH = 440
const BLOCK_ACTION_BAR_ESTIMATED_HEIGHT = 44
const BLOCK_ACTION_BAR_GAP = 8
const BLOCK_ACTION_BAR_PADDING = 12
const MOBILE_PREVIEW_VIEWPORT_WIDTH = 390

type PreviewDeviceMode = 'desktop' | 'mobile'
type PreviewSelectionActionState = 'idle' | 'armed' | 'selected'
type ButtonVariant = React.ComponentProps<typeof Button>['variant']

interface SelectedAnchorState {
  imageTargetDescriptor: PageBuilderImageTargetDescriptor | null
  rect: PageBuilderPreviewAnchorRect
  selector: string
  targetSelection: PageBuilderTargetSelection
}

const HOST_TOOLBAR_ICON_COMPONENTS: Record<PageBuilderHostToolbarButtonIcon, LucideIcon> = {
  archive: Archive,
  'archive-restore': ArchiveRestore,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'badge-check': BadgeCheck,
  bell: Bell,
  'book-open': BookOpen,
  calendar: Calendar,
  'calendar-clock': CalendarClock,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  clipboard: Clipboard,
  'clipboard-check': ClipboardCheck,
  clock: Clock,
  'cloud-download': CloudDownload,
  'cloud-upload': CloudUpload,
  copy: Copy,
  download: Download,
  edit: Edit,
  ellipsis: Ellipsis,
  eye: Eye,
  'eye-off': EyeOff,
  'external-link': ExternalLink,
  'file-archive': FileArchive,
  'file-down': FileDown,
  'file-text': FileText,
  'file-up': FileUp,
  folder: Folder,
  'folder-open': FolderOpen,
  'git-branch': GitBranch,
  'git-merge': GitMerge,
  'git-pull-request': GitPullRequest,
  globe: Globe,
  history: History,
  home: Home,
  house: House,
  image: Image,
  images: Images,
  info: Info,
  'layout-template': LayoutTemplate,
  layers: Layers,
  link: Link,
  'link-2': Link2,
  list: List,
  'list-checks': ListChecks,
  lock: Lock,
  logs: Logs,
  mail: Mail,
  'message-square': MessageSquare,
  milestone: Milestone,
  minus: Minus,
  monitor: Monitor,
  'more-horizontal': MoreHorizontal,
  newspaper: Newspaper,
  package: Package,
  'package-open': PackageOpen,
  'panel-top-open': PanelTopOpen,
  palette: Palette,
  pause: Pause,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  'redo-2': Redo2,
  rocket: Rocket,
  'rotate-ccw': RotateCcw,
  route: Route,
  save: Save,
  'scroll-text': ScrollText,
  search: Search,
  send: Send,
  settings: Settings,
  'share-2': Share2,
  'shield-check': ShieldCheck,
  'sliders-horizontal': SlidersHorizontal,
  smartphone: Smartphone,
  square: Square,
  sparkles: Sparkles,
  trash: Trash,
  'trash-2': Trash2,
  'triangle-alert': TriangleAlert,
  'undo-2': Undo2,
  unlock: Unlock,
  upload: Upload,
  'user-check': UserCheck,
  users: Users,
  'wand-sparkles': WandSparkles,
  workflow: Workflow,
  x: X,
}

function resolveHostToolbarButtonVariant(
  variant: PageBuilderHostToolbarButton['variant'],
): ButtonVariant {
  if (variant === 'primary') {
    return 'default'
  }
  if (variant === 'ghost' || variant === 'destructive') {
    return variant
  }
  return 'outline'
}

function expandHexColor(hexColor: string): string {
  if (hexColor.length === 4) {
    const red = hexColor[1]!
    const green = hexColor[2]!
    const blue = hexColor[3]!
    return `#${red}${red}${green}${green}${blue}${blue}`
  }
  return hexColor
}

function resolveReadableTextColor(themeColor: string): string {
  const hex = expandHexColor(themeColor).slice(1)
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const yiq = (red * 299 + green * 587 + blue * 114) / 1000
  return yiq >= 160 ? '#0f172a' : '#ffffff'
}

function resolveHostToolbarButtonStyle(
  button: PageBuilderHostToolbarButton,
): React.CSSProperties | undefined {
  const { themeColor, textColor } = button
  if (!themeColor && !textColor) {
    return undefined
  }

  const style: React.CSSProperties = {}
  const filled = button.variant === 'primary' || button.variant === 'destructive'

  if (themeColor) {
    if (filled) {
      style.backgroundColor = themeColor
      style.borderColor = themeColor
    } else if (button.variant !== 'ghost') {
      style.borderColor = themeColor
    }
  }

  if (textColor) {
    style.color = textColor
  } else if (themeColor) {
    style.color = filled ? resolveReadableTextColor(themeColor) : themeColor
  }

  return style
}

function isHostToolbarButtonDisabled(
  button: PageBuilderHostToolbarButton,
  previewUrl: string | null,
): boolean {
  return button.disabled === true
    || button.busy === true
    || (button.requiresPreview === true && !previewUrl)
}

function isHostToolbarDropdownItemDisabled(
  item: PageBuilderHostToolbarDropdownItem,
  previewUrl: string | null,
): boolean {
  return item.disabled === true
    || (item.requiresPreview === true && !previewUrl)
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function resolveBlockActionBarStyle(
  anchor: SelectedAnchorState | null,
  frameRect: DOMRect | null | undefined,
): React.CSSProperties | null {
  if (!anchor) return null

  const estimatedWidth = anchor.imageTargetDescriptor
    ? BLOCK_ACTION_BAR_WITH_IMAGE_ACTION_ESTIMATED_WIDTH
    : BLOCK_ACTION_BAR_ESTIMATED_WIDTH
  const hostWidth = frameRect?.width ?? Math.max(anchor.rect.right + BLOCK_ACTION_BAR_PADDING, anchor.rect.left + 1)
  const hostHeight = frameRect?.height ?? Math.max(
    anchor.rect.bottom + BLOCK_ACTION_BAR_ESTIMATED_HEIGHT + BLOCK_ACTION_BAR_GAP,
    anchor.rect.top + 1,
  )

  const left = clamp(
    anchor.rect.left,
    BLOCK_ACTION_BAR_PADDING,
    hostWidth - estimatedWidth - BLOCK_ACTION_BAR_PADDING,
  )

  const canPlaceBelow = anchor.rect.bottom + BLOCK_ACTION_BAR_GAP + BLOCK_ACTION_BAR_ESTIMATED_HEIGHT
    <= hostHeight - BLOCK_ACTION_BAR_PADDING

  const top = canPlaceBelow
    ? anchor.rect.bottom + BLOCK_ACTION_BAR_GAP
    : clamp(
        anchor.rect.top - BLOCK_ACTION_BAR_GAP - BLOCK_ACTION_BAR_ESTIMATED_HEIGHT,
        BLOCK_ACTION_BAR_PADDING,
        hostHeight - BLOCK_ACTION_BAR_ESTIMATED_HEIGHT - BLOCK_ACTION_BAR_PADDING,
      )

  return { left, top }
}

function isPreviewBridgeMessage(value: unknown): value is PageBuilderPreviewBridgeMessage {
  if (!value || typeof value !== 'object') return false

  const message = value as Partial<PageBuilderPreviewBridgeMessage>
  return message.source === PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE && typeof message.type === 'string'
}

function resolvePreviewTargetSelection(
  message: Extract<PageBuilderPreviewBridgeMessage, { type: 'hover' | 'selected' }>,
): PageBuilderTargetSelection | null {
  if (message.targetSelection) {
    return message.targetSelection
  }

  if (!message.selector) {
    return null
  }

  return createPageBuilderBlockTargetSelection(message.selector)
}

function resolveTargetSelectionSelector(targetSelection: PageBuilderTargetSelection): string {
  return targetSelection.kind === 'cms-island'
    ? targetSelection.sourceSelector
    : targetSelection.selector
}

function resolveEmbeddedPreviewUrl(previewUrl: string): string {
  const baseOrigin = typeof window === 'undefined' || !window.location?.origin
    ? 'http://localhost'
    : window.location.origin
  const url = new URL(previewUrl, baseOrigin)
  url.searchParams.set('page-builder-bridge', '1')
  return url.toString()
}

export function PreviewPane({
  exportStaticPending = false,
  hostToolbarButtons = [],
  hiddenToolbarItems: hiddenToolbarItemsInput,
  onRequestExportStatic,
  onHostToolbarButtonClick,
  onInlineTextSaveRequest,
  onRequestDeleteBlock,
  onRequestOpenCmsBrowser,
  onRequestSaveTemplate,
  onRequestReplaceImage,
  imageReplacementPending = false,
  interactionLocked = false,
  previewUrl,
  requiresSameOrigin = false,
  saveTemplateDisabled = false,
  saveTemplateTitle,
  selectionActionState = 'idle',
  selectionModeEnabled = false,
  selectionToggleDisabled = false,
  onToggleSelectionMode,
  onSelectionEvent,
}: {
  exportStaticPending?: boolean
  hostToolbarButtons?: readonly PageBuilderHostToolbarButton[] | null
  hiddenToolbarItems?: readonly PageBuilderToolbarItemKey[] | null
  onRequestExportStatic?: () => void | Promise<void>
  onHostToolbarButtonClick?: (button: PageBuilderHostToolbarButton, itemId?: string) => void
  onInlineTextSaveRequest?: (request: PageBuilderInlineTextSaveRequest) => Promise<PageBuilderInlineTextSaveResult>
  onRequestDeleteBlock?: (selector: string) => void
  onRequestOpenCmsBrowser?: () => void
  onRequestSaveTemplate?: () => void
  onRequestReplaceImage?: (request: PageBuilderImageReplacementPayload) => void
  imageReplacementPending?: boolean
  interactionLocked?: boolean
  previewUrl: string | null
  requiresSameOrigin?: boolean
  saveTemplateDisabled?: boolean
  saveTemplateTitle?: string
  selectionActionState?: PreviewSelectionActionState
  selectionModeEnabled?: boolean
  selectionToggleDisabled?: boolean
  onToggleSelectionMode?: () => void
  onSelectionEvent?: (event: PageBuilderPreviewSelectionEvent) => void
}): React.ReactElement {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const viewportShellRef = React.useRef<HTMLDivElement>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const [frameKey, setFrameKey] = React.useState(0)
  const [bridgeReady, setBridgeReady] = React.useState(false)
  const [previewDeviceMode, setPreviewDeviceMode] = React.useState<PreviewDeviceMode>('desktop')
  const [selectedAnchor, setSelectedAnchor] = React.useState<SelectedAnchorState | null>(null)
  const [openHostToolbarDropdownId, setOpenHostToolbarDropdownId] = React.useState<string | null>(null)
  const hiddenToolbarItems = React.useMemo(
    () => normalizePageBuilderHiddenToolbarItems(hiddenToolbarItemsInput),
    [hiddenToolbarItemsInput],
  )
  const embeddedPreviewUrl = React.useMemo(() => {
    if (!previewUrl) {
      return previewUrl
    }

    return resolveEmbeddedPreviewUrl(previewUrl)
  }, [previewUrl])
  const previewSandbox = requiresSameOrigin
    ? 'allow-forms allow-scripts allow-same-origin'
    : 'allow-forms allow-scripts'
  const resolvedPreviewDeviceMode = getPageBuilderVisiblePreviewDeviceMode(previewDeviceMode, hiddenToolbarItems)
  const showPcPreviewToggle = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'pcPreview')
  const showMobilePreviewToggle = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'mobilePreview')
  const showDeviceToggleGroup = showPcPreviewToggle || showMobilePreviewToggle
  const showSelectionAction = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'select')
  const showExportAction = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'export')
  const showRefreshAction = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'refresh')
  const showSaveTemplateAction = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'saveTemplate') && !!onRequestSaveTemplate
  const showOpenInNewWindowAction = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'openInNewWindow')
  const visibleHostToolbarButtons = React.useMemo(
    () => (hostToolbarButtons ?? []).filter((button) => !button.hidden),
    [hostToolbarButtons],
  )
  const showPreviewActions = showSelectionAction
    || showExportAction
    || showRefreshAction
    || showSaveTemplateAction
    || showOpenInNewWindowAction
    || visibleHostToolbarButtons.length > 0

  React.useEffect(() => {
    if (!openHostToolbarDropdownId) return

    const openButton = visibleHostToolbarButtons.find((button) => button.id === openHostToolbarDropdownId)
    if (
      !openButton
      || openButton.type !== 'dropdown'
      || isHostToolbarButtonDisabled(openButton, previewUrl)
    ) {
      setOpenHostToolbarDropdownId(null)
    }
  }, [openHostToolbarDropdownId, previewUrl, visibleHostToolbarButtons])

  React.useEffect(() => {
    if (resolvedPreviewDeviceMode === previewDeviceMode) return
    setPreviewDeviceMode(resolvedPreviewDeviceMode)
  }, [previewDeviceMode, resolvedPreviewDeviceMode])

  const handleRefresh = React.useCallback(() => {
    if (!previewUrl) return
    onSelectionEvent?.({ type: 'reset' })
    setBridgeReady(false)
    setFrameKey((current) => current + 1)
  }, [onSelectionEvent, previewUrl])

  const handleOpenInNewWindow = React.useCallback(() => {
    if (!previewUrl) return
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }, [previewUrl])

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!isPreviewBridgeMessage(event.data)) return

      if (event.data.type === 'ready') {
        setBridgeReady(true)
        return
      }

      if (event.data.type === 'hover') {
        if (interactionLocked) return
        const targetSelection = resolvePreviewTargetSelection(event.data)
        onSelectionEvent?.({
          type: 'hover',
          selector: targetSelection
            ? resolveTargetSelectionSelector(targetSelection)
            : event.data.selector,
          targetSelection,
          displayLabel: event.data.displayLabel,
        })
        return
      }

      if (event.data.type === 'selected') {
        if (interactionLocked) return
        const targetSelection = resolvePreviewTargetSelection(event.data)
        if (!targetSelection) {
          setSelectedAnchor(null)
          onSelectionEvent?.({ type: 'reset' })
          return
        }

        const replaceImageTargetDescriptor = targetSelection.kind === 'block'
          && event.data.capabilities?.replaceImage?.supported
          ? event.data.capabilities.replaceImage.targetDescriptor
          : null
        setSelectedAnchor({
          imageTargetDescriptor: replaceImageTargetDescriptor,
          rect: event.data.rect,
          selector: resolveTargetSelectionSelector(targetSelection),
          targetSelection,
        })
        onSelectionEvent?.({
          type: 'selected',
          selector: resolveTargetSelectionSelector(targetSelection),
          targetSelection,
          displayLabel: event.data.displayLabel,
        })
        return
      }

      if (event.data.type === 'inline-text-save-request') {
        const saveRequest = event.data
        void (async () => {
          const {
            requestId,
            selector,
            textTargetDescriptor,
            previousText,
            nextText,
          } = saveRequest

          const result = await (async (): Promise<PageBuilderInlineTextSaveResult> => {
            if (!onInlineTextSaveRequest) {
              return {
                requestId,
                ok: false,
                error: '未配置内联文字保存处理器',
              }
            }

            try {
              return await onInlineTextSaveRequest({
                requestId,
                selector,
                textTargetDescriptor,
                previousText,
                nextText,
              })
            } catch (error) {
              return {
                requestId,
                ok: false,
                error: error instanceof Error ? error.message : '内联文字保存失败',
              }
            }
          })()

          const contentWindow = iframeRef.current?.contentWindow
          if (!contentWindow) return

          const responseMessage: PageBuilderPreviewParentMessage = {
            source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
            type: 'inline-text-save-result',
            ...result,
          }
          contentWindow.postMessage(responseMessage, '*')
        })()
        return
      }

      setSelectedAnchor(null)
      onSelectionEvent?.({ type: 'reset' })
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [interactionLocked, onInlineTextSaveRequest, onSelectionEvent])

  React.useEffect(() => {
    if (!previewUrl) return

    setBridgeReady(false)
    setSelectedAnchor(null)
    onSelectionEvent?.({ type: 'reset' })
  }, [onSelectionEvent, previewUrl])

  React.useEffect(() => {
    if (selectionModeEnabled) return
    setSelectedAnchor(null)
  }, [selectionModeEnabled])

  React.useEffect(() => {
    const contentWindow = iframeRef.current?.contentWindow
    if (!contentWindow || !previewUrl) return

    const modeMessage: PageBuilderPreviewParentMessage = {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: selectionModeEnabled,
      locked: interactionLocked,
    }

    contentWindow.postMessage(modeMessage, '*')

    if (!selectionModeEnabled) {
      const clearMessage: PageBuilderPreviewParentMessage = {
        source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
        type: 'selection-clear',
      }
      contentWindow.postMessage(clearMessage, '*')
    }
  }, [bridgeReady, interactionLocked, previewUrl, selectionModeEnabled])

  const handleSelectParentTarget = React.useCallback(() => {
    if (interactionLocked) return
    const contentWindow = iframeRef.current?.contentWindow
    if (!contentWindow || !previewUrl) return

    const parentMessage: PageBuilderPreviewParentMessage = {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-parent',
    }
    contentWindow.postMessage(parentMessage, '*')
  }, [interactionLocked, previewUrl])

  const handleClearSelectedTarget = React.useCallback(() => {
    if (interactionLocked) return
    const contentWindow = iframeRef.current?.contentWindow
    setSelectedAnchor(null)
    onSelectionEvent?.({ type: 'reset' })
    if (!contentWindow || !previewUrl) return

    const clearMessage: PageBuilderPreviewParentMessage = {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-clear',
    }
    contentWindow.postMessage(clearMessage, '*')
  }, [interactionLocked, onSelectionEvent, previewUrl])

  const blockActionBarStyle = resolveBlockActionBarStyle(
    selectedAnchor,
    viewportShellRef.current?.getBoundingClientRect?.() ?? frameRef.current?.getBoundingClientRect?.(),
  )
  const selectedImageTargetDescriptor = selectedAnchor?.imageTargetDescriptor ?? null
  const isMobilePreview = resolvedPreviewDeviceMode === 'mobile'
  const viewportShellWidth = resolvedPreviewDeviceMode === 'mobile'
    ? `min(${MOBILE_PREVIEW_VIEWPORT_WIDTH}px, 100%)`
    : '100%'
  const selectionToggleTitle = selectionActionState === 'selected'
    ? '已选区域'
    : selectionActionState === 'armed'
      ? '从页面中选择'
      : '选择进行编辑'
  const selectionToggleDisabledState = selectionToggleDisabled || !previewUrl
  const selectionToggleClassName = selectionActionState === 'selected'
    ? 'border border-primary/70 bg-primary text-primary-foreground hover:bg-primary'
    : selectionActionState === 'armed'
      ? 'border border-primary/35 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-primary/15 hover:border-primary/45 hover:bg-primary/14 hover:text-primary'
      : 'text-foreground'
  const actionButtonClassName = 'h-8 gap-1.5 px-2.5 text-xs'

  return (
    <section className="page-builder-pane flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl lg:h-full lg:min-h-0">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5">
        {showDeviceToggleGroup ? (
          <div
            className="flex items-center gap-1 rounded-md border border-border/70 bg-background/80 p-0.5"
            data-preview-device-toggle-group={true}
          >
            {showPcPreviewToggle ? (
              <Button
                aria-label="PC 预览"
                aria-pressed={resolvedPreviewDeviceMode === 'desktop'}
                className={cn(
                  'size-7 rounded-[6px] border-0 shadow-none',
                  resolvedPreviewDeviceMode === 'desktop'
                    ? 'bg-accent text-accent-foreground hover:bg-accent'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
                onClick={() => setPreviewDeviceMode('desktop')}
                size="icon-sm"
                title="PC 预览"
                type="button"
                variant="ghost"
              >
                <Laptop className="size-3.5" />
              </Button>
            ) : null}
            {showMobilePreviewToggle ? (
              <Button
                aria-label="Mobile 预览"
                aria-pressed={resolvedPreviewDeviceMode === 'mobile'}
                className={cn(
                  'size-7 rounded-[6px] border-0 shadow-none',
                  resolvedPreviewDeviceMode === 'mobile'
                    ? 'bg-accent text-accent-foreground hover:bg-accent'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
                onClick={() => setPreviewDeviceMode('mobile')}
                size="icon-sm"
                title="Mobile 预览"
                type="button"
                variant="ghost"
              >
                <Smartphone className="size-3.5" />
              </Button>
            ) : null}
          </div>
        ) : <div aria-hidden={true} />}
        {showPreviewActions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {showSelectionAction ? (
              <Button
                aria-label="选择区块"
                aria-pressed={selectionActionState !== 'idle'}
                className={cn(
                  actionButtonClassName,
                  selectionToggleClassName,
                )}
                disabled={selectionToggleDisabledState}
                onClick={onToggleSelectionMode}
                size="sm"
                title={selectionToggleTitle}
                type="button"
                variant="outline"
              >
                <MousePointerClick className="size-3.5" />
                <span>选择</span>
              </Button>
            ) : null}
            {showRefreshAction ? (
              <Button
                aria-label="刷新预览"
                className={actionButtonClassName}
                disabled={!previewUrl}
                onClick={handleRefresh}
                size="sm"
                title="刷新预览"
                type="button"
                variant="outline"
              >
                <RefreshCw className="size-3.5" />
                <span>刷新</span>
              </Button>
            ) : null}
            {showOpenInNewWindowAction ? (
              <Button
                aria-label="新窗口打开预览"
                className={actionButtonClassName}
                disabled={!previewUrl}
                onClick={handleOpenInNewWindow}
                size="sm"
                title="新窗口打开预览"
                type="button"
                variant="outline"
              >
                <ExternalLink className="size-3.5" />
                <span>新窗口打开</span>
              </Button>
            ) : null}
            {showExportAction ? (
              <Button
                aria-label="导出静态包"
                aria-busy={exportStaticPending}
                className={actionButtonClassName}
                disabled={!previewUrl || exportStaticPending}
                onClick={() => {
                  void onRequestExportStatic?.()
                }}
                size="sm"
                title="导出静态包"
                type="button"
                variant="outline"
              >
                {exportStaticPending
                  ? <LoaderCircle className="size-3.5 animate-spin" />
                  : <Download className="size-3.5" />}
                <span>导出</span>
              </Button>
            ) : null}
            {showSaveTemplateAction ? (
              <Button
                aria-label="另存模板"
                className={actionButtonClassName}
                disabled={saveTemplateDisabled}
                onClick={() => {
                  if (saveTemplateDisabled) return
                  onRequestSaveTemplate()
                }}
                size="sm"
                title={saveTemplateTitle}
                type="button"
                variant="outline"
              >
                <Save className="size-3.5" />
                <span>另存模板</span>
              </Button>
            ) : null}
            {visibleHostToolbarButtons.map((button) => {
              const Icon = button.busy
                ? LoaderCircle
                : button.icon
                  ? HOST_TOOLBAR_ICON_COMPONENTS[button.icon]
                  : null
              const disabled = isHostToolbarButtonDisabled(button, previewUrl)

              if (button.type === 'dropdown') {
                const isOpen = openHostToolbarDropdownId === button.id
                const visibleItems = button.items.filter((item) => !item.hidden)

                return (
                  <div key={button.id} className="relative inline-flex max-w-[8.5rem]">
                    <Button
                      aria-busy={button.busy === true}
                      aria-expanded={isOpen}
                      aria-haspopup="menu"
                      aria-label={button.label}
                      className={cn(actionButtonClassName, 'max-w-[8.5rem]')}
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return
                        setOpenHostToolbarDropdownId((current) => current === button.id ? null : button.id)
                      }}
                      size="sm"
                      style={resolveHostToolbarButtonStyle(button)}
                      title={button.tooltip ?? button.label}
                      type="button"
                      variant={resolveHostToolbarButtonVariant(button.variant)}
                    >
                      {Icon ? (
                        <Icon className={cn('size-3.5 shrink-0', button.busy ? 'animate-spin' : '')} />
                      ) : null}
                      <span className="min-w-0 max-w-[5.5rem] truncate">{button.label}</span>
                      <ChevronDown
                        aria-hidden={true}
                        className={cn(
                          'size-3 shrink-0 text-current/70 transition-transform',
                          isOpen ? 'rotate-180' : '',
                        )}
                      />
                    </Button>
                    {isOpen ? (
                      <div
                        className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] max-w-[16rem] overflow-hidden rounded-lg border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg"
                        data-host-toolbar-dropdown-menu={button.id}
                        role="menu"
                      >
                        {visibleItems.map((item) => {
                          const ItemIcon = item.icon ? HOST_TOOLBAR_ICON_COMPONENTS[item.icon] : null
                          const itemDisabled = isHostToolbarDropdownItemDisabled(item, previewUrl)

                          return (
                            <button
                              key={item.id}
                              aria-label={item.label}
                              className={cn(
                                'flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                                itemDisabled
                                  ? 'cursor-not-allowed text-muted-foreground/60'
                                  : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground',
                              )}
                              disabled={itemDisabled}
                              onClick={() => {
                                if (itemDisabled) return
                                setOpenHostToolbarDropdownId(null)
                                onHostToolbarButtonClick?.(button, item.id)
                              }}
                              role="menuitem"
                              title={item.tooltip ?? item.label}
                              type="button"
                            >
                              {ItemIcon ? <ItemIcon className="size-3.5 shrink-0" /> : null}
                              <span className="min-w-0 max-w-[12rem] truncate">{item.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              }

              return (
                <Button
                  key={button.id}
                  aria-busy={button.busy === true}
                  aria-label={button.label}
                  className={cn(actionButtonClassName, 'max-w-[8.5rem]')}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return
                    onHostToolbarButtonClick?.(button)
                  }}
                  size="sm"
                  style={resolveHostToolbarButtonStyle(button)}
                  title={button.tooltip ?? button.label}
                  type="button"
                  variant={resolveHostToolbarButtonVariant(button.variant)}
                >
                  {Icon ? (
                    <Icon className={cn('size-3.5', button.busy ? 'animate-spin' : '')} />
                  ) : null}
                  <span className="min-w-0 max-w-[5.5rem] truncate">{button.label}</span>
                </Button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 p-2.5">
        <div
          ref={frameRef}
          className="relative flex h-full min-h-[480px] items-stretch justify-center overflow-hidden rounded-xl border border-border/70 bg-background"
        >
          <div
            className={cn(
              'flex h-full w-full items-stretch justify-center',
              isMobilePreview ? 'px-3 py-4' : '',
            )}
            data-preview-viewport-frame={true}
          >
            <div
              ref={viewportShellRef}
              className={cn(
                'relative h-full min-h-[480px] max-w-full shrink-0 bg-background',
                isMobilePreview
                  ? 'overflow-hidden rounded-xl border border-border/70 shadow-[0_10px_28px_rgba(15,23,42,0.08)]'
                  : '',
              )}
              data-preview-device-mode={resolvedPreviewDeviceMode}
              data-preview-viewport-shell={true}
              style={{ width: viewportShellWidth }}
            >
              {previewUrl ? (
                <>
                  <iframe
                    ref={iframeRef}
                    key={frameKey}
                    className="h-full w-full border-0 bg-background"
                    onLoad={() => setBridgeReady(false)}
                    sandbox={previewSandbox}
                    src={embeddedPreviewUrl ?? undefined}
                    title="网页预览"
                  />
                  {selectedAnchor && blockActionBarStyle ? (
                    <div className="pointer-events-none absolute inset-0 z-10">
                      <PageBuilderBlockActionBar
                        actionsDisabled={interactionLocked}
                        onClearSelection={handleClearSelectedTarget}
                        onDelete={() => {
                          if (interactionLocked) return
                          onRequestDeleteBlock?.(selectedAnchor.selector)
                        }}
                        onOpenCms={onRequestOpenCmsBrowser
                          ? () => {
                              if (interactionLocked) return
                              onRequestOpenCmsBrowser()
                            }
                          : undefined}
                        onReplaceImage={selectedImageTargetDescriptor
                          ? () => {
                              if (interactionLocked) return
                              onRequestReplaceImage?.({
                                selector: selectedAnchor.selector,
                                imageTargetDescriptor: selectedImageTargetDescriptor,
                              })
                            }
                          : undefined}
                        onSelectParent={handleSelectParentTarget}
                        replaceImageDisabled={imageReplacementPending}
                        style={blockActionBarStyle}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/35 text-center text-sm text-muted-foreground">
                  <p className="font-medium text-foreground/75">预览尚未生成</p>
                  <p className="max-w-[36ch] leading-6">
                    在右侧继续描述或修改网页需求，生成结果写入工作区后会自动显示在这里。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
