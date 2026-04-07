import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readRelativeText(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

describe('page-builder renderer index', () => {
  test('uses a neutral browser title', () => {
    const html = readRelativeText('./index.html')

    expect(html).toContain('<title>AI 页面构建工作台</title>')
    expect(html).not.toContain('<title>Proma Page Builder</title>')
  })
})
