import { describe, expect, test } from 'bun:test'
import { registerProcessErrorHandlers } from './process-error-handlers'

class FakeProcess {
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  on(event: string, listener: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(event) ?? []
    listeners.push(listener)
    this.listeners.set(event, listeners)
    return this
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }
  }
}

describe('process error handlers', () => {
  test('logs unhandled promise rejections without stopping the process', () => {
    const fakeProcess = new FakeProcess()
    const errors: unknown[][] = []
    const exits: number[] = []
    let stopCalls = 0

    registerProcessErrorHandlers({
      process: fakeProcess,
      logger: {
        error: (...args: unknown[]) => {
          errors.push(args)
        },
      },
      stopAllAgents: () => {
        stopCalls += 1
      },
      exit: (code) => {
        exits.push(code)
      },
    })

    fakeProcess.emit('unhandledRejection', new Error('background task failed'))

    expect(stopCalls).toBe(0)
    expect(exits).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]?.[0]).toContain('未处理 Promise rejection')
    expect(errors[0]?.[1]).toBeInstanceOf(Error)
  })

  test('stops agents and exits on uncaught exceptions', () => {
    const fakeProcess = new FakeProcess()
    const errors: unknown[][] = []
    const exits: number[] = []
    let stopCalls = 0

    registerProcessErrorHandlers({
      process: fakeProcess,
      logger: {
        error: (...args: unknown[]) => {
          errors.push(args)
        },
      },
      stopAllAgents: () => {
        stopCalls += 1
      },
      exit: (code) => {
        exits.push(code)
      },
    })

    fakeProcess.emit('uncaughtException', new Error('fatal task failed'))

    expect(stopCalls).toBe(1)
    expect(exits).toEqual([1])
    expect(errors).toHaveLength(1)
    expect(errors[0]?.[0]).toContain('未处理异常')
    expect(errors[0]?.[1]).toBeInstanceOf(Error)
  })

  test('does not stop agents repeatedly for cascading uncaught exceptions', () => {
    const fakeProcess = new FakeProcess()
    const exits: number[] = []
    let stopCalls = 0

    registerProcessErrorHandlers({
      process: fakeProcess,
      logger: {
        error: () => {},
      },
      stopAllAgents: () => {
        stopCalls += 1
      },
      exit: (code) => {
        exits.push(code)
      },
    })

    fakeProcess.emit('uncaughtException', new Error('first fatal error'))
    fakeProcess.emit('uncaughtException', new Error('second fatal error'))

    expect(stopCalls).toBe(1)
    expect(exits).toEqual([1, 1])
  })
})
