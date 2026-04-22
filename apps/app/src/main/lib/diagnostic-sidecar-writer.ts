import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

export interface WriteTurnDiagnosticSidecarInput {
  turnsDir: string
  turnId: string
  baseName: string
  extension: string
  content: string
  maxFileSizeBytes: number
}

export interface WriteTurnDiagnosticSidecarResult {
  absolutePaths: string[]
  relativePaths: string[]
  turnDir: string
}

export interface PruneTurnSidecarDirectoriesInput {
  turnsDir: string
  maxTurnDirectories: number
  protectedTurnIds?: ReadonlySet<string>
  maxAgeMs?: number
}

function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

function splitTextByBytes(content: string, maxFileSizeBytes: number): string[] {
  if (maxFileSizeBytes <= 0) {
    throw new Error('maxFileSizeBytes 必须大于 0')
  }

  if (!content) {
    return ['']
  }

  const parts: string[] = []
  let current = ''
  let currentBytes = 0

  for (const char of content) {
    const charBytes = Buffer.byteLength(char)
    if (current && currentBytes + charBytes > maxFileSizeBytes) {
      parts.push(current)
      current = char
      currentBytes = charBytes
      continue
    }

    current += char
    currentBytes += charBytes
  }

  if (current || parts.length === 0) {
    parts.push(current)
  }

  return parts
}

function getRootLogsDir(turnsDir: string): string {
  return dirname(turnsDir)
}

export function writeTurnDiagnosticSidecar(
  input: WriteTurnDiagnosticSidecarInput,
): WriteTurnDiagnosticSidecarResult {
  const turnDir = ensureDir(join(input.turnsDir, input.turnId))
  const rootLogsDir = getRootLogsDir(input.turnsDir)
  const parts = splitTextByBytes(input.content, input.maxFileSizeBytes)
  const absolutePaths: string[] = []
  const relativePaths: string[] = []

  parts.forEach((part, index) => {
    const fileName = `${input.baseName}.part-${String(index + 1).padStart(3, '0')}${input.extension}`
    const absolutePath = join(turnDir, fileName)
    absolutePaths.push(absolutePath)
    relativePaths.push(relative(rootLogsDir, absolutePath))
    writeFileSync(absolutePath, part, 'utf-8')
  })

  return {
    absolutePaths,
    relativePaths,
    turnDir,
  }
}

export function pruneTurnSidecarDirectories(input: PruneTurnSidecarDirectoriesInput): void {
  if (!existsSync(input.turnsDir)) {
    return
  }

  const protectedTurnIds = input.protectedTurnIds ?? new Set<string>()
  const entries = readdirSync(input.turnsDir)
    .map((entry) => {
      const absolutePath = join(input.turnsDir, entry)
      const stats = statSync(absolutePath)
      return {
        entry,
        absolutePath,
        isDirectory: stats.isDirectory(),
        mtimeMs: stats.mtimeMs,
      }
    })
    .filter((entry) => entry.isDirectory)
    .sort((left, right) => left.mtimeMs - right.mtimeMs)

  if (input.maxAgeMs && input.maxAgeMs > 0) {
    const cutoff = Date.now() - input.maxAgeMs
    for (const entry of entries) {
      if (protectedTurnIds.has(entry.entry)) continue
      if (entry.mtimeMs >= cutoff) continue
      rmSync(entry.absolutePath, { recursive: true, force: true })
    }
  }

  if (input.maxTurnDirectories <= 0) {
    return
  }

  const remainingEntries = readdirSync(input.turnsDir)
    .map((entry) => {
      const absolutePath = join(input.turnsDir, entry)
      const stats = statSync(absolutePath)
      return {
        entry,
        absolutePath,
        isDirectory: stats.isDirectory(),
        mtimeMs: stats.mtimeMs,
      }
    })
    .filter((entry) => entry.isDirectory)
    .sort((left, right) => left.mtimeMs - right.mtimeMs)

  let removable = remainingEntries.filter((entry) => !protectedTurnIds.has(entry.entry))
  let totalDirectories = remainingEntries.length

  while (totalDirectories > input.maxTurnDirectories && removable.length > 0) {
    const oldest = removable.shift()
    if (!oldest) break
    rmSync(oldest.absolutePath, { recursive: true, force: true })
    totalDirectories -= 1
  }
}
