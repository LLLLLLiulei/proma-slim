import type {
  AgentModelOptionSummary,
  AgentModelOptionsResponse,
  AgentModelProviderConfig,
  ResolvedAgentModelSelection,
} from './agent-model-provider'
import type { AgentSendInput } from './agent'
import type { AgentQueryInput } from './agent-provider'

const providerConfig: AgentModelProviderConfig = {
  defaultModelOptionId: 'zhipu.glm-5-2-1m',
  providers: [
    {
      id: 'zhipu',
      providerType: 'zhipu',
      label: '智谱',
      runtime: 'anthropic-compatible',
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      apiKey: 'sk-secret',
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
}

const modelOption: AgentModelOptionSummary = {
  modelOptionId: 'zhipu.glm-5-2-1m',
  providerId: 'zhipu',
  providerType: 'zhipu',
  providerLabel: '智谱',
  modelId: 'glm-5-2-1m',
  label: 'GLM 5.2 1M',
  model: 'glm-5.2[1m]',
  contextWindow: 1000000,
}

const response: AgentModelOptionsResponse = {
  defaultModelOptionId: 'zhipu.glm-5-2-1m',
  providers: [
    {
      providerId: 'zhipu',
      providerType: 'zhipu',
      providerLabel: '智谱',
      models: [modelOption],
    },
  ],
}

const resolved: ResolvedAgentModelSelection = {
  modelOptionId: 'zhipu.glm-5-2-1m',
  providerId: 'zhipu',
  providerType: 'zhipu',
  model: 'glm-5.2[1m]',
  sdkEnv: {
    ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
    ANTHROPIC_API_KEY: 'sk-secret',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.2[1m]',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.2[1m]',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.7',
    CLAUDE_CODE_SUBAGENT_MODEL: 'glm-4.7',
  },
}

const sendInput: AgentSendInput = {
  sessionId: 'session-1',
  userMessage: '生成一个专题页',
  channelId: '',
  modelOptionId: response.defaultModelOptionId,
}

const queryInput: AgentQueryInput = {
  sessionId: sendInput.sessionId,
  prompt: sendInput.userMessage,
  model: resolved.model,
  env: resolved.sdkEnv,
}

void providerConfig
void queryInput
