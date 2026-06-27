import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const IMAGE_SEARCH_ENV_KEYS = new Set([
  'IMAGE_SEARCH_PROVIDERS',
  'PEXELS_API_KEY',
  'PIXABAY_API_KEY',
  'UNSPLASH_ACCESS_KEY',
])
const AGENT_SDK_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'API_TIMEOUT_MS',
] as const
const PREFIXED_IMAGE_SEARCH_ENV_PATTERN = /\b[A-Z0-9]+_(?:IMAGE_SEARCH_PROVIDERS|PEXELS_API_KEY|PIXABAY_API_KEY|UNSPLASH_ACCESS_KEY)\b/g

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

function readComposeServiceBlock(compose: string, serviceName: string): string {
  const match = compose.match(new RegExp(`\\n  ${serviceName}:\\n[\\s\\S]*?(?=\\n  \\w|\\n?$)`))
  return match?.[0] ?? ''
}

function expectOnlyImageSearchEnvKeys(content: string) {
  const invalid = Array.from(content.matchAll(PREFIXED_IMAGE_SEARCH_ENV_PATTERN), (match) => match[0])
    .filter((key) => !IMAGE_SEARCH_ENV_KEYS.has(key))
  expect(invalid).toEqual([])
}

function expectAgentSdkEnvWhitelist(serverBlock: string) {
  for (const key of AGENT_SDK_ENV_KEYS) {
    expect(serverBlock).toContain(`${key}: \${${key}:-}`)
  }
  expect(serverBlock).toContain('AI_PAGE_BUILDER_ANTHROPIC_API_KEY: ${AI_PAGE_BUILDER_ANTHROPIC_API_KEY:-}')
  expect(serverBlock).toContain('AI_PAGE_BUILDER_ANTHROPIC_BASE_URL: ${AI_PAGE_BUILDER_ANTHROPIC_BASE_URL:-}')
  expect(serverBlock).not.toContain('AI_PAGE_BUILDER_ANTHROPIC_API_KEY:?')
  expect(serverBlock).not.toContain('\n    env_file:')
}

function expectStartScriptClearsHostAgentSdkEnv(script: string) {
  for (const key of AGENT_SDK_ENV_KEYS) {
    expect(script).toContain(`-u ${key}`)
  }
  expect(script).toContain('-u AI_PAGE_BUILDER_ANTHROPIC_API_KEY')
  expect(script).toContain('-u AI_PAGE_BUILDER_ANTHROPIC_BASE_URL')
}

describe('page-builder docker assets', () => {
  test('compose defines a default internal playwright sidecar and docker runtime defaults', () => {
    const compose = readRepoFile('../../../../../build/docker-compose.yml')
    const serverBlock = readComposeServiceBlock(compose, 'server')

    expect(compose).toContain('\n  playwright:\n')
    expect(compose).toContain('image: mcr.microsoft.com/playwright:v1.57.0-jammy')
    expect(compose).toContain('AI_PAGE_BUILDER_RUNTIME_ENV: docker')
    expectAgentSdkEnvWhitelist(serverBlock)
    expect(compose).toContain('AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL: ${AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL:-http://playwright:8931/mcp}')
    expect(compose).toContain('AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: ${AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN:-http://server:8888}')
    expect(compose).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB:-100}')
    expect(compose).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB:-500}')
    expectOnlyImageSearchEnvKeys(compose)
    expect(compose).toContain('IMAGE_SEARCH_PROVIDERS: ${IMAGE_SEARCH_PROVIDERS:-}')
    expect(compose).toContain('PEXELS_API_KEY: ${PEXELS_API_KEY:-}')
    expect(compose).toContain('PIXABAY_API_KEY: ${PIXABAY_API_KEY:-}')
    expect(compose).toContain('UNSPLASH_ACCESS_KEY: ${UNSPLASH_ACCESS_KEY:-}')
    expect(compose).toContain("PLAYWRIGHT_EXECUTABLE_PATH=\"$(find /ms-playwright/chromium-* \\( -path '*chrome-linux/chrome' -o -path '*chrome-linux64/chrome' \\) | head -1)\"")
    expect(compose).toContain('if [ -z "$$PLAYWRIGHT_EXECUTABLE_PATH" ]; then')
    expect(compose).toContain('--executable-path "$$PLAYWRIGHT_EXECUTABLE_PATH"')
    expect(compose).not.toContain('\n    profiles:\n      - playwright\n')
    expect(compose).toMatch(/  playwright:\n(?: {4}.*\n)+?    volumes:\n      - type: bind\n        source: \$\{AI_PAGE_BUILDER_HOST_DATA_DIR:-\$\{HOME:\?Set HOME in your shell\}\/\.ai-page-builder\}\n        target: \/home\/bun\/\.ai-page-builder\n/s)
    expect(compose).toContain('\n    expose:\n      - "8931"\n')
    expect(compose).toContain('\n    ports:\n      - "${PAGE_BUILDER_PORT:-3333}:3333"\n')
    expect(compose).not.toContain('\n    depends_on:\n      - playwright\n')
  })

  test('start script clears host Agent SDK env before compose reads the env file', () => {
    const script = readRepoFile('../../../../../build/start-page-builder.sh')

    expectStartScriptClearsHostAgentSdkEnv(script)
    expect(script).toContain('run_docker_compose')
    expect(script).toContain('--env-file "${ENV_FILE}"')
  })

  test('env example documents default playwright runtime overrides', () => {
    const envExample = readRepoFile('../../../../../build/.env.standalone.example')

    expect(envExample).toContain('AI_PAGE_BUILDER_ANTHROPIC_API_KEY=')
    expect(envExample).toContain('AI_PAGE_BUILDER_ANTHROPIC_BASE_URL=')
    expect(envExample).toMatch(/^ANTHROPIC_AUTH_TOKEN=/m)
    expect(envExample).toMatch(/^ANTHROPIC_BASE_URL=/m)
    expect(envExample).toMatch(/^ANTHROPIC_MODEL=/m)
    expect(envExample).toMatch(/^CLAUDE_CODE_AUTO_COMPACT_WINDOW=/m)
    expect(envExample).toMatch(/^API_TIMEOUT_MS=/m)
    expect(envExample).toContain('DeepSeek')
    expect(envExample).toContain('AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL=')
    expect(envExample).toContain('AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN=')
    expect(envExample).toContain('Playwright MCP sidecar')
    expect(envExample).toContain('不要配置为浏览器 public origin')
    expect(envExample).toContain('AI_PAGE_BUILDER_PUBLIC_ORIGIN=')
    expect(envExample).toContain('AI_PAGE_BUILDER_HANDOFF_TTL_MS=')
    expect(envExample).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS=')
    expect(envExample).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS=')
    expect(envExample).toContain('AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS=0')
    expect(envExample).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB=100')
    expect(envExample).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB=500')
    expect(envExample).toContain('AI_PAGE_BUILDER_HOST_DATA_DIR=')
    expectOnlyImageSearchEnvKeys(envExample)
    expect(envExample).toContain('IMAGE_SEARCH_PROVIDERS=')
    expect(envExample).toContain('PEXELS_API_KEY=')
    expect(envExample).toContain('PIXABAY_API_KEY=')
    expect(envExample).toContain('UNSPLASH_ACCESS_KEY=')
  })

  test('docker assets explain CMS runtime store persistence inputs', () => {
    const cmsEnvExample = readRepoFile('../../../../../build/.env.cms.example')

    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS=')
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB=100')
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB=500')
    expect(cmsEnvExample).toContain('integrations/cms/runtime')
    expect(cmsEnvExample).toContain('单 server 实例')
    expect(cmsEnvExample).toContain('默认文件 runtime store 只支持单 server 实例语义')
    expectOnlyImageSearchEnvKeys(cmsEnvExample)
    expect(cmsEnvExample).toContain('IMAGE_SEARCH_PROVIDERS=')
    expect(cmsEnvExample).toContain('PEXELS_API_KEY=')
    expect(cmsEnvExample).toContain('PIXABAY_API_KEY=')
    expect(cmsEnvExample).toContain('UNSPLASH_ACCESS_KEY=')
  })

  test('docker assets expose page-builder public base path as runtime configuration', () => {
    const standaloneEnvExample = readRepoFile('../../../../../build/.env.standalone.example')
    const cmsEnvExample = readRepoFile('../../../../../build/.env.cms.example')
    const dockerfile = readRepoFile('../../../../../build/Dockerfile.page-builder-web')
    const compose = readRepoFile('../../../../../build/docker-compose.yml')
    const serverBlock = readComposeServiceBlock(compose, 'server')
    const webBlock = readComposeServiceBlock(compose, 'web')

    expect(standaloneEnvExample).toContain('AI_PAGE_BUILDER_BASE_PATH=')
    expect(standaloneEnvExample).toContain('AI_PAGE_BUILDER_HOST_DATA_DIR=')
    expect(standaloneEnvExample).toContain('子路径部署')
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_BASE_PATH=/pagebuilder')
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_ANTHROPIC_API_KEY=')
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_ANTHROPIC_BASE_URL=')
    expect(cmsEnvExample).toMatch(/^ANTHROPIC_AUTH_TOKEN=/m)
    expect(cmsEnvExample).toMatch(/^ANTHROPIC_BASE_URL=/m)
    expect(cmsEnvExample).toMatch(/^ANTHROPIC_MODEL=/m)
    expect(cmsEnvExample).toMatch(/^CLAUDE_CODE_EFFORT_LEVEL=/m)
    expect(cmsEnvExample).toMatch(/^API_TIMEOUT_MS=/m)
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_PUBLIC_ORIGIN=')
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_HANDOFF_TTL_MS=')
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS=')
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS=')
    expect(cmsEnvExample).toContain('文件 runtime store')
    expect(cmsEnvExample).toContain('AI_PAGE_BUILDER_HOST_DATA_DIR=')

    expect(dockerfile).not.toContain('ARG AI_PAGE_BUILDER_BASE_PATH=')
    expect(dockerfile).not.toContain('AI_PAGE_BUILDER_BASE_PATH="$AI_PAGE_BUILDER_BASE_PATH" bun run --filter')
    expect(dockerfile).toContain("RUN bun run --filter='@ai-page-builder/page-builder' build")
    expect(dockerfile).toContain('bun build apps/page-builder/src/server/prod-server.ts')
    expect(dockerfile).toContain('--outfile /app/apps/page-builder/src/server/prod-server.js')
    expect(dockerfile).not.toContain('COPY --from=deps /app/node_modules ./node_modules')
    expect(dockerfile).not.toContain('COPY --from=build /app/packages/shared ./packages/shared')
    expect(dockerfile).not.toContain('COPY --from=build /app/apps/page-builder/src/server/prod-server.ts')
    expect(dockerfile).toContain('COPY --from=build /app/apps/page-builder/src/server/prod-server.js ./apps/page-builder/src/server/prod-server.js')
    expect(dockerfile).toContain('exec bun apps/page-builder/src/server/prod-server.js')

    expect(compose).toContain('AI_PAGE_BUILDER_BASE_PATH: ${AI_PAGE_BUILDER_BASE_PATH:-}')
    expect(compose).toContain('AI_PAGE_BUILDER_PUBLIC_ORIGIN: ${AI_PAGE_BUILDER_PUBLIC_ORIGIN:-}')
    expect(compose).toContain('AI_PAGE_BUILDER_HANDOFF_TTL_MS: ${AI_PAGE_BUILDER_HANDOFF_TTL_MS:-}')
    expect(compose).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS: ${AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS:-}')
    expect(compose).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS: ${AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS:-}')
    expect(compose).toContain('AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS: ${AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS:-0}')
    expect(compose).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB:-100}')
    expect(compose).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB:-500}')
    expect(compose).toContain('source: ${AI_PAGE_BUILDER_HOST_DATA_DIR:-${HOME:?Set HOME in your shell}/.ai-page-builder}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_BASE_PATH: ${AI_PAGE_BUILDER_BASE_PATH:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_PUBLIC_ORIGIN: ${AI_PAGE_BUILDER_PUBLIC_ORIGIN:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_HANDOFF_TTL_MS: ${AI_PAGE_BUILDER_HANDOFF_TTL_MS:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS: ${AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS: ${AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS: ${AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS:-0}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB:-100}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB:-500}')
    expectAgentSdkEnvWhitelist(serverBlock)
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
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_ANTHROPIC_API_KEY: ${AI_PAGE_BUILDER_ANTHROPIC_API_KEY:-cms-verify-dummy-key}')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_ANTHROPIC_BASE_URL: ${AI_PAGE_BUILDER_ANTHROPIC_BASE_URL:-}')
    expect(verifyCompose).toContain('ANTHROPIC_API_KEY: ${AI_PAGE_BUILDER_ANTHROPIC_API_KEY:-cms-verify-dummy-key}')
    expect(verifyCompose).toContain('ANTHROPIC_BASE_URL: ${AI_PAGE_BUILDER_ANTHROPIC_BASE_URL:-}')
    expect(verifyCompose).not.toContain('ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY')
    expect(verifyCompose).not.toContain('ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_CMS_BASE_URL: http://nginx:8080/manager')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_BASE_PATH: /pagebuilder')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS: ${AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS:-3600000}')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS: ${AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS:-30000}')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB:-100}')
    expect(verifyCompose).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB:-500}')
    expectOnlyImageSearchEnvKeys(verifyCompose)
    expect(verifyCompose).toContain('IMAGE_SEARCH_PROVIDERS: ${IMAGE_SEARCH_PROVIDERS:-}')
    expect(verifyCompose).toContain('PEXELS_API_KEY: ${PEXELS_API_KEY:-}')
    expect(verifyCompose).toContain('PIXABAY_API_KEY: ${PIXABAY_API_KEY:-}')
    expect(verifyCompose).toContain('UNSPLASH_ACCESS_KEY: ${UNSPLASH_ACCESS_KEY:-}')
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

  test('release compose uses remote images without local builds', () => {
    const releaseCompose = readRepoFile('../../../../../build/docker-compose.release.yml')
    const serverBlock = readComposeServiceBlock(releaseCompose, 'server')
    const webBlock = readComposeServiceBlock(releaseCompose, 'web')
    const playwrightBlock = readComposeServiceBlock(releaseCompose, 'playwright')

    expect(releaseCompose).toContain('name: ai-page-builder')
    expect(releaseCompose).not.toContain('\n    build:\n')
    expect(releaseCompose).not.toContain('dockerfile:')
    expect(serverBlock).toContain('image: ccr.ccs.tencentyun.com/ai-page-builder/page-builder-server:${PAGE_BUILDER_IMAGE_TAG:-latest}')
    expect(webBlock).toContain('image: ccr.ccs.tencentyun.com/ai-page-builder/page-builder-web:${PAGE_BUILDER_IMAGE_TAG:-latest}')
    expect(playwrightBlock).toContain('image: ${AI_PAGE_BUILDER_PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.57.0-jammy}')
    expect(serverBlock).toContain('restart: unless-stopped')
    expect(webBlock).toContain('restart: unless-stopped')
    expect(playwrightBlock).toContain('restart: unless-stopped')
    expectAgentSdkEnvWhitelist(serverBlock)
    expect(serverBlock).toContain('AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS: ${AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS:-}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB:-100}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB: ${AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB:-500}')
    expect(serverBlock).toContain('AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL: ${AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL:-http://playwright:8931/mcp}')
    expectOnlyImageSearchEnvKeys(serverBlock)
    expect(serverBlock).toContain('IMAGE_SEARCH_PROVIDERS: ${IMAGE_SEARCH_PROVIDERS:-}')
    expect(serverBlock).toContain('PEXELS_API_KEY: ${PEXELS_API_KEY:-}')
    expect(serverBlock).toContain('PIXABAY_API_KEY: ${PIXABAY_API_KEY:-}')
    expect(serverBlock).toContain('UNSPLASH_ACCESS_KEY: ${UNSPLASH_ACCESS_KEY:-}')
    expect(serverBlock).toContain('source: ${AI_PAGE_BUILDER_HOST_DATA_DIR:-${HOME:?Set HOME in your shell}/.ai-page-builder}')
    expect(webBlock).toContain('AI_PAGE_BUILDER_SERVER_ORIGIN: http://server:8888')
    expect(webBlock).toContain('AI_PAGE_BUILDER_BASE_PATH: ${AI_PAGE_BUILDER_BASE_PATH:-}')
    expect(webBlock).toContain('${PAGE_BUILDER_PORT:-3333}:3333')
    expect(playwrightBlock).toContain('--host 0.0.0.0 --port 8931 --headless')
  })
})
