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
    expect(envExample).toContain('AI_PAGE_BUILDER_PUBLIC_ORIGIN=')
    expect(envExample).toContain('AI_PAGE_BUILDER_HANDOFF_TTL_MS=')
    expect(envExample).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS=')
    expect(envExample).toContain('AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS=0')
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
    expect(envExample).toContain('AI_PAGE_BUILDER_PUBLIC_ORIGIN=')
    expect(envExample).toContain('AI_PAGE_BUILDER_HANDOFF_TTL_MS=')
    expect(envExample).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS=')

    expect(dockerfile).not.toContain('ARG AI_PAGE_BUILDER_BASE_PATH=')
    expect(dockerfile).not.toContain('AI_PAGE_BUILDER_BASE_PATH="$AI_PAGE_BUILDER_BASE_PATH" bun run --filter')
    expect(dockerfile).toContain("RUN bun run --filter='@ai-page-builder/page-builder' build")
    expect(dockerfile).toContain('COPY --from=deps /app/node_modules ./node_modules')
    expect(dockerfile).toContain('COPY --from=build /app/packages/shared ./packages/shared')

    expect(compose).toContain('AI_PAGE_BUILDER_BASE_PATH: ${AI_PAGE_BUILDER_BASE_PATH:-}')
    expect(compose).toContain('AI_PAGE_BUILDER_PUBLIC_ORIGIN: ${AI_PAGE_BUILDER_PUBLIC_ORIGIN:-}')
    expect(compose).toContain('AI_PAGE_BUILDER_HANDOFF_TTL_MS: ${AI_PAGE_BUILDER_HANDOFF_TTL_MS:-}')
    expect(compose).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS: ${AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS:-}')
    expect(compose).toContain('AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS: ${AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS:-0}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_BASE_PATH: ${AI_PAGE_BUILDER_BASE_PATH:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_PUBLIC_ORIGIN: ${AI_PAGE_BUILDER_PUBLIC_ORIGIN:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_HANDOFF_TTL_MS: ${AI_PAGE_BUILDER_HANDOFF_TTL_MS:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS: ${AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS: ${AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS:-0}')
    expect(webBlock).toContain('AI_PAGE_BUILDER_BASE_PATH: ${AI_PAGE_BUILDER_BASE_PATH:-}')
    expect(webBlock).not.toContain('args:')
    expect(compose).not.toContain('/pagebuilder/api')
  })

  test('cms verification compose keeps mock and nginx out of the default stack', () => {
    const defaultCompose = readRepoFile('../../../../../build/docker-compose.yml')
    const verifyCompose = readRepoFile('../../../../../build/docker-compose.cms-verify.yml')
    const nginxConfig = readRepoFile('../../../../../build/nginx/cms-verify.conf')
    const cmsMock = readRepoFile('../../../../../build/cms-mock/server.ts')
    const smokeTest = readRepoFile('../../../../../build/cms-verify/smoke-test.ts')

    expect(defaultCompose).not.toContain('cms-mock:')
    expect(defaultCompose).not.toContain('cms-verify-nginx')
    expect(verifyCompose).toContain('name: ai-page-builder-cms-verify')
    expect(verifyCompose).toContain('container_name: cms-verify-server')
    expect(verifyCompose).toContain('container_name: cms-verify-web')
    expect(verifyCompose).toContain('container_name: cms-verify-playwright')
    expect(verifyCompose).toContain('container_name: cms-verify-cms-mock')
    expect(verifyCompose).toContain('container_name: cms-verify-nginx')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_INTEGRATION_MODE: cms')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_CMS_BASE_URL: http://nginx:8080/manager')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_BASE_PATH: /pagebuilder')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS: ${AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS:-30000}')
    expect(verifyCompose).toContain('source: ./.cms-verify-data')
    expect(verifyCompose).toContain('source: ./cms-mock')
    expect(verifyCompose).toContain('source: ./nginx/cms-verify.conf')

    expect(nginxConfig).toContain('location /pagebuilder/')
    expect(nginxConfig).toContain('proxy_pass http://web:3333;')
    expect(nginxConfig).toContain('proxy_set_header Authorization $http_authorization;')
    expect(nginxConfig).toContain('proxy_set_header X-CMS-Cookie $http_x_cms_cookie;')
    expect(nginxConfig).toContain('proxy_set_header X-Forwarded-Proto $scheme;')
    expect(nginxConfig).toContain('proxy_set_header X-Forwarded-Host $http_host;')
    expect(nginxConfig).toContain('location /manager/')
    expect(cmsMock).toContain("url.pathname === '/manager/ui/login'")
    expect(cmsMock).toContain("url.pathname === '/cms-mock/'")
    expect(smokeTest).toContain("url('/api/integrations/cms/projects')")
    expect(smokeTest).toContain('workspace-scoped CMS asset proxy')
    expect(smokeTest).not.toContain('/api/page-builder/cms/assets?url=')
  })
})
