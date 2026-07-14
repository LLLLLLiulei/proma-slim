declare module '@ai-page-builder/pagebuilder-mcp-server/server' {
  export const PAGEBUILDER_RUNTIME_MCP_TOOL_NAMES: readonly ['analyze_image', 'generate_image']

  export function createPageBuilderMcpServer(options?: {
    toolNames?: readonly string[]
    assetSink?: (
      imageUrl: string,
      context?: {
        prompt?: string
        size?: string
        provider?: string
      },
    ) => Promise<unknown>
    imageSourceResolver?: (imageSource: string) => string | Promise<string>
    generateImage?: (prompt: string, size?: string) => Promise<string>
    analyzeImage?: (imageSource: string, prompt: string) => Promise<string>
  }): Promise<unknown>
}
