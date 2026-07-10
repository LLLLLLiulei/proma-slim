import { describe, expect, test } from 'bun:test'
import {
  resolveAgentModelProviderRegistry,
  SERVICE_DEFAULT_MODEL_OPTION_ID,
} from './agent-model-provider-config'

function createRegistry(input: {
  config: unknown
  env?: Record<string, string | undefined>
}) {
  return resolveAgentModelProviderRegistry({
    env: {
      AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE: '/models.json',
      ...input.env,
    },
    readFileText: (filePath) => {
      expect(filePath).toBe('/models.json')
      return JSON.stringify(input.config)
    },
  })
}

function createRegistryFromText(input: {
  configText: string
  env?: Record<string, string | undefined>
}) {
  return resolveAgentModelProviderRegistry({
    env: {
      AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE: '/models.jsonc',
      ...input.env,
    },
    readFileText: (filePath) => {
      expect(filePath).toBe('/models.jsonc')
      return input.configText
    },
  })
}

describe('resolveAgentModelProviderRegistry', () => {
  test('loads JSONC model config files with comments and trailing commas', () => {
    const registry = createRegistryFromText({
      configText: `{
        // 默认模型指向启用模型。
        "defaultModelOptionId": "qwen.flash",
        "providers": [
          {
            "id": "qwen",
            "providerType": "qwen",
            "label": "Qwen",
            "runtime": "anthropic-compatible",
            "baseUrl": "https://dashscope.aliyuncs.com/api/anthropic",
            "apiKey": "qwen-key",
            /* 旧长会话中暂时不稳定的模型可通过 enabled 禁用。 */
            "models": [
              {
                "id": "flash",
                "label": "qwen3.6-flash",
                "model": "qwen3.6-flash",
                "enabled": true,
              },
            ],
          },
        ],
      }`,
    })

    expect(registry.publicOptions.defaultModelOptionId).toBe('qwen.flash')
    expect(registry.publicOptions.providers[0]?.models[0]?.modelOptionId).toBe('qwen.flash')
    expect(registry.resolveModelOption('qwen.flash')?.sdkEnv.ANTHROPIC_BASE_URL).toBe('https://dashscope.aliyuncs.com/api/anthropic')
  })

  test('loads provider-owned models and builds safe public options with direct api key credentials', () => {
    const registry = createRegistry({
      config: {
        defaultModelOptionId: 'zhipu.glm-5-2-1m',
        providers: [
          {
            id: 'zhipu',
            providerType: 'zhipu',
            label: '智谱',
            runtime: 'anthropic-compatible',
            baseUrl: 'https://open.bigmodel.cn/api/anthropic',
            apiKey: 'sk-zhipu-secret',
            defaultOpusModel: 'glm-5.2[1m]',
            defaultSonnetModel: 'glm-5.2[1m]',
            defaultHaikuModel: 'glm-4.7',
            subagentModel: 'glm-4.7',
            models: [
              {
                id: 'glm-5-2-1m',
                label: 'GLM 5.2 1M',
                model: 'glm-5.2[1m]',
                contextWindow: 1000000,
              },
            ],
          },
        ],
      },
    })

    expect(registry.publicOptions).toEqual({
      selectorEnabled: true,
      defaultModelOptionId: 'zhipu.glm-5-2-1m',
      providers: [
        {
          providerId: 'zhipu',
          providerType: 'zhipu',
          providerLabel: '智谱',
          models: [
            {
              modelOptionId: 'zhipu.glm-5-2-1m',
              providerId: 'zhipu',
              providerType: 'zhipu',
              providerLabel: '智谱',
              modelId: 'glm-5-2-1m',
              label: 'GLM 5.2 1M',
              model: 'glm-5.2[1m]',
              contextWindow: 1000000,
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(registry.publicOptions)).not.toContain('sk-zhipu-secret')
    expect(JSON.stringify(registry.publicOptions)).not.toContain('open.bigmodel.cn')

    expect(registry.resolveModelOption('zhipu.glm-5-2-1m')).toEqual({
      modelOptionId: 'zhipu.glm-5-2-1m',
      providerId: 'zhipu',
      providerType: 'zhipu',
      model: 'glm-5.2[1m]',
      sdkEnv: {
        ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
        ANTHROPIC_API_KEY: 'sk-zhipu-secret',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.2[1m]',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.2[1m]',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.7',
        CLAUDE_CODE_SUBAGENT_MODEL: 'glm-4.7',
      },
    })
  })

  test('supports env-referenced auth token credentials', () => {
    const registry = createRegistry({
      env: {
        MINIMAX_TOKEN: 'minimax-token',
      },
      config: {
        providers: [
          {
            id: 'minimax',
            providerType: 'minimax',
            label: 'MiniMax',
            runtime: 'anthropic-compatible',
            baseUrl: 'https://api.minimaxi.com/anthropic',
            authTokenEnv: 'MINIMAX_TOKEN',
            models: [
              { id: 'm3', label: 'MiniMax M3', model: 'MiniMax-M3[1m]' },
            ],
          },
        ],
      },
    })

    expect(registry.resolveModelOption('minimax.m3')?.sdkEnv).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'minimax-token',
    })
  })

  test('prefers direct credentials over env references and does not require missing env vars', () => {
    const registry = createRegistry({
      config: {
        providers: [
          {
            id: 'deepseek',
            providerType: 'deepseek',
            label: 'DeepSeek',
            runtime: 'anthropic-compatible',
            baseUrl: 'https://api.deepseek.com/anthropic',
            apiKey: 'direct-key',
            apiKeyEnv: 'MISSING_DEEPSEEK_KEY',
            models: [
              { id: 'v4', label: 'DeepSeek V4', model: 'deepseek-v4-pro[1m]' },
            ],
          },
        ],
      },
    })

    expect(registry.resolveModelOption('deepseek.v4')?.sdkEnv.ANTHROPIC_API_KEY).toBe('direct-key')
  })

  test('allows official Anthropic providers to omit baseUrl', () => {
    const registry = createRegistry({
      config: {
        providers: [
          {
            id: 'anthropic',
            providerType: 'anthropic',
            label: 'Anthropic',
            runtime: 'anthropic-compatible',
            apiKey: 'anthropic-key',
            models: [
              { id: 'sonnet', label: 'Claude Sonnet', model: 'claude-sonnet-4-6' },
            ],
          },
        ],
      },
    })

    expect(registry.resolveModelOption('anthropic.sonnet')?.sdkEnv).toEqual({
      ANTHROPIC_API_KEY: 'anthropic-key',
    })
  })

  test('filters providers without required credentials or baseUrl', () => {
    const registry = createRegistry({
      config: {
        providers: [
          {
            id: 'missing-key',
            providerType: 'deepseek',
            label: 'Missing Key',
            runtime: 'anthropic-compatible',
            baseUrl: 'https://api.deepseek.com/anthropic',
            models: [{ id: 'v4', label: 'V4', model: 'deepseek-v4-pro[1m]' }],
          },
          {
            id: 'missing-base-url',
            providerType: 'zhipu',
            label: 'Missing Base URL',
            runtime: 'anthropic-compatible',
            apiKey: 'key',
            models: [{ id: 'glm', label: 'GLM', model: 'glm-5.2[1m]' }],
          },
        ],
      },
    })

    expect(registry.publicOptions.providers).toEqual([])
    expect(registry.hasAvailableModelOptions).toBe(false)
  })

  test('filters disabled providers and models while falling back to the first enabled model option', () => {
    const registry = createRegistry({
      config: {
        defaultModelOptionId: 'qwen.disabled-model',
        providers: [
          {
            id: 'disabled-provider',
            providerType: 'minimax',
            label: 'Disabled Provider',
            runtime: 'anthropic-compatible',
            enabled: false,
            baseUrl: 'https://api.minimaxi.com/anthropic',
            apiKey: 'disabled-provider-key',
            models: [
              { id: 'm3', label: 'MiniMax M3', model: 'MiniMax-M3[1m]' },
            ],
          },
          {
            id: 'qwen',
            providerType: 'qwen',
            label: 'Qwen',
            runtime: 'anthropic-compatible',
            baseUrl: 'https://dashscope.aliyuncs.com/api/anthropic',
            apiKey: 'qwen-key',
            models: [
              {
                id: 'disabled-model',
                label: 'qwen3.7-max',
                model: 'qwen3.7-max',
                enabled: false,
              },
              {
                id: 'flash',
                label: 'qwen3.6-flash',
                model: 'qwen3.6-flash',
              },
            ],
          },
        ],
      },
    })

    expect(registry.publicOptions.defaultModelOptionId).toBe('qwen.flash')
    expect(registry.publicOptions.providers).toEqual([
      {
        providerId: 'qwen',
        providerType: 'qwen',
        providerLabel: 'Qwen',
        models: [
          {
            modelOptionId: 'qwen.flash',
            providerId: 'qwen',
            providerType: 'qwen',
            providerLabel: 'Qwen',
            modelId: 'flash',
            label: 'qwen3.6-flash',
            model: 'qwen3.6-flash',
          },
        ],
      },
    ])
    expect(registry.resolveModelOption('disabled-provider.m3')).toBeUndefined()
    expect(registry.resolveModelOption('qwen.disabled-model')).toBeUndefined()
    expect(registry.resolveModelOption('qwen.flash')?.model).toBe('qwen3.6-flash')
    expect(registry.diagnostics.map((item) => item.code)).toContain('default-model-option-fallback')
  })

  test('rejects unsafe ids and falls back invalid defaultModelOptionId to the first available option', () => {
    const registry = createRegistry({
      config: {
        defaultModelOptionId: 'missing.option',
        providers: [
          {
            id: 'bad.provider',
            providerType: 'deepseek',
            label: 'Bad Provider',
            runtime: 'anthropic-compatible',
            baseUrl: 'https://api.deepseek.com/anthropic',
            apiKey: 'bad-key',
            models: [{ id: 'v4', label: 'V4', model: 'deepseek-v4-pro[1m]' }],
          },
          {
            id: 'deepseek',
            providerType: 'deepseek',
            label: 'DeepSeek',
            runtime: 'anthropic-compatible',
            baseUrl: 'https://api.deepseek.com/anthropic',
            apiKey: 'good-key',
            models: [
              { id: 'bad/model', label: 'Bad Model', model: 'bad' },
              { id: 'v4', label: 'V4', model: 'deepseek-v4-pro[1m]' },
            ],
          },
        ],
      },
    })

    expect(registry.publicOptions.defaultModelOptionId).toBe('deepseek.v4')
    expect(registry.publicOptions.providers).toHaveLength(1)
    expect(registry.publicOptions.providers[0]?.models.map((model) => model.modelOptionId)).toEqual(['deepseek.v4'])
  })

  test('uses service default option when no config file is configured', () => {
    const registry = resolveAgentModelProviderRegistry({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'default-token',
        ANTHROPIC_MODEL: 'deepseek-v4-pro[1m]',
      },
      readFileText: () => {
        throw new Error('should not read config file')
      },
    })

    expect(registry.publicOptions.selectorEnabled).toBe(false)
    expect(registry.publicOptions.defaultModelOptionId).toBe(SERVICE_DEFAULT_MODEL_OPTION_ID)
    expect(registry.publicOptions.providers[0]?.models[0]?.modelOptionId).toBe(SERVICE_DEFAULT_MODEL_OPTION_ID)
    expect(registry.resolveModelOption(SERVICE_DEFAULT_MODEL_OPTION_ID)).toEqual({
      modelOptionId: SERVICE_DEFAULT_MODEL_OPTION_ID,
      providerId: 'service-default',
      providerType: 'service-default',
      model: 'deepseek-v4-pro[1m]',
      sdkEnv: {
        ANTHROPIC_AUTH_TOKEN: 'default-token',
        ANTHROPIC_MODEL: 'deepseek-v4-pro[1m]',
      },
    })
  })
})
