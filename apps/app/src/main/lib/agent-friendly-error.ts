export const LOGIN_CONFIGURATION_ERROR_MESSAGE = 'Claude Code 当前未登录，请先在终端完成登录，或检查 Agent SDK 凭证与 ANTHROPIC_BASE_URL 是否已正确配置。'
export const AUTHENTICATION_ERROR_MESSAGE = 'Agent SDK 认证失败，请检查 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN 是否正确，或确认当前环境已完成 Claude Code 登录。'
export const BASE_URL_CONFIGURATION_ERROR_MESSAGE = 'Anthropic 服务地址不可用，请检查 ANTHROPIC_BASE_URL 是否正确且网络可访问。'

interface FriendlyErrorRule {
  pattern: RegExp
  message: string
}

export interface FriendlyAgentErrorResult {
  matched: boolean
  userMessage: string
  originalMessage: string
}

const FRIENDLY_ERROR_RULES: FriendlyErrorRule[] = [
  {
    pattern: /anthropic_base_url|base[\s_-]?url|invalid url/i,
    message: BASE_URL_CONFIGURATION_ERROR_MESSAGE,
  },
  {
    pattern: /authentication failed|invalid api key|invalid x-api-key|unauthorized|401/i,
    message: AUTHENTICATION_ERROR_MESSAGE,
  },
  {
    pattern: /not logged in|please run \/login|login required/i,
    message: LOGIN_CONFIGURATION_ERROR_MESSAGE,
  },
]

export function mapAgentFriendlyError(rawMessage: string): FriendlyAgentErrorResult {
  for (const rule of FRIENDLY_ERROR_RULES) {
    if (rule.pattern.test(rawMessage)) {
      return {
        matched: true,
        userMessage: rule.message,
        originalMessage: rawMessage,
      }
    }
  }

  return {
    matched: false,
    userMessage: rawMessage,
    originalMessage: rawMessage,
  }
}
