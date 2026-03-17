/**
 * useSmoothStream - 流式文本平滑渲染 Hook
 *
 * 将后端推送的流式文本（可能每秒几十次更新）转化为
 * 平滑的逐字渲染效果，类似打字机。
 *
 * 核心机制：
 * 1. 新增 delta 通过 Intl.Segmenter 拆分为字符粒度后入队
 * 2. requestAnimationFrame 驱动渲染循环
 * 3. 每帧动态计算渲染字符数（队列长时加速追赶，短时放慢）
 * 4. 流结束后加速但渐进排空队列（不一次性 dump，避免跳动）
 *
 * 参考 Cherry Studio 的 useSmoothStream 实现。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSmoothStreamOptions {
  /** 原始流式内容（每次 chunk 累积后的完整文本） */
  content: string
  /** 是否正在流式输出中 */
  isStreaming: boolean
  /** 每帧最小间隔（ms），默认 10 */
  minDelay?: number
}

interface UseSmoothStreamReturn {
  /** 平滑后的显示内容 */
  displayedContent: string
}

type SmoothStreamContentChangeMode = 'noop' | 'append' | 'reset'

interface SmoothStreamContentChangeInput {
  previousContent: string
  nextContent: string
  queuedChars: string[]
}

interface SmoothStreamContentChangeResult {
  mode: SmoothStreamContentChangeMode
  displayedContent?: string
  queuedChars: string[]
}

interface SmoothStreamFrameInput {
  displayedContent: string
  queuedChars: string[]
  targetContent: string
  streamDone: boolean
}

interface SmoothStreamFrameResult {
  displayedContent: string
  queuedChars: string[]
  isComplete: boolean
}

interface CompletedSmoothStreamStateInput {
  displayedContent: string
  queuedChars: string[]
  targetContent: string
  hasActiveAnimation: boolean
}

interface CompletedSmoothStreamStateResult {
  displayedContent: string
  queuedChars: string[]
}

/** 多语言字符分割器（正确处理中文、日文等多字节字符） */
const segmenter = new Intl.Segmenter(
  ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'de-DE', 'fr-FR', 'es-ES', 'pt-PT', 'ru-RU'],
)

/** 用 Intl.Segmenter 将文本拆分为字符数组 */
function segmentText(text: string): string[] {
  return Array.from(segmenter.segment(text)).map((s) => s.segment)
}

export function deriveSmoothStreamContentChange({
  previousContent,
  nextContent,
  queuedChars,
}: SmoothStreamContentChangeInput): SmoothStreamContentChangeResult {
  if (nextContent === previousContent) {
    return { mode: 'noop', queuedChars }
  }

  if (nextContent.startsWith(previousContent)) {
    const delta = nextContent.slice(previousContent.length)
    if (!delta) {
      return { mode: 'noop', queuedChars }
    }

    return {
      mode: 'append',
      queuedChars: [...queuedChars, ...segmentText(delta)],
    }
  }

  return {
    mode: 'reset',
    displayedContent: nextContent,
    queuedChars: [],
  }
}

function getSmoothStreamFrameSize(queueLength: number, streamDone: boolean): number {
  const divisor = streamDone ? 4 : 8
  return Math.max(1, Math.floor(queueLength / divisor))
}

export function advanceSmoothStreamFrame({
  displayedContent,
  queuedChars,
  targetContent,
  streamDone,
}: SmoothStreamFrameInput): SmoothStreamFrameResult {
  if (queuedChars.length === 0) {
    return {
      displayedContent: streamDone ? targetContent : displayedContent,
      queuedChars,
      isComplete: streamDone,
    }
  }

  const count = getSmoothStreamFrameSize(queuedChars.length, streamDone)
  const emittedChars = queuedChars.slice(0, count)
  const remainingChars = queuedChars.slice(count)
  const nextDisplayedBase = `${displayedContent}${emittedChars.join('')}`
  const nextDisplayedContent = streamDone && remainingChars.length === 0
    ? targetContent
    : nextDisplayedBase

  return {
    displayedContent: nextDisplayedContent,
    queuedChars: remainingChars,
    isComplete: streamDone && remainingChars.length === 0,
  }
}

export function syncCompletedSmoothStreamState({
  displayedContent,
  queuedChars,
  targetContent,
  hasActiveAnimation,
}: CompletedSmoothStreamStateInput): CompletedSmoothStreamStateResult {
  if (hasActiveAnimation) {
    return { displayedContent, queuedChars }
  }

  if (queuedChars.length === 0 && displayedContent === targetContent) {
    return { displayedContent, queuedChars }
  }

  return {
    displayedContent: targetContent,
    queuedChars: [],
  }
}

/**
 * 流式文本平滑渲染 Hook
 *
 * @example
 * ```tsx
 * const streamingContent = useAtomValue(streamingContentAtom)
 * const isStreaming = useAtomValue(streamingAtom)
 *
 * const { displayedContent } = useSmoothStream({
 *   content: streamingContent,
 *   isStreaming,
 * })
 *
 * return <MessageResponse>{displayedContent}</MessageResponse>
 * ```
 */
export function useSmoothStream({
  content,
  isStreaming,
  minDelay = 10,
}: UseSmoothStreamOptions): UseSmoothStreamReturn {
  const [displayedContent, setDisplayedContent] = useState(content)

  // 字符队列（待渲染的字符）
  const chunkQueueRef = useRef<string[]>([])
  // rAF ID
  const rafRef = useRef<number | null>(null)
  // 已渲染到 UI 的文本
  const displayedRef = useRef(content)
  // 上一次收到的完整内容（用于计算 delta）
  const prevContentRef = useRef(content)
  // 上次渲染时间
  const lastRenderTimeRef = useRef(0)
  // 流是否结束
  const streamDoneRef = useRef(!isStreaming)

  // 同步 streamDone 状态
  streamDoneRef.current = !isStreaming

  // 检测内容变化，计算 delta 并入队
  useEffect(() => {
    const contentChange = deriveSmoothStreamContentChange({
      previousContent: prevContentRef.current,
      nextContent: content,
      queuedChars: chunkQueueRef.current,
    })

    if (contentChange.mode === 'noop') return

    chunkQueueRef.current = contentChange.queuedChars

    if (contentChange.mode === 'reset') {
      displayedRef.current = contentChange.displayedContent ?? content
      setDisplayedContent(displayedRef.current)
    }

    prevContentRef.current = content
  }, [content])

  // 非流式状态时，确保最终内容一致（若动画仍在排空队列，则交给 rAF 自然完成）
  useEffect(() => {
    if (!isStreaming) {
      const completedState = syncCompletedSmoothStreamState({
        displayedContent: displayedRef.current,
        queuedChars: chunkQueueRef.current,
        targetContent: content,
        hasActiveAnimation: rafRef.current !== null,
      })

      chunkQueueRef.current = completedState.queuedChars
      if (completedState.displayedContent !== displayedRef.current) {
        displayedRef.current = completedState.displayedContent
        setDisplayedContent(displayedRef.current)
      }
    }
  }, [isStreaming, content])

  // 渲染循环
  const renderLoop = useCallback((currentTime: number) => {
    if (chunkQueueRef.current.length === 0 && !streamDoneRef.current) {
      rafRef.current = requestAnimationFrame(renderLoop)
      return
    }

    if (chunkQueueRef.current.length > 0) {
      if (currentTime - lastRenderTimeRef.current < minDelay) {
        rafRef.current = requestAnimationFrame(renderLoop)
        return
      }
      lastRenderTimeRef.current = currentTime
    }

    const nextFrame = advanceSmoothStreamFrame({
      displayedContent: displayedRef.current,
      queuedChars: chunkQueueRef.current,
      targetContent: prevContentRef.current,
      streamDone: streamDoneRef.current,
    })

    chunkQueueRef.current = nextFrame.queuedChars

    if (nextFrame.displayedContent !== displayedRef.current) {
      displayedRef.current = nextFrame.displayedContent
      setDisplayedContent(displayedRef.current)
    }

    if (!nextFrame.isComplete) {
      rafRef.current = requestAnimationFrame(renderLoop)
    } else {
      rafRef.current = null
    }
  }, [minDelay])

  // 启动/重启渲染循环
  useEffect(() => {
    if ((isStreaming || chunkQueueRef.current.length > 0) && !rafRef.current) {
      rafRef.current = requestAnimationFrame(renderLoop)
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isStreaming, renderLoop])

  return { displayedContent }
}
