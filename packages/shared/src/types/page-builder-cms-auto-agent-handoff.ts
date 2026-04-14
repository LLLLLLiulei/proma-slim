export const PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_SKILL = 'cms-binding-apply'
export const PAGE_BUILDER_CMS_AUTO_AGENT_HANDOFF_MCP_SERVER = 'cms'

export interface PageBuilderCmsAutoAgentHandoffRequest {
  requestId: string
  userMessage: string
  composedUserMessage: string
  mentionedSkills: string[]
  mentionedMcpServers?: string[]
}

export interface PageBuilderCmsAutoAgentHandoffSettledResult {
  requestId: string
  status: 'sent' | 'failed'
  errorMessage?: string
}
