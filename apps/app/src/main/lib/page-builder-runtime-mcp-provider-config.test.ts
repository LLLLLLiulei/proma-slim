import { describe, expect, test } from 'bun:test'
import {
  resolvePageBuilderRuntimeMcpProviderEnv,
} from './page-builder-runtime-mcp-provider-config'

describe('resolvePageBuilderRuntimeMcpProviderEnv', () => {
  test('maps runtimeMcp.pagebuilder from the generalized AI providers JSONC before legacy env', () => {
    const resolved = resolvePageBuilderRuntimeMcpProviderEnv({
      env: {
        AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE: '/ai-providers.jsonc',
        PLATFORM_MODE: 'ALIYUN',
        ALIYUN_API_KEY: 'legacy-aliyun-key',
      },
      readFileText: (filePath) => {
        expect(filePath).toBe('/ai-providers.jsonc')
        return JSON.stringify({
          runtimeMcp: {
            pagebuilder: {
              provider: 'zhipu',
              apiKey: 'json-zhipu-key',
              baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
              vision: {
                model: 'glm-4.6v',
                temperature: 0.2,
                topP: 0.7,
                maxTokens: 4096,
              },
              image: {
                model: 'glm-image',
                size: '1280x1280',
              },
              timeoutMs: 120000,
              retryCount: 2,
            },
          },
        })
      },
    })

    expect(resolved).toEqual({
      PLATFORM_MODE: 'ZHIPU',
      Z_AI_API_KEY: 'json-zhipu-key',
      Z_AI_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4/',
      Z_AI_VISION_MODEL: 'glm-4.6v',
      Z_AI_VISION_MODEL_TEMPERATURE: '0.2',
      Z_AI_VISION_MODEL_TOP_P: '0.7',
      Z_AI_VISION_MODEL_MAX_TOKENS: '4096',
      Z_AI_IMAGE_MODEL: 'glm-image',
      Z_AI_IMAGE_SIZE: '1280x1280',
      Z_AI_TIMEOUT: '120000',
      Z_AI_RETRY_COUNT: '2',
    })
  })

  test('resolves Aliyun runtimeMcp.pagebuilder config and supports apiKeyEnv', () => {
    const resolved = resolvePageBuilderRuntimeMcpProviderEnv({
      env: {
        AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE: '/ai-providers.jsonc',
        DASHSCOPE_TOKEN: 'json-dashscope-key',
      },
      readFileText: () => JSON.stringify({
        runtimeMcp: {
          pagebuilder: {
            provider: 'dashscope',
            apiKeyEnv: 'DASHSCOPE_TOKEN',
            workspaceId: 'workspace-1',
            region: 'cn-beijing',
            vision: {
              model: 'qwen3-vl-plus',
              enableThinking: false,
              thinkingBudget: 1024,
              highResolutionImages: true,
              maxPixels: 2000000,
            },
            image: {
              model: 'qwen-image-2.0-pro',
              size: '2048*2048',
              promptExtend: true,
              watermark: false,
              negativePrompt: 'text, letters, words',
            },
            timeoutMs: 180000,
            retryCount: 3,
          },
        },
      }),
    })

    expect(resolved).toMatchObject({
      PLATFORM_MODE: 'ALIYUN',
      ALIYUN_API_KEY: 'json-dashscope-key',
      ALIYUN_WORKSPACE_ID: 'workspace-1',
      ALIYUN_REGION: 'cn-beijing',
      ALIYUN_VISION_MODEL: 'qwen3-vl-plus',
      ALIYUN_ENABLE_THINKING: 'false',
      ALIYUN_THINKING_BUDGET: '1024',
      ALIYUN_VL_HIGH_RESOLUTION_IMAGES: 'true',
      ALIYUN_MAX_PIXELS: '2000000',
      ALIYUN_IMAGE_MODEL: 'qwen-image-2.0-pro',
      ALIYUN_IMAGE_SIZE: '2048*2048',
      ALIYUN_IMAGE_PROMPT_EXTEND: 'true',
      ALIYUN_IMAGE_WATERMARK: 'false',
      ALIYUN_IMAGE_NEGATIVE_PROMPT: 'text, letters, words',
      ALIYUN_TIMEOUT: '180000',
      ALIYUN_RETRY_COUNT: '3',
    })
  })

  test('falls back to legacy PageBuilder MCP env and still ignores Anthropic-only credentials', () => {
    expect(resolvePageBuilderRuntimeMcpProviderEnv({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'anthropic-only-token',
      },
    })).toBeNull()

    expect(resolvePageBuilderRuntimeMcpProviderEnv({
      env: {
        PLATFORM_MODE: 'QWEN',
        QWEN_API_KEY: 'legacy-qwen-key',
      },
    })).toEqual({
      PLATFORM_MODE: 'QWEN',
      QWEN_API_KEY: 'legacy-qwen-key',
    })
  })

  test('treats disabled or credentialless runtimeMcp.pagebuilder config as unavailable', () => {
    expect(resolvePageBuilderRuntimeMcpProviderEnv({
      env: {
        AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE: '/ai-providers.jsonc',
      },
      readFileText: () => JSON.stringify({
        runtimeMcp: {
          pagebuilder: {
            enabled: false,
            provider: 'zhipu',
            apiKey: 'disabled-key',
          },
        },
      }),
    })).toBeNull()

    expect(resolvePageBuilderRuntimeMcpProviderEnv({
      env: {
        AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE: '/ai-providers.jsonc',
      },
      readFileText: () => JSON.stringify({
        runtimeMcp: {
          pagebuilder: {
            provider: 'zhipu',
            apiKeyEnv: 'MISSING_ZHIPU_KEY',
          },
        },
      }),
    })).toBeNull()
  })
})
