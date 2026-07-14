import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { getRuntimeStatus } from '../lib/runtime-init'
import { resolveAgentSdkRuntimeEnv } from '../lib/agent-runtime-env'
import {
  resolveAiProvidersConfigFile,
  resolveAgentModelProviderRegistry,
} from '../lib/agent-model-provider-config'
import { HttpError } from './errors'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T
  } catch {
    throw new HttpError(400, '请求体必须是合法的 JSON')
  }
}

function resolveClaudeSdkCliPath(): string | null {
  try {
    const cjsRequire = createRequire(import.meta.url)
    const sdkEntryPath = cjsRequire.resolve('@anthropic-ai/claude-agent-sdk')
    const cliPath = join(dirname(sdkEntryPath), 'cli.js')
    return existsSync(cliPath) ? cliPath : null
  } catch {
    return null
  }
}

export function createStatusPayload() {
  const runtime = resolveAgentSdkRuntimeEnv()
  const hasConfiguredModelProviders = Boolean(resolveAiProvidersConfigFile())
    && resolveAgentModelProviderRegistry().hasAvailableModelOptions
  const apiKeyConfigured = runtime.hasCredential || hasConfiguredModelProviders
  const sdkCliPath = resolveClaudeSdkCliPath()

  return {
    ok: apiKeyConfigured && Boolean(sdkCliPath),
    apiKeyConfigured,
    sdkCliAvailable: Boolean(sdkCliPath),
    sdkCliPath,
    runtimeStatus: getRuntimeStatus(),
  }
}
