import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHttpApp } from '../app'

const ORIGINAL_ENV = { ...process.env }
const tempDirs: string[] = []

function createApp() {
  return createHttpApp({
    distDir: process.cwd(),
    isDev: true,
  })
}

function writeModelConfig(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-model-options-'))
  tempDirs.push(dir)
  const filePath = join(dir, 'models.json')
  writeFileSync(filePath, JSON.stringify(config), 'utf8')
  return filePath
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

describe('GET /api/agent/model-options', () => {
  test('returns safe grouped model options without provider secrets or baseUrl', async () => {
    process.env.AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE = writeModelConfig({
      defaultModelOptionId: 'zhipu.glm',
      providers: [
        {
          id: 'zhipu',
          providerType: 'zhipu',
          label: '智谱',
          runtime: 'anthropic-compatible',
          baseUrl: 'https://open.bigmodel.cn/api/anthropic',
          apiKey: 'sk-zhipu-secret',
          models: [
            { id: 'glm', label: 'GLM', model: 'glm-5.2[1m]', contextWindow: 1000000 },
          ],
        },
      ],
    })

    const response = await createApp().fetch(new Request('http://localhost/api/agent/model-options'))

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({
      defaultModelOptionId: 'zhipu.glm',
      providers: [
        {
          providerId: 'zhipu',
          providerType: 'zhipu',
          providerLabel: '智谱',
          models: [
            {
              modelOptionId: 'zhipu.glm',
              providerId: 'zhipu',
              providerType: 'zhipu',
              providerLabel: '智谱',
              modelId: 'glm',
              label: 'GLM',
              model: 'glm-5.2[1m]',
              contextWindow: 1000000,
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(payload)).not.toContain('sk-zhipu-secret')
    expect(JSON.stringify(payload)).not.toContain('open.bigmodel.cn')
  })

  test('returns service default option when model config file is not configured', async () => {
    delete process.env.AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE
    process.env.ANTHROPIC_AUTH_TOKEN = 'default-token'
    process.env.ANTHROPIC_MODEL = 'deepseek-v4-pro[1m]'

    const response = await createApp().fetch(new Request('http://localhost/api/agent/model-options'))

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      defaultModelOptionId: string
      providers: Array<{ models: Array<{ modelOptionId: string; model: string }> }>
    }
    expect(payload.defaultModelOptionId).toBe('service-default.default')
    expect(payload.providers[0]?.models[0]).toMatchObject({
      modelOptionId: 'service-default.default',
      model: 'deepseek-v4-pro[1m]',
    })
    expect(JSON.stringify(payload)).not.toContain('default-token')
  })

  test('does not return unavailable providers', async () => {
    process.env.AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE = writeModelConfig({
      providers: [
        {
          id: 'missing_secret',
          providerType: 'zhipu',
          label: '缺少密钥',
          runtime: 'anthropic-compatible',
          baseUrl: 'https://open.bigmodel.cn/api/anthropic',
          models: [
            { id: 'glm', label: 'GLM', model: 'glm-5.2[1m]' },
          ],
        },
        {
          id: 'ready',
          providerType: 'deepseek',
          label: '可用模型',
          runtime: 'anthropic-compatible',
          baseUrl: 'https://api.deepseek.com/anthropic',
          authToken: 'ready-token',
          models: [
            { id: 'chat', label: 'DeepSeek Chat', model: 'deepseek-chat' },
          ],
        },
      ],
    })

    const response = await createApp().fetch(new Request('http://localhost/api/agent/model-options'))

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      defaultModelOptionId: string
      providers: Array<{ providerId: string; models: Array<{ modelOptionId: string }> }>
    }
    expect(payload.defaultModelOptionId).toBe('ready.chat')
    expect(payload.providers.map((provider) => provider.providerId)).toEqual(['ready'])
    expect(payload.providers[0]?.models.map((model) => model.modelOptionId)).toEqual(['ready.chat'])
    expect(JSON.stringify(payload)).not.toContain('missing_secret')
    expect(JSON.stringify(payload)).not.toContain('ready-token')
    expect(JSON.stringify(payload)).not.toContain('api.deepseek.com')
  })
})
