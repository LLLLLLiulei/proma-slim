import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readHttpServerSource(): string {
  return readFileSync(fileURLToPath(new URL('./http-server.ts', import.meta.url)), 'utf-8')
}

describe('createHttpServer runtime boundary', () => {
  test('uses the Node/Hono server adapter instead of Bun.serve', () => {
    const source = readHttpServerSource()

    expect(source).toContain("@hono/node-server")
    expect(source).not.toContain('Bun.serve')
  })
})
