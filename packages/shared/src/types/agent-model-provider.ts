export type AgentModelProviderRuntime = 'anthropic-compatible'

export interface AgentModelProviderModelConfig {
  id: string
  label: string
  model: string
  contextWindow?: number
  enabled?: boolean
}

export interface AgentModelProviderConfigEntry {
  id: string
  providerType?: string
  label: string
  runtime: AgentModelProviderRuntime
  baseUrl?: string
  apiKey?: string
  apiKeyEnv?: string
  authToken?: string
  authTokenEnv?: string
  defaultOpusModel?: string
  defaultSonnetModel?: string
  defaultHaikuModel?: string
  subagentModel?: string
  enabled?: boolean
  models?: AgentModelProviderModelConfig[]
}

export interface AgentModelProviderConfig {
  defaultModelOptionId?: string
  providers: AgentModelProviderConfigEntry[]
}

export interface AgentModelOptionSummary {
  modelOptionId: string
  providerId: string
  providerType?: string
  providerLabel: string
  modelId: string
  label: string
  model: string
  contextWindow?: number
}

export interface AgentModelOptionsProviderGroup {
  providerId: string
  providerType?: string
  providerLabel: string
  models: AgentModelOptionSummary[]
}

export interface AgentModelOptionsResponse {
  selectorEnabled: boolean
  defaultModelOptionId: string
  providers: AgentModelOptionsProviderGroup[]
}

export interface ResolvedAgentModelSelection {
  modelOptionId: string
  providerId: string
  providerType?: string
  model: string
  sdkEnv: Record<string, string>
}
