import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

function readComposeServiceBlock(compose: string, serviceName: string): string {
  const match = compose.match(new RegExp(`\\n  ${serviceName}:\\n[\\s\\S]*?(?=\\n  \\w|\\n?$)`))
  return match?.[0] ?? ''
}

describe('page-builder docker assets', () => {
  test('compose defines a default internal playwright sidecar and docker runtime defaults', () => {
    const compose = readRepoFile('../../../../../build/docker-compose.yml')

    expect(compose).toContain('\n  playwright:\n')
    expect(compose).toContain('image: mcr.microsoft.com/playwright:v1.57.0-jammy')
    expect(compose).toContain('AI_PAGE_BUILDER_RUNTIME_ENV: docker')
    expect(compose).toContain('AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL: ${AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL:-http://playwright:8931/mcp}')
    expect(compose).toContain('AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: ${AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN:-http://server:8888}')
    expect(compose).toContain("PLAYWRIGHT_EXECUTABLE_PATH=\"$(find /ms-playwright/chromium-* -path '*chrome-linux/chrome' | head -1)\"")
    expect(compose).toContain('if [ -z "$$PLAYWRIGHT_EXECUTABLE_PATH" ]; then')
    expect(compose).toContain('--executable-path "$$PLAYWRIGHT_EXECUTABLE_PATH"')
    expect(compose).not.toContain('\n    profiles:\n      - playwright\n')
    expect(compose).toMatch(/  playwright:\n(?: {4}.*\n)+?    volumes:\n      - type: bind\n        source: \$\{HOME:\?Set HOME in your shell\}\/\.ai-page-builder\n        target: \/home\/bun\/\.ai-page-builder\n/s)
    expect(compose).toContain('\n    expose:\n      - "8931"\n')
    expect(compose).toContain('\n    ports:\n      - "${PAGE_BUILDER_PORT:-3333}:3333"\n')
    expect(compose).not.toContain('\n    depends_on:\n      - playwright\n')
  })

  test('env example documents default playwright runtime overrides', () => {
    const envExample = readRepoFile('../../../../../build/.env.example')

    expect(envExample).toContain('AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL=')
    expect(envExample).toContain('AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN=')
    expect(envExample).toContain('Playwright sidecar is enabled by default')
  })

  test('docker assets expose page-builder public base path as runtime configuration', () => {
    const envExample = readRepoFile('../../../../../build/.env.example')
    const dockerfile = readRepoFile('../../../../../build/Dockerfile.page-builder-web')
    const compose = readRepoFile('../../../../../build/docker-compose.yml')
    const serverBlock = readComposeServiceBlock(compose, 'server')
    const webBlock = readComposeServiceBlock(compose, 'web')

    expect(envExample).toContain('AI_PAGE_BUILDER_BASE_PATH=')
    expect(envExample).toContain('public browser-facing base path')
    expect(envExample).toContain('Nginx or CMS gateway should strip')

    expect(dockerfile).not.toContain('ARG AI_PAGE_BUILDER_BASE_PATH=')
    expect(dockerfile).not.toContain('AI_PAGE_BUILDER_BASE_PATH="$AI_PAGE_BUILDER_BASE_PATH" bun run --filter')
    expect(dockerfile).toContain("RUN bun run --filter='@ai-page-builder/page-builder' build")
    expect(dockerfile).toContain('COPY --from=deps /app/node_modules ./node_modules')
    expect(dockerfile).toContain('COPY --from=build /app/packages/shared ./packages/shared')

    expect(compose).toContain('AI_PAGE_BUILDER_BASE_PATH: ${AI_PAGE_BUILDER_BASE_PATH:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_BASE_PATH: ${AI_PAGE_BUILDER_BASE_PATH:-}')
    expect(webBlock).toContain('AI_PAGE_BUILDER_BASE_PATH: ${AI_PAGE_BUILDER_BASE_PATH:-}')
    expect(webBlock).not.toContain('args:')
    expect(compose).not.toContain('/pagebuilder/api')
  })
})
