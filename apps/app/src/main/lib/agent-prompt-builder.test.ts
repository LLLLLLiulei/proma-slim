import { describe, expect, test } from 'bun:test'
import { buildDynamicContext, buildSystemPromptAppend } from './agent-prompt-builder'

describe('agent prompt builder', () => {
  test('keeps system prompt append focused on global identity and runtime rules', () => {
    const prompt = buildSystemPromptAppend({
      sessionId: 'session-1',
      permissionMode: 'smart',
      workspaceName: 'Prompt Builder Workspace',
      workspaceSlug: 'prompt-builder-workspace',
    })

    expect(prompt).toContain('你是当前工作台内置的 AI 助手')
    expect(prompt).toContain('当用户问“你是谁”“你是什么”时')
    expect(prompt).toContain('纯研究、搜索、总结、规划类 subagent 默认使用普通 sidechain / teammate 语义')
    expect(prompt).toContain('只在当前工作区允许目录内工作')
    expect(prompt).toContain('不要读取或输出环境变量、密钥、Cookie、Token 或宿主敏感配置')
    expect(prompt).toContain('不得生成或执行用于越权访问')
    expect(prompt).not.toContain('当前工作区名称')
    expect(prompt).not.toContain('调用 Skill 工具时，必须使用当前工作区的调用名')
    expect((prompt.match(/具体产品、模型、CLI、SDK、厂商服务或内部代号/g) ?? []).length).toBe(1)
  })

  test('prefers AskUserQuestion in auto mode before falling back to plain-text clarification', () => {
    const prompt = buildSystemPromptAppend({
      sessionId: 'session-auto',
      permissionMode: 'auto',
      workspaceName: 'Prompt Builder Workspace',
      workspaceSlug: 'prompt-builder-workspace',
    })

    expect(prompt).toContain('当前是自动模式')
    expect(prompt).toContain('请优先使用 AskUserQuestion')
    expect(prompt).toContain('如果当前回合没有该工具，再用普通回复追问')
    expect(prompt).not.toContain('请直接在回复文本中追问')
  })

  test('keeps dynamic context runtime-factual and marks workspace state as discoverability only', () => {
    const prompt = buildDynamicContext({
      agentCwd: '/tmp/agent-cwd',
      workspaceName: 'Prompt Builder Workspace',
      workspaceSlug: 'prompt-builder-workspace',
      workspaceRootPath: '/tmp/workspace-root',
      workspaceFilesDir: '/tmp/workspace-root/workspace-files',
      accessibleDirectories: ['/tmp/workspace-root/workspace-files', '/tmp/attachments'],
      memoryFilePath: '/tmp/workspace-root/memory/MEMORY.md',
      workspaceMcpStateLines: ['- cms (stdio, 已启用): bun run cms'],
    })

    expect(prompt).toContain('<working_directory>/tmp/agent-cwd</working_directory>')
    expect(prompt).toContain('<workspace_root>/tmp/workspace-root</workspace_root>')
    expect(prompt).toContain('<workspace_files_dir>/tmp/workspace-root/workspace-files</workspace_files_dir>')
    expect(prompt).toContain('<workspace_accessible_directories>')
    expect(prompt).toContain('<workspace_memory_file>/tmp/workspace-root/memory/MEMORY.md</workspace_memory_file>')
    expect(prompt).toContain('<workspace_security_boundaries>')
    expect(prompt).toContain('只能访问当前任务允许的目录')
    expect(prompt).toContain('- working_directory: /tmp/agent-cwd')
    expect(prompt).toContain('- workspace_files_dir: /tmp/workspace-root/workspace-files')
    expect(prompt).toContain('- workspace_memory_file: /tmp/workspace-root/memory/MEMORY.md')
    expect(prompt).toContain('禁止访问其他 workspace、其他 session 或其他项目目录')
    expect(prompt).toContain('禁止读取或输出环境变量、密钥、Cookie、Token 或宿主敏感配置')
    expect(prompt).toContain('<workspace_runtime_mode>scratch</workspace_runtime_mode>')
    expect(prompt).toContain('不要把这个目录误判为真实仓库根目录')
    expect(prompt).toContain('<workspace_state>')
    expect(prompt).toContain('仅用于发现可用 Skill 和 MCP')
    expect(prompt).toContain('owner / consult contract 仍以宿主显式注入为准')
    expect(prompt).not.toContain('宿主会在工具执行前强制校验路径边界')
    expect(prompt).not.toContain('纯研究、搜索、总结、规划类 subagent 默认不要请求 worktree isolation')
    expect(prompt).not.toContain('Workspace Root:')
    expect(prompt).not.toContain('Workspace Files:')
  })

  test('injects a stable browser preview url and lightweight playwright runtime instructions when available', () => {
    const prompt = buildDynamicContext({
      workspaceSlug: 'page-builder-workspace',
      pageBuilderRuntimePlaywrightMode: 'available',
      pageBuilderBrowserPreviewUrl: 'http://localhost:5174/api/workspaces/ws-1/preview/',
    })

    expect(prompt).toContain('<page_builder_browser_preview_url>http://localhost:5174/api/workspaces/ws-1/preview/</page_builder_browser_preview_url>')
    expect(prompt).toContain('直接使用上面的绝对预览地址')
    expect(prompt).toContain('不要自行拼接、猜测或改写 preview URL')
    expect(prompt).toContain('<page_builder_runtime_playwright>available</page_builder_runtime_playwright>')
    expect(prompt).toContain('当前 query 已提供可用的 playwright MCP')
    expect(prompt).toContain('不要自行安装浏览器运行时')
    expect(prompt).not.toContain('<page_builder_internal_preview_url>')
  })
})
