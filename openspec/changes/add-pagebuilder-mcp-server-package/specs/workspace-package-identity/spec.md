## ADDED Requirements

### Requirement: PageBuilder MCP server package SHALL use AI Page Builder package identity
新增的 PageBuilder MCP server workspace package SHALL 使用当前仓库的 AI Page Builder package identity，不得继续使用外部来源仓库的服务级 package 或 bin 命名。

#### Scenario: PageBuilder MCP server package uses workspace scope
- **WHEN** 开发者检查 `packages/pagebuilder-mcp-server/package.json`
- **THEN** package name SHALL be `@ai-page-builder/pagebuilder-mcp-server`
- **AND** package SHALL be included in the root workspace configuration

#### Scenario: PageBuilder MCP server bin uses pagebuilder name
- **WHEN** 开发者检查 `packages/pagebuilder-mcp-server/package.json`
- **THEN** bin name SHALL be `pagebuilder-mcp-server`
- **AND** bin name SHALL NOT be `zai-mcp-server`

#### Scenario: PageBuilder MCP server public docs use pagebuilder service naming
- **WHEN** 开发者检查迁移后的 README、env 示例和 Docker 示例
- **THEN** 这些当前状态文档 SHALL 将服务称为 PageBuilder MCP server 或 `pagebuilder-mcp-server`
- **AND** 这些当前状态文档 SHALL NOT 将服务产品名描述为 ZAI MCP server
