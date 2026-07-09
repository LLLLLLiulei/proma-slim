import { readFileSync } from 'node:fs'
import { parse as parseJsonc, printParseErrorCode, type ParseError } from 'jsonc-parser'
import type {
  AgentModelOptionSummary,
  AgentModelOptionsProviderGroup,
  AgentModelOptionsResponse,
  AgentModelProviderConfig,
  AgentModelProviderConfigEntry,
  AgentModelProviderModelConfig,
  ResolvedAgentModelSelection,
} from '@ai-page-builder/shared'
import { resolveAgentSdkRuntimeEnv } from './agent-runtime-env'

type EnvSource = Record<string, string | undefined>

export const AGENT_MODELS_CONFIG_FILE_ENV = 'AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE'
export const SERVICE_DEFAULT_MODEL_OPTION_ID = 'service-default.default'

export interface AgentModelProviderDiagnostic {
  level: 'warn' | 'error'
  code: string
  providerId?: string
  modelOptionId?: string
  message: string
}

export interface AgentModelProviderRegistry {
  publicOptions: AgentModelOptionsResponse
  selections: Map<string, ResolvedAgentModelSelection>
  hasAvailableModelOptions: boolean
  diagnostics: AgentModelProviderDiagnostic[]
  resolveModelOption: (modelOptionId?: string) => ResolvedAgentModelSelection | undefined
}

export interface ResolveAgentModelProviderRegistryOptions {
  env?: EnvSource
  readFileText?: (filePath: string) => string
}

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isEnabled(value: unknown): boolean {
  return value !== false
}

function isSafeId(id: string): boolean {
  return SAFE_ID_PATTERN.test(id)
}

function isOfficialAnthropicProvider(provider: AgentModelProviderConfigEntry): boolean {
  return provider.providerType === 'anthropic' || provider.id === 'anthropic'
}

function readConfigFile(
  filePath: string,
  readFileText: (filePath: string) => string,
): AgentModelProviderConfig {
  const errors: ParseError[] = []
  const parsed = parseJsonc(readFileText(filePath), errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown
  if (errors.length > 0) {
    const firstError = errors[0]!
    throw new Error(`模型提供商配置 JSONC 解析失败: ${printParseErrorCode(firstError.error)} at offset ${firstError.offset}`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { providers: [] }
  }

  const source = parsed as Record<string, unknown>
  const providers = Array.isArray(source.providers)
    ? source.providers
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map(normalizeProviderConfig)
      .filter((item): item is AgentModelProviderConfigEntry => Boolean(item))
    : []

  return {
    ...(readString(source.defaultModelOptionId) ? { defaultModelOptionId: readString(source.defaultModelOptionId) } : {}),
    providers,
  }
}

function normalizeProviderConfig(source: Record<string, unknown>): AgentModelProviderConfigEntry | null {
  const id = readString(source.id)
  const label = readString(source.label)
  const runtime = readString(source.runtime)
  if (!id || !label || runtime !== 'anthropic-compatible') return null

  return {
    id,
    label,
    runtime,
    ...(readString(source.providerType) ? { providerType: readString(source.providerType) } : {}),
    ...(readString(source.baseUrl) ? { baseUrl: readString(source.baseUrl) } : {}),
    ...(readString(source.apiKey) ? { apiKey: readString(source.apiKey) } : {}),
    ...(readString(source.apiKeyEnv) ? { apiKeyEnv: readString(source.apiKeyEnv) } : {}),
    ...(readString(source.authToken) ? { authToken: readString(source.authToken) } : {}),
    ...(readString(source.authTokenEnv) ? { authTokenEnv: readString(source.authTokenEnv) } : {}),
    ...(readString(source.defaultOpusModel) ? { defaultOpusModel: readString(source.defaultOpusModel) } : {}),
    ...(readString(source.defaultSonnetModel) ? { defaultSonnetModel: readString(source.defaultSonnetModel) } : {}),
    ...(readString(source.defaultHaikuModel) ? { defaultHaikuModel: readString(source.defaultHaikuModel) } : {}),
    ...(readString(source.subagentModel) ? { subagentModel: readString(source.subagentModel) } : {}),
    ...(typeof source.enabled === 'boolean' ? { enabled: source.enabled } : {}),
    models: Array.isArray(source.models)
      ? source.models
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map(normalizeModelConfig)
        .filter((item): item is AgentModelProviderModelConfig => Boolean(item))
      : [],
  }
}

function normalizeModelConfig(source: Record<string, unknown>): AgentModelProviderModelConfig | null {
  const id = readString(source.id)
  const label = readString(source.label)
  const model = readString(source.model)
  if (!id || !label || !model) return null

  return {
    id,
    label,
    model,
    ...(readOptionalNumber(source.contextWindow) ? { contextWindow: readOptionalNumber(source.contextWindow) } : {}),
    ...(typeof source.enabled === 'boolean' ? { enabled: source.enabled } : {}),
  }
}

function readEnvValue(env: EnvSource, key: string | undefined): string | undefined {
  if (!key) return undefined
  return readString(env[key])
}

function resolveCredential(
  provider: AgentModelProviderConfigEntry,
  env: EnvSource,
): Partial<Record<'ANTHROPIC_API_KEY' | 'ANTHROPIC_AUTH_TOKEN', string>> {
  const apiKey = readString(provider.apiKey) ?? readEnvValue(env, provider.apiKeyEnv)
  if (apiKey) return { ANTHROPIC_API_KEY: apiKey }

  const authToken = readString(provider.authToken) ?? readEnvValue(env, provider.authTokenEnv)
  if (authToken) return { ANTHROPIC_AUTH_TOKEN: authToken }

  return {}
}

function buildProviderSdkEnv(provider: AgentModelProviderConfigEntry, env: EnvSource): Record<string, string> | null {
  const credential = resolveCredential(provider, env)
  if (!credential.ANTHROPIC_API_KEY && !credential.ANTHROPIC_AUTH_TOKEN) return null

  if (!isOfficialAnthropicProvider(provider) && !provider.baseUrl) {
    return null
  }

  return {
    ...(provider.baseUrl ? { ANTHROPIC_BASE_URL: provider.baseUrl } : {}),
    ...credential,
    ...(provider.defaultOpusModel ? { ANTHROPIC_DEFAULT_OPUS_MODEL: provider.defaultOpusModel } : {}),
    ...(provider.defaultSonnetModel ? { ANTHROPIC_DEFAULT_SONNET_MODEL: provider.defaultSonnetModel } : {}),
    ...(provider.defaultHaikuModel ? { ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.defaultHaikuModel } : {}),
    ...(provider.subagentModel ? { CLAUDE_CODE_SUBAGENT_MODEL: provider.subagentModel } : {}),
  }
}

function createEmptyRegistry(diagnostics: AgentModelProviderDiagnostic[] = []): AgentModelProviderRegistry {
  const publicOptions: AgentModelOptionsResponse = {
    defaultModelOptionId: '',
    providers: [],
  }
  const selections = new Map<string, ResolvedAgentModelSelection>()
  return {
    publicOptions,
    selections,
    hasAvailableModelOptions: false,
    diagnostics,
    resolveModelOption: () => undefined,
  }
}

function createServiceDefaultRegistry(env: EnvSource): AgentModelProviderRegistry {
  const runtime = resolveAgentSdkRuntimeEnv(env)
  const model = runtime.env.ANTHROPIC_MODEL ?? 'SDK 默认模型'
  const selection: ResolvedAgentModelSelection = {
    modelOptionId: SERVICE_DEFAULT_MODEL_OPTION_ID,
    providerId: 'service-default',
    providerType: 'service-default',
    model,
    sdkEnv: Object.fromEntries(
      Object.entries(runtime.env).filter((entry): entry is [string, string] => Boolean(entry[1])),
    ),
  }
  const option: AgentModelOptionSummary = {
    modelOptionId: selection.modelOptionId,
    providerId: selection.providerId,
    providerType: selection.providerType,
    providerLabel: '服务默认',
    modelId: 'default',
    label: model,
    model,
  }
  const providerGroup: AgentModelOptionsProviderGroup = {
    providerId: selection.providerId,
    providerType: selection.providerType,
    providerLabel: '服务默认',
    models: [option],
  }
  const selections = new Map([[selection.modelOptionId, selection]])

  return {
    publicOptions: {
      defaultModelOptionId: SERVICE_DEFAULT_MODEL_OPTION_ID,
      providers: [providerGroup],
    },
    selections,
    hasAvailableModelOptions: true,
    diagnostics: [],
    resolveModelOption: (modelOptionId) => selections.get(modelOptionId || SERVICE_DEFAULT_MODEL_OPTION_ID),
  }
}

export function resolveAgentModelProviderRegistry(
  options: ResolveAgentModelProviderRegistryOptions = {},
): AgentModelProviderRegistry {
  const env = options.env ?? process.env
  const configFile = readString(env[AGENT_MODELS_CONFIG_FILE_ENV])
  if (!configFile) {
    return createServiceDefaultRegistry(env)
  }

  const diagnostics: AgentModelProviderDiagnostic[] = []
  let config: AgentModelProviderConfig
  try {
    config = readConfigFile(configFile, options.readFileText ?? ((filePath) => readFileSync(filePath, 'utf8')))
  } catch (error) {
    diagnostics.push({
      level: 'error',
      code: 'config-read-failed',
      message: error instanceof Error ? error.message : '模型提供商配置读取失败',
    })
    return createEmptyRegistry(diagnostics)
  }

  const providerIds = new Set<string>()
  const selections = new Map<string, ResolvedAgentModelSelection>()
  const providerGroups: AgentModelOptionsProviderGroup[] = []

  for (const provider of config.providers) {
    if (!isEnabled(provider.enabled)) continue
    if (!isSafeId(provider.id)) {
      diagnostics.push({ level: 'warn', code: 'unsafe-provider-id', providerId: provider.id, message: 'provider id contains unsafe characters' })
      continue
    }
    if (providerIds.has(provider.id)) {
      diagnostics.push({ level: 'warn', code: 'duplicate-provider-id', providerId: provider.id, message: 'provider id is duplicated' })
      continue
    }
    providerIds.add(provider.id)

    const sdkEnv = buildProviderSdkEnv(provider, env)
    if (!sdkEnv) {
      diagnostics.push({ level: 'warn', code: 'provider-unavailable', providerId: provider.id, message: 'provider is missing required credential or baseUrl' })
      continue
    }

    const modelIds = new Set<string>()
    const models: AgentModelOptionSummary[] = []
    for (const model of provider.models ?? []) {
      if (!isEnabled(model.enabled)) continue
      if (!isSafeId(model.id)) {
        diagnostics.push({ level: 'warn', code: 'unsafe-model-id', providerId: provider.id, message: 'model id contains unsafe characters' })
        continue
      }
      if (modelIds.has(model.id)) {
        diagnostics.push({ level: 'warn', code: 'duplicate-model-id', providerId: provider.id, message: 'model id is duplicated' })
        continue
      }
      modelIds.add(model.id)

      const modelOptionId = `${provider.id}.${model.id}`
      const option: AgentModelOptionSummary = {
        modelOptionId,
        providerId: provider.id,
        ...(provider.providerType ? { providerType: provider.providerType } : {}),
        providerLabel: provider.label,
        modelId: model.id,
        label: model.label,
        model: model.model,
        ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
      }
      const selection: ResolvedAgentModelSelection = {
        modelOptionId,
        providerId: provider.id,
        ...(provider.providerType ? { providerType: provider.providerType } : {}),
        model: model.model,
        sdkEnv,
      }
      models.push(option)
      selections.set(modelOptionId, selection)
    }

    if (models.length > 0) {
      providerGroups.push({
        providerId: provider.id,
        ...(provider.providerType ? { providerType: provider.providerType } : {}),
        providerLabel: provider.label,
        models,
      })
    }
  }

  const firstModelOptionId = providerGroups[0]?.models[0]?.modelOptionId
  if (!firstModelOptionId) return createEmptyRegistry(diagnostics)

  const defaultModelOptionId = config.defaultModelOptionId && selections.has(config.defaultModelOptionId)
    ? config.defaultModelOptionId
    : firstModelOptionId
  if (config.defaultModelOptionId && config.defaultModelOptionId !== defaultModelOptionId) {
    diagnostics.push({
      level: 'warn',
      code: 'default-model-option-fallback',
      modelOptionId: config.defaultModelOptionId,
      message: 'default model option is unavailable; falling back to first available option',
    })
  }

  return {
    publicOptions: {
      defaultModelOptionId,
      providers: providerGroups,
    },
    selections,
    hasAvailableModelOptions: true,
    diagnostics,
    resolveModelOption: (modelOptionId) => selections.get(modelOptionId || defaultModelOptionId),
  }
}
