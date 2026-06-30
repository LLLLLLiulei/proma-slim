import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic } from './static-handler'

describe('serveStatic', () => {
  test('does not use Bun.file for production static file responses', () => {
    const source = readFileSync(fileURLToPath(new URL('./static-handler.ts', import.meta.url)), 'utf-8')

    expect(source).not.toContain('Bun.file')
  })

  test('serves production static files with a content type', async () => {
    const distDir = mkdtempSync(join(tmpdir(), 'proma-static-handler-'))

    try {
      writeFileSync(join(distDir, 'site.css'), 'body { color: red; }', 'utf-8')

      const response = await serveStatic(new Request('http://localhost/site.css'), {
        distDir,
        isDev: false,
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/css')
      expect(await response.text()).toBe('body { color: red; }')
    } finally {
      rmSync(distDir, { recursive: true, force: true })
    }
  })
})
