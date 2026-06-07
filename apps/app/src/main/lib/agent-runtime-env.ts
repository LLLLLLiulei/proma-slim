type EnvSource = Record<string, string | undefined>

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
