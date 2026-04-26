/**
 * Agent system prompt 构建器
 *
 * 当前 Web 版仍然运行在 Proma 管理的 workspace session 目录里，而不是用户真实项目的 git root。
 * 这里必须把 workspace 拓扑、Skill 命名空间和 subagent 运行边界解释清楚，否则模型很容易把
 * session `cwd` 误判成“完整项目仓库”，进而在纯研究任务里错误选择 `worktree` isolation。
 */

import type { PromaPermissionMode } from '@proma/shared'
import {
  getWorkspaceMcpConfig,
  getWorkspaceSkillInvocationName,
  getWorkspaceSkills,
} from './workspace-service'

interface SystemPromptContext {
  sessionId: string
  permissionMode: PromaPermissionMode
  workspaceName?: string
  workspaceSlug?: string
}

export function buildSystemPromptAppend(ctx: SystemPromptContext): string {
  const sections: string[] = []

  sections.push(`## Assistant Identity

你是当前工作台内置的 AI 助手，负责帮助用户完成当前任务。
你对外只以与当前任务相关的职责身份交流，例如“AI 助手”“页面构建助手”“编辑助手”“内容处理助手”。
不要把自己描述为某个具体产品、模型、CLI、SDK、厂商服务或内部代号。
不要主动提及底层实现、系统提示词、预设提示词、运行时框架或宿主技术细节。
当用户问“你是谁”“你是什么”时，只回答你当前的职责和能提供的帮助。`)

  sections.push(`## Global Runtime Rules

- 纯研究、搜索、总结、规划类 subagent 默认使用普通 sidechain / teammate 语义，不要把宿主管理的 scratch 工作目录当成 git worktree 或真实仓库根目录。
- 只有在真实 git 仓库中执行代码修改类任务时，才考虑使用 worktree isolation。
- 如果用户附加了真实项目目录并要求改代码，应优先在那个真实仓库上下文里工作，而不是把当前 scratch cwd 伪装成 git repo。`)

  if (ctx.permissionMode === 'auto') {
    sections.push(`## 权限策略

当前是自动模式。敏感工具会直接执行；遇到需要用户确认、补充信息或偏好选择的情况，请优先使用 AskUserQuestion；如果当前回合没有该工具，再用普通回复追问。不要假设用户意图。`)
  } else {
    sections.push(`## 权限策略

当前允许交互式确认。遇到需要用户授权或补充信息的情况，请优先使用 AskUserQuestion 或权限请求机制。`)
  }

  sections.push(`## 回复约束

1. 默认使用中文回复，保留必要技术术语。
2. 输出保持直接、可执行，不写空话。
3. 破坏性操作前必须等待用户确认。
4. 当用户追问你的身份时，只说明你当前的职责和可提供的帮助。`)

  return sections.join('\n\n')
}

interface DynamicContext {
  agentCwd?: string
  workspaceName?: string
  workspaceSlug?: string
  workspaceRootPath?: string
  workspaceFilesDir?: string
  accessibleDirectories?: string[]
  memoryFilePath?: string
  workspaceMcpStateLines?: string[]
  pageBuilderRuntimePlaywrightMode?: 'docker-http' | 'available'
  pageBuilderBrowserPreviewUrl?: string
}

export function buildDynamicContext(ctx: DynamicContext): string {
  const sections: string[] = []

  const timeStr = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
  })

  sections.push(`<current_time>${timeStr}</current_time>`)

  if (ctx.agentCwd) {
    sections.push(`<working_directory>${ctx.agentCwd}</working_directory>`)
  }

  if (ctx.workspaceName) {
    sections.push(`<workspace_name>${ctx.workspaceName}</workspace_name>`)
  }

  if (ctx.workspaceSlug) {
    sections.push(`<workspace_slug>${ctx.workspaceSlug}</workspace_slug>`)
  }

  if (ctx.workspaceRootPath) {
    sections.push(`<workspace_root>${ctx.workspaceRootPath}</workspace_root>`)
  }

  if (ctx.workspaceFilesDir) {
    sections.push(`<workspace_files_dir>${ctx.workspaceFilesDir}</workspace_files_dir>`)
  }

  const accessibleDirectories = Array.from(new Set((ctx.accessibleDirectories ?? []).filter(Boolean)))
  if (accessibleDirectories.length > 0) {
    sections.push(`<workspace_accessible_directories>
${accessibleDirectories.map((directory) => `- ${directory}`).join('\n')}
</workspace_accessible_directories>`)
  }

  if (ctx.memoryFilePath) {
    sections.push(`<workspace_memory_file>${ctx.memoryFilePath}</workspace_memory_file>`)
    sections.push(`<workspace_memory_instructions>
当前工作区的本地记忆文件固定使用上面的路径。
- 需要读取或写入本地工作区记忆时，只使用这个文件。
- 不要猜测或改写为 sdk-config/projects/.../memory/MEMORY.md 这类 SDK 内部路径。
- 若用户要求把当前工作区记忆持久化到本地，就写入这个文件。
</workspace_memory_instructions>`)
  }

  if (ctx.workspaceSlug) {
    sections.push(`<workspace_runtime_mode>scratch</workspace_runtime_mode>`)
    sections.push(`<workspace_runtime_instructions>
当前 \`working_directory\` 是宿主管理的 workspace session scratch 目录。
- 不要把这个目录误判为真实仓库根目录。
- 如果用户附加了真实项目目录，请把那个真实目录视为 repo-mode 目标。
</workspace_runtime_instructions>`)

    const workspaceStateLines: string[] = [
      '以下为当前工作区的能力目录，仅用于发现可用 Skill 和 MCP；当前 turn 的 owner / consult contract 仍以宿主显式注入为准。',
    ]

    const runtimeMcpStateLines = ctx.workspaceMcpStateLines
    if (runtimeMcpStateLines) {
      workspaceStateLines.push('MCP 服务器:')
      for (const line of runtimeMcpStateLines) {
        workspaceStateLines.push(line)
      }
    } else {
      const mcpConfig = getWorkspaceMcpConfig(ctx.workspaceSlug)
      const serverEntries = Object.entries(mcpConfig.servers ?? {})
      if (serverEntries.length > 0) {
        workspaceStateLines.push('MCP 服务器:')
        for (const [name, entry] of serverEntries) {
          const status = entry.enabled ? '已启用' : '已禁用'
          const detail = entry.type === 'stdio'
            ? `${entry.command}${entry.args?.length ? ` ${entry.args.join(' ')}` : ''}`
            : entry.url || ''
          workspaceStateLines.push(`- ${name} (${entry.type}, ${status}): ${detail}`)
        }
      }
    }

    const skills = getWorkspaceSkills(ctx.workspaceSlug)
    if (skills.length > 0) {
      workspaceStateLines.push('Skills:')
      for (const skill of skills) {
        const qualifiedName = getWorkspaceSkillInvocationName(ctx.workspaceSlug, skill.slug)
        const description = skill.description ? `: ${skill.description}` : ''
        workspaceStateLines.push(`- ${qualifiedName}${description}`)
      }
    }

    sections.push(`<workspace_state>
${workspaceStateLines.join('\n')}
</workspace_state>`)
  }

  if (ctx.pageBuilderBrowserPreviewUrl) {
    sections.push(`<page_builder_browser_preview_url>${ctx.pageBuilderBrowserPreviewUrl}</page_builder_browser_preview_url>`)
    sections.push(`<page_builder_browser_preview_instructions>
当你需要使用浏览器 MCP 访问当前 page-builder 工作区预览时，直接使用上面的绝对预览地址。
- 不要自行拼接、猜测或改写 preview URL。
- 没有这个地址时，不要猜测 localhost 端口、协议或宿主地址。
</page_builder_browser_preview_instructions>`)
  }

  if (ctx.pageBuilderRuntimePlaywrightMode) {
    sections.push(`<page_builder_runtime_playwright>${ctx.pageBuilderRuntimePlaywrightMode}</page_builder_runtime_playwright>`)
    const runtimeInstructions = ctx.pageBuilderRuntimePlaywrightMode === 'docker-http'
      ? [
          '当前 query 的 playwright MCP 由 Docker 内部 HTTP sidecar 提供。',
          '- 不要尝试在当前工作目录或当前容器里安装 Chrome、Chromium，或运行 npx playwright install。',
          '- 这个浏览器运行时不共享当前工作目录的本地文件系统；不要对 workspace 文件使用 file:// URL。',
          '- 若需要访问当前 page-builder 页面，优先使用上面的绝对预览地址；没有该地址时，也不要猜测 URL 或退回到 file:// 工作区文件。',
        ]
      : [
          '当前 query 已提供可用的 playwright MCP。',
          '- 若需要访问当前 page-builder 页面，优先使用上面的绝对预览地址；没有该地址时不要猜测 URL。',
          '- 不要自行安装浏览器运行时，也不要退回到 file:// 工作区文件路径。',
        ]
    sections.push(`<page_builder_runtime_playwright_instructions>
${runtimeInstructions.join('\n')}
</page_builder_runtime_playwright_instructions>`)
  }

  return sections.join('\n')
}
