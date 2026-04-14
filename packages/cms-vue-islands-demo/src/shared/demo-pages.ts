import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { demoPagesDir } from './paths'

export function listDemoPages(): string[] {
  return readdirSync(demoPagesDir)
    .filter((entry) => entry.endsWith('.html'))
    .sort((left, right) => left.localeCompare(right))
}

export function readDemoPage(pageName: string): string {
  return readFileSync(join(demoPagesDir, pageName), 'utf-8')
}
