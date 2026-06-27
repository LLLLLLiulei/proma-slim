type EnvSource = Record<string, string | undefined>

export const AGENT_SDK_ENV_KEYS = [
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

export type AgentSdkEnvKey = typeof AGENT_SDK_ENV_KEYS[number]
export type AgentSdkRuntimeEnv = Partial<Record<AgentSdkEnvKey, string>>

export const LEGACY_AGENT_SDK_ENV_KEYS = [
  'AI_PAGE_BUILDER_ANTHROPIC_API_KEY',
  'AI_PAGE_BUILDER_ANTHROPIC_BASE_URL',
] as const

export const AGENT_SDK_ENV_FILE_OVERRIDE_KEYS = [
  ...AGENT_SDK_ENV_KEYS,
  ...LEGACY_AGENT_SDK_ENV_KEYS,
] as const

type AgentSdkEnvFileOverrideKey = typeof AGENT_SDK_ENV_FILE_OVERRIDE_KEYS[number]
type MutableEnv = Record<string, string | undefined>

const AGENT_SDK_ENV_FILE_OVERRIDE_KEY_SET = new Set<string>(AGENT_SDK_ENV_FILE_OVERRIDE_KEYS)

function stripEnvValueQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 2) return trimmed

  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseEnvFileLine(line: string): [string, string] | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trimStart() : trimmed
  const equalsIndex = normalized.indexOf('=')
  if (equalsIndex <= 0) return null

  const key = normalized.slice(0, equalsIndex).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null

  return [key, stripEnvValueQuotes(normalized.slice(equalsIndex + 1))]
}

export function applyAgentSdkEnvFileOverrides(
  content: string,
  targetEnv: MutableEnv = process.env,
): {
  appliedKeys: AgentSdkEnvFileOverrideKey[]
} {
  const appliedKeys: AgentSdkEnvFileOverrideKey[] = []

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvFileLine(line)
    if (!parsed) continue

    const [key, value] = parsed
    if (!AGENT_SDK_ENV_FILE_OVERRIDE_KEY_SET.has(key)) continue

    targetEnv[key] = value
    appliedKeys.push(key as AgentSdkEnvFileOverrideKey)
  }

  return { appliedKeys }
}

function readFirstEnv(env: EnvSource, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function resolveAnthropicRuntimeEnv(env: EnvSource = process.env): {
  apiKey?: string
  baseUrl?: string
} {
  return {
    apiKey: readFirstEnv(env, ['ANTHROPIC_API_KEY', 'AI_PAGE_BUILDER_ANTHROPIC_API_KEY']),
    baseUrl: readFirstEnv(env, ['ANTHROPIC_BASE_URL', 'AI_PAGE_BUILDER_ANTHROPIC_BASE_URL']),
  }
}

export function resolveAgentSdkRuntimeEnv(env: EnvSource = process.env): {
  env: AgentSdkRuntimeEnv
  hasCredential: boolean
} {
  const sdkEnv: AgentSdkRuntimeEnv = {}

  for (const key of AGENT_SDK_ENV_KEYS) {
    const value = env[key]?.trim()
    if (value) {
      sdkEnv[key] = value
    }
  }

  if (!sdkEnv.ANTHROPIC_API_KEY) {
    const legacyApiKey = env.AI_PAGE_BUILDER_ANTHROPIC_API_KEY?.trim()
    if (legacyApiKey) {
      sdkEnv.ANTHROPIC_API_KEY = legacyApiKey
    }
  }

  if (!sdkEnv.ANTHROPIC_BASE_URL) {
    const legacyBaseUrl = env.AI_PAGE_BUILDER_ANTHROPIC_BASE_URL?.trim()
    if (legacyBaseUrl) {
      sdkEnv.ANTHROPIC_BASE_URL = legacyBaseUrl
    }
  }

  return {
    env: sdkEnv,
    hasCredential: Boolean(sdkEnv.ANTHROPIC_API_KEY || sdkEnv.ANTHROPIC_AUTH_TOKEN),
  }
}
