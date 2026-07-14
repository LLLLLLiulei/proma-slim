import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHttpApp } from '../app'

const ORIGINAL_ENV = { ...process.env }
const tempDirs: string[] = []
const AI_PROVIDERS_CONFIG_FILE_ENV = 'AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE'

function createApp() {
  return createHttpApp({
    distDir: process.cwd(),
    isDev: true,
  })
}

function writeModelConfig(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-status-models-'))
  tempDirs.push(dir)
  const filePath = join(dir, 'models.json')
  writeFileSync(filePath, JSON.stringify(config), 'utf8')
  return filePath
}

function unsetAgentCredentials(): void {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_AUTH_TOKEN
  delete process.env.AI_PAGE_BUILDER_ANTHROPIC_API_KEY
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('GET /api/status model provider compatibility', () => {
  test('treats usable model provider JSON as configured without global Anthropic credentials', async () => {
    unsetAgentCredentials()
    process.env[AI_PROVIDERS_CONFIG_FILE_ENV] = writeModelConfig({
      providers: [
        {
          id: 'zhipu',
          providerType: 'zhipu',
          label: '智谱',
          runtime: 'anthropic-compatible',
          baseUrl: 'https://open.bigmodel.cn/api/anthropic',
          apiKey: 'sk-zhipu-secret',
          models: [
            { id: 'glm', label: 'GLM', model: 'glm-5.2[1m]' },
          ],
        },
      ],
    })

    const response = await createApp().fetch(new Request('http://localhost/api/status'))

    expect(response.status).toBe(200)
    const payload = await response.json() as { apiKeyConfigured: boolean }
    expect(payload.apiKeyConfigured).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('sk-zhipu-secret')
    expect(JSON.stringify(payload)).not.toContain('open.bigmodel.cn')
  })

  test('reports credentials unconfigured when neither env credentials nor usable providers exist', async () => {
    unsetAgentCredentials()
    process.env[AI_PROVIDERS_CONFIG_FILE_ENV] = writeModelConfig({
      providers: [
        {
          id: 'missing_secret',
          providerType: 'deepseek',
          label: '缺少密钥',
          runtime: 'anthropic-compatible',
          baseUrl: 'https://api.deepseek.com/anthropic',
          models: [
            { id: 'chat', label: 'DeepSeek Chat', model: 'deepseek-chat' },
          ],
        },
      ],
    })

    const response = await createApp().fetch(new Request('http://localhost/api/status'))

    expect(response.status).toBe(200)
    const payload = await response.json() as { apiKeyConfigured: boolean; ok: boolean }
    expect(payload.apiKeyConfigured).toBe(false)
    expect(payload.ok).toBe(false)
    expect(JSON.stringify(payload)).not.toContain('api.deepseek.com')
  })
})
