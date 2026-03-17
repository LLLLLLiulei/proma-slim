import { describe, expect, test } from 'bun:test'
import {
  advanceSmoothStreamFrame,
  deriveSmoothStreamContentChange,
  syncCompletedSmoothStreamState,
} from './useSmoothStream'

describe('useSmoothStream helpers', () => {
  test('drains remaining content progressively after streaming ends', () => {
    const result = advanceSmoothStreamFrame({
      displayedContent: '已显示',
      queuedChars: Array.from('剩余内容需要渐进排空'),
      targetContent: '已显示剩余内容需要渐进排空',
      streamDone: true,
    })

    expect(result.displayedContent.length).toBeGreaterThan('已显示'.length)
    expect(result.displayedContent.length).toBeLessThan('已显示剩余内容需要渐进排空'.length)
    expect(result.queuedChars.length).toBeGreaterThan(0)
    expect(result.isComplete).toBe(false)
  })

  test('does not flush the remaining queue immediately while the animation loop is still running', () => {
    const result = syncCompletedSmoothStreamState({
      displayedContent: '已显示',
      queuedChars: Array.from('剩余内容'),
      targetContent: '已显示剩余内容',
      hasActiveAnimation: true,
    })

    expect(result.displayedContent).toBe('已显示')
    expect(result.queuedChars).toEqual(Array.from('剩余内容'))
  })

  test('resets stale content when a new response starts from an empty transient state', () => {
    const result = deriveSmoothStreamContentChange({
      previousContent: '上一轮回复',
      nextContent: '',
      queuedChars: Array.from('待输出'),
    })

    expect(result.mode).toBe('reset')
    expect(result.displayedContent).toBe('')
    expect(result.queuedChars).toEqual([])
  })
})
