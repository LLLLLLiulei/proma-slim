import * as React from 'react'
import type {
  PageBuilderCmsChannel,
  PageBuilderCmsConfirmedSelection,
  PageBuilderCmsContent,
  PageBuilderCmsSelectionRequest,
} from '@proma/shared'
import { Check, Database, LoaderCircle, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

type PickerMode = 'manual' | 'agent'
type SourceFamily = 'channel' | 'content'
type ChannelSelectionKind = 'channel-node' | 'channel-children'
type ContentSelectionKind = 'content-item' | 'content-list'

interface FlatChannel extends PageBuilderCmsChannel {
  depth: number
}

const ALL_SOURCE_TYPES = ['channel-node', 'channel-children', 'content-item', 'content-list'] as const

function flattenChannels(channels: PageBuilderCmsChannel[], depth = 0): FlatChannel[] {
  return channels.flatMap((channel) => ([
    { ...channel, depth },
    ...flattenChannels(channel.children, depth + 1),
  ]))
}

function resolvePreviewAssetUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath?.trim()) return null
  return `/api/page-builder/cms/assets/preview?path=${encodeURIComponent(relativePath)}`
}

function buildDefaultSourceFamily(allowedSourceTypes: readonly string[]): SourceFamily {
  if (allowedSourceTypes.includes('content-item') || allowedSourceTypes.includes('content-list')) {
    return 'content'
  }
  return 'channel'
}

function buildDefaultChannelKind(allowedSourceTypes: readonly string[]): ChannelSelectionKind {
  return allowedSourceTypes.includes('channel-node') ? 'channel-node' : 'channel-children'
}

function buildDefaultContentKind(allowedSourceTypes: readonly string[]): ContentSelectionKind {
  return allowedSourceTypes.includes('content-item') ? 'content-item' : 'content-list'
}

export function PageBuilderCmsPickerModal({
  open,
  mode,
  sessionId,
  workspaceId,
  request,
  onConfirm,
  onCancel,
}: {
  open: boolean
  mode: PickerMode
  sessionId: string
  workspaceId: string
  request?: PageBuilderCmsSelectionRequest | null
  onConfirm: (selection: PageBuilderCmsConfirmedSelection) => Promise<void> | void
  onCancel: () => Promise<void> | void
}): React.ReactElement | null {
  const allowedSourceTypes = React.useMemo(
    () => request?.allowedSourceTypes ?? [...ALL_SOURCE_TYPES],
    [request],
  )
  const [sourceFamily, setSourceFamily] = React.useState<SourceFamily>(() => buildDefaultSourceFamily(allowedSourceTypes))
  const [channelSelectionKind, setChannelSelectionKind] = React.useState<ChannelSelectionKind>(
    () => buildDefaultChannelKind(allowedSourceTypes),
  )
  const [contentSelectionKind, setContentSelectionKind] = React.useState<ContentSelectionKind>(
    () => buildDefaultContentKind(allowedSourceTypes),
  )
  const [channelSearch, setChannelSearch] = React.useState('')
  const [contentSearch, setContentSearch] = React.useState('')
  const [contentTypeFilter, setContentTypeFilter] = React.useState('all')
  const [channels, setChannels] = React.useState<PageBuilderCmsChannel[]>([])
  const [loadingChannels, setLoadingChannels] = React.useState(false)
  const [channelError, setChannelError] = React.useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = React.useState<string | null>(null)
  const [contents, setContents] = React.useState<PageBuilderCmsContent[]>([])
  const [loadingContents, setLoadingContents] = React.useState(false)
  const [contentError, setContentError] = React.useState<string | null>(null)
  const [selectedContentIds, setSelectedContentIds] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  const flatChannels = React.useMemo(() => flattenChannels(channels), [channels])
  const selectedChannel = React.useMemo(
    () => flatChannels.find((channel) => channel.id === selectedChannelId) ?? null,
    [flatChannels, selectedChannelId],
  )
  const availableContentTypes = React.useMemo(() => {
    return Array.from(new Map(contents.map((item) => [item.contentTypeId, item.contentTypeId])).values())
  }, [contents])
  const filteredContents = React.useMemo(() => {
    if (contentTypeFilter === 'all') return contents
    return contents.filter((item) => item.contentTypeId === contentTypeFilter)
  }, [contentTypeFilter, contents])
  const selectedItems = React.useMemo(() => {
    return filteredContents.filter((item) => selectedContentIds.includes(item.id))
  }, [filteredContents, selectedContentIds])

  React.useEffect(() => {
    if (!open) return

    setSourceFamily(buildDefaultSourceFamily(allowedSourceTypes))
    setChannelSelectionKind(buildDefaultChannelKind(allowedSourceTypes))
    setContentSelectionKind(buildDefaultContentKind(allowedSourceTypes))
    setContentTypeFilter('all')
    setSelectedContentIds([])
  }, [allowedSourceTypes, open])

  React.useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoadingChannels(true)
    setChannelError(null)

    void api.listPageBuilderCmsChannels(channelSearch.trim() || undefined)
      .then((items) => {
        if (cancelled) return
        setChannels(items)

        const flattened = flattenChannels(items)
        if (!selectedChannelId && flattened.length > 0) {
          setSelectedChannelId(flattened[0]!.id)
        } else if (selectedChannelId && !flattened.some((item) => item.id === selectedChannelId)) {
          setSelectedChannelId(flattened[0]?.id ?? null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setChannelError(error instanceof Error ? error.message : '加载 CMS 栏目失败')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingChannels(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [channelSearch, open, selectedChannelId])

  React.useEffect(() => {
    if (!open || sourceFamily !== 'content') return
    if (!selectedChannelId) {
      setContents([])
      setSelectedContentIds([])
      return
    }

    let cancelled = false
    setLoadingContents(true)
    setContentError(null)

    void api.listPageBuilderCmsContents({
      catalogId: selectedChannelId,
      ...(contentSearch.trim() ? { title: contentSearch.trim() } : {}),
      pageIndex: 0,
      pageSize: 24,
    })
      .then((page) => {
        if (cancelled) return
        setContents(page.items)
        setSelectedContentIds((current) => current.filter((id) => page.items.some((item) => item.id === id)))
      })
      .catch((error) => {
        if (!cancelled) {
          setContentError(error instanceof Error ? error.message : '加载 CMS 内容失败')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingContents(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [contentSearch, open, selectedChannelId, sourceFamily])

  const canChooseChannels = allowedSourceTypes.includes('channel-node') || allowedSourceTypes.includes('channel-children')
  const canChooseContents = allowedSourceTypes.includes('content-item') || allowedSourceTypes.includes('content-list')

  const handleToggleContentSelection = React.useCallback((item: PageBuilderCmsContent) => {
    setSelectedContentIds((current) => {
      if (contentSelectionKind === 'content-item') {
        return [item.id]
      }

      if (current.includes(item.id)) {
        return current.filter((value) => value !== item.id)
      }

      return [...current, item.id]
    })
  }, [contentSelectionKind])

  const handleConfirm = React.useCallback(async () => {
    if (!selectedChannel) return

    let selection: PageBuilderCmsConfirmedSelection | null = null
    if (sourceFamily === 'channel') {
      selection = {
        sourceType: channelSelectionKind,
        stableId: `${channelSelectionKind}:${selectedChannel.id}`,
        displayName: channelSelectionKind === 'channel-node'
          ? selectedChannel.name
          : `${selectedChannel.name} 子栏目`,
        channelId: selectedChannel.id,
        channelName: selectedChannel.name,
        selector: request?.selector ?? null,
        presentationHint: request?.presentationHint ?? null,
      }
    } else {
      const items = selectedItems.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        ...(item.previewAsset ? { previewAsset: item.previewAsset } : {}),
      }))

      if (contentSelectionKind === 'content-item') {
        const first = selectedItems[0]
        if (!first) return
        selection = {
          sourceType: 'content-item',
          stableId: `content:${selectedChannel.id}:${first.id}`,
          displayName: first.title,
          catalogId: selectedChannel.id,
          contentId: first.id,
          contentTypeId: first.contentTypeId,
          itemIds: [first.id],
          items,
          selector: request?.selector ?? null,
          presentationHint: request?.presentationHint ?? null,
        }
      } else {
        if (selectedItems.length === 0) return
        selection = {
          sourceType: 'content-list',
          stableId: `content-list:${selectedChannel.id}:${selectedItems.map((item) => item.id).join(',')}`,
          displayName: `${selectedChannel.name} 内容列表`,
          catalogId: selectedChannel.id,
          contentTypeId: selectedItems[0]?.contentTypeId ?? null,
          itemIds: selectedItems.map((item) => item.id),
          items,
          selector: request?.selector ?? null,
          presentationHint: request?.presentationHint ?? null,
        }
      }
    }

    if (!selection) return

    setSubmitting(true)
    try {
      await onConfirm(selection)
    } finally {
      setSubmitting(false)
    }
  }, [
    channelSelectionKind,
    contentSelectionKind,
    onConfirm,
    request,
    selectedChannel,
    selectedItems,
    sourceFamily,
  ])

  const handleCancel = React.useCallback(async () => {
    setSubmitting(true)
    try {
      await onCancel()
    } finally {
      setSubmitting(false)
    }
  }, [onCancel])

  const confirmDisabled = sourceFamily === 'channel'
    ? !selectedChannel
    : contentSelectionKind === 'content-item'
      ? selectedItems.length !== 1
      : selectedItems.length === 0

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
      <div className="page-builder-pane flex h-[min(86vh,760px)] w-full max-w-6xl min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl">
        <div className="flex items-start justify-between border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Database className="size-3.5" />
              CMS 数据源
            </div>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              {request?.title ?? (mode === 'agent' ? '为当前请求选择 CMS 数据' : '从 CMS 选择数据')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {request?.description ?? (mode === 'agent'
                ? '选择结果会直接回传给当前 Agent 轮次继续执行。'
                : '确认后，本次选择会作为下一条消息的隐藏上下文发送给 Agent。')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              会话：{sessionId} · 工作区：{workspaceId}
            </p>
          </div>
          <Button className="h-8 px-2.5" onClick={() => { void handleCancel() }} size="sm" type="button" variant="ghost">
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-border/60 bg-muted/20">
            <div className="border-b border-border/50 px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9"
                  onChange={(event) => setChannelSearch(event.target.value)}
                  placeholder="搜索栏目"
                  value={channelSearch}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {loadingChannels && (
                <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  正在加载栏目...
                </div>
              )}
              {channelError && (
                <div className="px-2 py-3 text-sm text-destructive">{channelError}</div>
              )}
              {!loadingChannels && !channelError && flatChannels.length === 0 && (
                <div className="px-2 py-3 text-sm text-muted-foreground">暂无可用栏目。</div>
              )}
              <div className="space-y-1">
                {flatChannels.map((channel) => (
                  <button
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                      channel.id === selectedChannelId
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
                    }`}
                    key={channel.id}
                    onClick={() => {
                      setSelectedChannelId(channel.id)
                      setSelectedContentIds([])
                    }}
                    style={{ paddingLeft: `${12 + channel.depth * 18}px` }}
                    type="button"
                  >
                    <span className="truncate">{channel.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
              <div className="flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 p-1">
                {canChooseChannels && (
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      sourceFamily === 'channel'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setSourceFamily('channel')}
                    type="button"
                  >
                    栏目
                  </button>
                )}
                {canChooseContents && (
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      sourceFamily === 'content'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setSourceFamily('content')}
                    type="button"
                  >
                    内容
                  </button>
                )}
              </div>

              {sourceFamily === 'channel' && (
                <div className="flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 p-1">
                  {allowedSourceTypes.includes('channel-node') && (
                    <button
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        channelSelectionKind === 'channel-node'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setChannelSelectionKind('channel-node')}
                      type="button"
                    >
                      当前栏目
                    </button>
                  )}
                  {allowedSourceTypes.includes('channel-children') && (
                    <button
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        channelSelectionKind === 'channel-children'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setChannelSelectionKind('channel-children')}
                      type="button"
                    >
                      子栏目列表
                    </button>
                  )}
                </div>
              )}

              {sourceFamily === 'content' && (
                <>
                  <div className="flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 p-1">
                    {allowedSourceTypes.includes('content-item') && (
                      <button
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          contentSelectionKind === 'content-item'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => {
                          setContentSelectionKind('content-item')
                          setSelectedContentIds((current) => current.slice(0, 1))
                        }}
                        type="button"
                      >
                        单条内容
                      </button>
                    )}
                    {allowedSourceTypes.includes('content-list') && (
                      <button
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          contentSelectionKind === 'content-list'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setContentSelectionKind('content-list')}
                        type="button"
                      >
                        内容列表
                      </button>
                    )}
                  </div>
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-9 pl-9"
                      disabled={!selectedChannelId}
                      onChange={(event) => setContentSearch(event.target.value)}
                      placeholder={selectedChannelId ? '搜索标题' : '请先选择栏目'}
                      value={contentSearch}
                    />
                  </div>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    onChange={(event) => setContentTypeFilter(event.target.value)}
                    value={contentTypeFilter}
                  >
                    <option value="all">全部类型</option>
                    {availableContentTypes.map((contentTypeId) => (
                      <option key={contentTypeId} value={contentTypeId}>
                        {contentTypeId}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {sourceFamily === 'channel' && (
                <div className="space-y-3">
                  {!selectedChannel && (
                    <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                      请选择左侧栏目后再确认。
                    </div>
                  )}
                  {selectedChannel && (
                    <div className="rounded-2xl border border-border/70 bg-muted/[0.18] p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">当前目标</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">{selectedChannel.name}</div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {channelSelectionKind === 'channel-node'
                          ? '会把当前栏目作为单个数据源返回，适合栏目入口或单栏目标识区块。'
                          : '会把当前栏目的子栏目集合作为数据源返回，适合导航或栏目列表。'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sourceFamily === 'content' && (
                <div className="space-y-4">
                  {!selectedChannel && (
                    <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                      请先从左侧选择栏目，再在该栏目范围内搜索和选择内容。
                    </div>
                  )}
                  {selectedChannel && loadingContents && (
                    <div className="flex items-center gap-2 rounded-xl border border-border/70 px-4 py-6 text-sm text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" />
                      正在加载内容...
                    </div>
                  )}
                  {selectedChannel && contentError && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
                      {contentError}
                    </div>
                  )}
                  {selectedChannel && !loadingContents && !contentError && filteredContents.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                      当前筛选条件下没有可选内容。
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {filteredContents.map((item) => {
                      const previewUrl = resolvePreviewAssetUrl(item.previewAsset?.relativePath)
                      const selected = selectedContentIds.includes(item.id)
                      return (
                        <button
                          className={`overflow-hidden rounded-2xl border text-left transition ${
                            selected
                              ? 'border-primary/70 bg-primary/[0.06] shadow-sm ring-1 ring-primary/25'
                              : 'border-border/70 bg-background hover:border-foreground/15 hover:bg-muted/[0.18]'
                          }`}
                          key={item.id}
                          onClick={() => handleToggleContentSelection(item)}
                          type="button"
                        >
                          <div className="flex gap-3 p-3">
                            <div className="relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/35">
                              {previewUrl ? (
                                <img
                                  alt={item.title}
                                  className="max-h-full max-w-full object-contain"
                                  src={previewUrl}
                                />
                              ) : (
                                <Database className="size-5 text-muted-foreground" />
                              )}
                              {selected && (
                                <div className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <Check className="size-3.5" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</div>
                              {item.summary && (
                                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</div>
                              )}
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="rounded-full bg-muted/70 px-2 py-0.5">{item.contentTypeId}</span>
                                {item.publishDate && <span>{item.publishDate}</span>}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <div className="text-xs text-muted-foreground">
            {mode === 'agent'
              ? '确认后会直接恢复当前 Agent 工具调用。'
              : '确认后仅对下一条发送消息生效。'}
          </div>
          <div className="flex items-center gap-2">
            <Button disabled={submitting} onClick={() => { void handleCancel() }} type="button" variant="ghost">
              取消
            </Button>
            <Button disabled={confirmDisabled || submitting} onClick={() => { void handleConfirm() }} type="button">
              {submitting && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              确认选择
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
