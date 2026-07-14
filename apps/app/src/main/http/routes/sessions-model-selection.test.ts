import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HttpError } from '../errors'
import { resolveSendModelSelection } from './sessions'

const ORIGINAL_ENV = { ...process.env }
const tempDirs: string[] = []
const AI_PROVIDERS_CONFIG_FILE_ENV = 'AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE'

function writeModelConfig(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-send-models-'))
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

describe('resolveSendModelSelection', () => {
  test('resolves a configured model option into runtime selection', () => {
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

    expect(resolveSendModelSelection({ modelOptionId: 'zhipu.glm' })).toEqual({
      modelOptionId: 'zhipu.glm',
      providerId: 'zhipu',
      providerType: 'zhipu',
      model: 'glm-5.2[1m]',
      sdkEnv: {
        ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
        ANTHROPIC_API_KEY: 'sk-zhipu-secret',
      },
    })
  })

  test('rejects unknown model option before SDK query', () => {
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

    expect(() => resolveSendModelSelection({ modelOptionId: 'unknown.model' })).toThrow(HttpError)
    expect(() => resolveSendModelSelection({ modelOptionId: 'unknown.model' })).toThrow('模型选项不可用')
  })

  test('rejects requested model option when no provider is usable', () => {
    process.env[AI_PROVIDERS_CONFIG_FILE_ENV] = writeModelConfig({
      providers: [
        {
          id: 'broken',
          providerType: 'deepseek',
          label: '配置不完整',
          runtime: 'anthropic-compatible',
          baseUrl: 'https://api.deepseek.com/anthropic',
          models: [
            { id: 'chat', label: 'DeepSeek Chat', model: 'deepseek-chat' },
          ],
        },
      ],
    })

    expect(() => resolveSendModelSelection({ modelOptionId: 'broken.chat' })).toThrow(HttpError)
    expect(() => resolveSendModelSelection({ modelOptionId: 'broken.chat' })).toThrow('模型服务未配置完整')
  })
})
