import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  pruneTurnSidecarDirectories,
  writeTurnDiagnosticSidecar,
} from './diagnostic-sidecar-writer'

describe('turn diagnostic sidecar writer', () => {
  let rootDir: string
  let turnsDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'proma-diagnostic-sidecars-'))
    turnsDir = join(rootDir, 'turns')
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('writes a single part file for small payloads', () => {
    const result = writeTurnDiagnosticSidecar({
      turnsDir,
      turnId: 'turn-1',
      baseName: 'final-prompt',
      extension: '.txt',
      content: 'hello world',
      maxFileSizeBytes: 64,
    })

    expect(result.relativePaths).toEqual([
      join('turns', 'turn-1', 'final-prompt.part-001.txt'),
    ])

    const absolutePath = join(rootDir, result.relativePaths[0]!)
    expect(existsSync(absolutePath)).toBe(true)
    expect(readFileSync(absolutePath, 'utf-8')).toBe('hello world')
  })

  test('splits large payloads into ordered parts without truncating content', () => {
    const content = 'abcdefghijklmnopqrstuvwxyz'
    const result = writeTurnDiagnosticSidecar({
      turnsDir,
      turnId: 'turn-2',
      baseName: 'stderr',
      extension: '.log',
      content,
      maxFileSizeBytes: 10,
    })

    expect(result.relativePaths).toEqual([
      join('turns', 'turn-2', 'stderr.part-001.log'),
      join('turns', 'turn-2', 'stderr.part-002.log'),
      join('turns', 'turn-2', 'stderr.part-003.log'),
    ])

    const restored = result.relativePaths
      .map((relativePath) => readFileSync(join(rootDir, relativePath), 'utf-8'))
      .join('')
    expect(restored).toBe(content)
  })

  test('prunes the oldest turn sidecar directories while keeping protected turns', () => {
    writeTurnDiagnosticSidecar({
      turnsDir,
      turnId: 'turn-1',
      baseName: 'final-prompt',
      extension: '.txt',
      content: 'old turn',
      maxFileSizeBytes: 64,
    })
    writeTurnDiagnosticSidecar({
      turnsDir,
      turnId: 'turn-2',
      baseName: 'final-prompt',
      extension: '.txt',
      content: 'new turn',
      maxFileSizeBytes: 64,
    })

    const oldDir = join(turnsDir, 'turn-1')
    const now = new Date()
    utimesSync(oldDir, new Date(now.getTime() - 60_000), new Date(now.getTime() - 60_000))

    pruneTurnSidecarDirectories({
      turnsDir,
      maxTurnDirectories: 1,
      protectedTurnIds: new Set(['turn-2']),
    })

    expect(readdirSync(turnsDir)).toEqual(['turn-2'])
  })
})
