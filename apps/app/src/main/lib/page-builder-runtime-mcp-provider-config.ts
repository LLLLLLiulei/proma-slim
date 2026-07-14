import { readFileSync } from 'node:fs'
import { parse as parseJsonc } from 'jsonc-parser'
import {
  resolveAiProvidersConfigFile,
} from './agent-model-provider-config'

type EnvSource = Record<string, string | undefined>
type RuntimeMcpProviderEnv = Record<string, string>

export interface ResolvePageBuilderRuntimeMcpProviderEnvOptions {
  env?: EnvSource
  readFileText?: (filePath: string) => string
}

const PAGEBUILDER_RUNTIME_MCP_LEGACY_ENV_KEYS = [
  'PLATFORM_MODE',
  'Z_AI_MODE',
  'Z_AI_API_KEY',
  'ZAI_API_KEY',
  'Z_AI_BASE_URL',
  'Z_AI_VISION_MODEL',
  'Z_AI_VISION_MODEL_TEMPERATURE',
  'Z_AI_VISION_MODEL_TOP_P',
  'Z_AI_VISION_MODEL_MAX_TOKENS',
  'Z_AI_IMAGE_MODEL',
  'Z_AI_IMAGE_SIZE',
  'Z_AI_TIMEOUT',
  'Z_AI_RETRY_COUNT',
  'ALIYUN_API_KEY',
  'QWEN_API_KEY',
  'DASHSCOPE_API_KEY',
  'ALIYUN_BASE_URL',
  'ALIYUN_OPENAI_BASE_URL',
  'ALIYUN_DASHSCOPE_BASE_URL',
  'ALIYUN_NATIVE_BASE_URL',
  'ALIYUN_WORKSPACE_ID',
  'ALIYUN_REGION',
  'ALIYUN_VISION_MODEL',
  'ALIYUN_VISION_MODEL_TEMPERATURE',
  'ALIYUN_VISION_MODEL_TOP_P',
  'ALIYUN_VISION_MODEL_MAX_TOKENS',
  'ALIYUN_IMAGE_MODEL',
  'ALIYUN_IMAGE_SIZE',
  'ALIYUN_IMAGE_PROMPT_EXTEND',
  'ALIYUN_IMAGE_WATERMARK',
  'ALIYUN_IMAGE_NEGATIVE_PROMPT',
  'ALIYUN_ENABLE_THINKING',
  'ALIYUN_THINKING_BUDGET',
  'ALIYUN_VL_HIGH_RESOLUTION_IMAGES',
  'ALIYUN_MAX_PIXELS',
  'ALIYUN_TIMEOUT',
  'ALIYUN_RETRY_COUNT',
] as const

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringifyEnvValue(value: string | number | boolean | undefined): string | undefined {
  if (value === undefined) return undefined
  return String(value)
}

function putEnv(target: RuntimeMcpProviderEnv, key: string, value: string | number | boolean | undefined): void {
  const envValue = stringifyEnvValue(value)
  if (envValue !== undefined && envValue.trim()) {
    target[key] = envValue
  }
}

function normalizeProvider(value: string | undefined): 'ALIYUN' | 'ZAI' | 'ZHIPU' | null {
  const normalized = (value || 'zhipu').trim().toUpperCase()
  if (['ALIYUN', 'QWEN', 'DASHSCOPE'].includes(normalized)) return 'ALIYUN'
  if (['Z_AI', 'ZAI', 'Z'].includes(normalized)) return 'ZAI'
  if (['ZHIPU_AI', 'ZHIPUAI', 'ZHIPU', 'BIGMODEL'].includes(normalized)) return 'ZHIPU'
  return null
}

function resolveCredential(config: Record<string, unknown>, env: EnvSource): string | undefined {
  const direct = readString(config.apiKey) ?? readString(config.authToken)
  if (direct) return direct

  const envKey = readString(config.apiKeyEnv) ?? readString(config.authTokenEnv)
  return envKey ? readString(env[envKey]) : undefined
}

function resolveFromAiProvidersConfig(
  options: Required<ResolvePageBuilderRuntimeMcpProviderEnvOptions>,
): { present: boolean; env: RuntimeMcpProviderEnv | null } {
  const configFile = resolveAiProvidersConfigFile(options.env)
  if (!configFile) {
    return { present: false, env: null }
  }

  let parsed: unknown
  try {
    parsed = parseJsonc(options.readFileText(configFile.filePath), undefined, {
      allowTrailingComma: true,
      disallowComments: false,
    })
  } catch {
    return { present: false, env: null }
  }

  const root = readObject(parsed)
  const runtimeMcp = readObject(root?.runtimeMcp)
  const pagebuilder = readObject(runtimeMcp?.pagebuilder)
  if (!pagebuilder) {
    return { present: false, env: null }
  }
  if (pagebuilder.enabled === false) {
    return { present: true, env: null }
  }

  const provider = normalizeProvider(readString(pagebuilder.provider))
  const credential = resolveCredential(pagebuilder, options.env)
  if (!provider || !credential) {
    return { present: true, env: null }
  }

  return {
    present: true,
    env: provider === 'ALIYUN'
      ? mapAliyunRuntimeConfig(pagebuilder, credential)
      : mapZaiRuntimeConfig(pagebuilder, provider, credential),
  }
}

function mapZaiRuntimeConfig(
  config: Record<string, unknown>,
  provider: 'ZAI' | 'ZHIPU',
  credential: string,
): RuntimeMcpProviderEnv {
  const vision = readObject(config.vision) ?? {}
  const image = readObject(config.image) ?? {}
  const env: RuntimeMcpProviderEnv = {
    PLATFORM_MODE: provider,
    Z_AI_API_KEY: credential,
  }

  putEnv(env, 'Z_AI_BASE_URL', readString(config.baseUrl))
  putEnv(env, 'Z_AI_VISION_MODEL', readString(vision.model))
  putEnv(env, 'Z_AI_VISION_MODEL_TEMPERATURE', readFiniteNumber(vision.temperature))
  putEnv(env, 'Z_AI_VISION_MODEL_TOP_P', readFiniteNumber(vision.topP))
  putEnv(env, 'Z_AI_VISION_MODEL_MAX_TOKENS', readFiniteNumber(vision.maxTokens))
  putEnv(env, 'Z_AI_IMAGE_MODEL', readString(image.model))
  putEnv(env, 'Z_AI_IMAGE_SIZE', readString(image.size))
  putEnv(env, 'Z_AI_TIMEOUT', readFiniteNumber(config.timeoutMs))
  putEnv(env, 'Z_AI_RETRY_COUNT', readFiniteNumber(config.retryCount))

  return env
}

function mapAliyunRuntimeConfig(
  config: Record<string, unknown>,
  credential: string,
): RuntimeMcpProviderEnv {
  const vision = readObject(config.vision) ?? {}
  const image = readObject(config.image) ?? {}
  const env: RuntimeMcpProviderEnv = {
    PLATFORM_MODE: 'ALIYUN',
    ALIYUN_API_KEY: credential,
  }

  putEnv(env, 'ALIYUN_BASE_URL', readString(config.baseUrl))
  putEnv(env, 'ALIYUN_OPENAI_BASE_URL', readString(config.openaiBaseUrl))
  putEnv(env, 'ALIYUN_DASHSCOPE_BASE_URL', readString(config.dashscopeBaseUrl))
  putEnv(env, 'ALIYUN_NATIVE_BASE_URL', readString(config.nativeBaseUrl))
  putEnv(env, 'ALIYUN_WORKSPACE_ID', readString(config.workspaceId))
  putEnv(env, 'ALIYUN_REGION', readString(config.region))
  putEnv(env, 'ALIYUN_VISION_MODEL', readString(vision.model))
  putEnv(env, 'ALIYUN_VISION_MODEL_TEMPERATURE', readFiniteNumber(vision.temperature))
  putEnv(env, 'ALIYUN_VISION_MODEL_TOP_P', readFiniteNumber(vision.topP))
  putEnv(env, 'ALIYUN_VISION_MODEL_MAX_TOKENS', readFiniteNumber(vision.maxTokens))
  putEnv(env, 'ALIYUN_ENABLE_THINKING', readBoolean(vision.enableThinking))
  putEnv(env, 'ALIYUN_THINKING_BUDGET', readFiniteNumber(vision.thinkingBudget))
  putEnv(env, 'ALIYUN_VL_HIGH_RESOLUTION_IMAGES', readBoolean(vision.highResolutionImages))
  putEnv(env, 'ALIYUN_MAX_PIXELS', readFiniteNumber(vision.maxPixels))
  putEnv(env, 'ALIYUN_IMAGE_MODEL', readString(image.model))
  putEnv(env, 'ALIYUN_IMAGE_SIZE', readString(image.size))
  putEnv(env, 'ALIYUN_IMAGE_PROMPT_EXTEND', readBoolean(image.promptExtend))
  putEnv(env, 'ALIYUN_IMAGE_WATERMARK', readBoolean(image.watermark))
  putEnv(env, 'ALIYUN_IMAGE_NEGATIVE_PROMPT', readString(image.negativePrompt))
  putEnv(env, 'ALIYUN_TIMEOUT', readFiniteNumber(config.timeoutMs))
  putEnv(env, 'ALIYUN_RETRY_COUNT', readFiniteNumber(config.retryCount))

  return env
}

function resolveFromLegacyEnv(env: EnvSource): RuntimeMcpProviderEnv | null {
  const mode = normalizeProvider(readString(env.PLATFORM_MODE) ?? readString(env.Z_AI_MODE))
  const platformMode = readString(env.PLATFORM_MODE) ?? readString(env.Z_AI_MODE)
  if (mode === 'ALIYUN') {
    const credential = readString(env.ALIYUN_API_KEY)
      ?? readString(env.QWEN_API_KEY)
      ?? readString(env.DASHSCOPE_API_KEY)
    if (!credential) return null
  } else {
    const credential = readString(env.Z_AI_API_KEY) ?? readString(env.ZAI_API_KEY)
    if (!credential) return null
  }

  const result: RuntimeMcpProviderEnv = {}
  for (const key of PAGEBUILDER_RUNTIME_MCP_LEGACY_ENV_KEYS) {
    putEnv(result, key, env[key])
  }
  if (!result.PLATFORM_MODE && platformMode) {
    result.PLATFORM_MODE = platformMode
  }
  return result
}

export function resolvePageBuilderRuntimeMcpProviderEnv(
  options: ResolvePageBuilderRuntimeMcpProviderEnvOptions = {},
): RuntimeMcpProviderEnv | null {
  const resolvedOptions = {
    env: options.env ?? process.env,
    readFileText: options.readFileText ?? ((filePath: string) => readFileSync(filePath, 'utf8')),
  }
  const fromConfig = resolveFromAiProvidersConfig(resolvedOptions)
  if (fromConfig.present) {
    return fromConfig.env
  }

  return resolveFromLegacyEnv(resolvedOptions.env)
}
