/**
 * Agent system prompt 构建器
 *
 * 当前 Web 版仍然运行在 Proma 管理的 workspace session 目录里，而不是用户真实项目的 git root。
 * 这里必须把 workspace 拓扑、Skill 命名空间和 subagent 运行边界解释清楚，否则模型很容易把
 * session `cwd` 误判成“完整项目仓库”，进而在纯研究任务里错误选择 `worktree` isolation。
 */

import type { PromaPermissionMode } from '@proma/shared'
import { getAgentWorkspacePath, getWorkspaceFilesDir } from './config-paths'
import { getUserProfile } from './user-profile-service'
import {
  getWorkspaceAttachedDirectories,
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
  const profile = getUserProfile()
  const userName = profile.userName || '用户'
  const sections: string[] = []

  sections.push(`## Proma Agent

你是专题网页开发助手。你的目标是直接完成用户请求，并在不确定时明确说明假设。`)

  sections.push(`## 用户信息

- 用户名: ${userName}
- 会话 ID: ${ctx.sessionId}`)

  if (ctx.workspaceName && ctx.workspaceSlug) {
    sections.push(`## 工作区语义

- 当前工作区名称: ${ctx.workspaceName}
- 当前工作区 slug: ${ctx.workspaceSlug}
- 当前会话运行在 workspace session 目录中，而不是默认等同于用户真实项目仓库。
- 调用 Skill 工具时，必须使用当前工作区的调用名（如 \`${getWorkspaceSkillInvocationName(ctx.workspaceSlug, 'brainstorming')}\`）。`)
  }

  sections.push(`## Subagent / Teammate 规则

- 纯研究、搜索、总结、规划类 subagent 默认使用普通 sidechain / teammate 语义，不要把当前 Proma scratch 目录当作 git worktree。
- 只有在真实 git 仓库中执行代码修改类任务时，才考虑使用 worktree isolation。
- 如果用户附加了真实项目目录并要求改代码，应优先在那个真实仓库上下文里工作，而不是把当前 scratch cwd 伪装成 git repo。`)

  if (ctx.permissionMode === 'auto') {
    sections.push(`## 权限策略

当前是自动模式。敏感工具会直接执行；如果需求不明确，请直接在回复文本中追问，不要假设用户意图。`)
  } else {
    sections.push(`## 权限策略

当前允许交互式确认。遇到需要用户授权或补充信息的情况，请优先使用 AskUserQuestion 或权限请求机制。`)
  }

  sections.push(`## 回复约束

1. 默认使用中文回复，保留必要技术术语。
2. 输出保持直接、可执行，不写空话。
3. 破坏性操作前必须等待用户确认。`)

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
当前 \`working_directory\` 是 Proma 管理的 workspace session scratch 目录，不是默认等同于真实 git 仓库。
- 纯研究、搜索、总结、规划类 subagent 默认不要请求 worktree isolation。
- 这类任务直接创建普通 subagent / teammate 即可。
- 只有在真实 git 仓库中执行代码修改类任务时，才考虑使用 worktree isolation。
- 如果用户附加了真实项目目录，请把那个真实目录视为 repo-mode 目标，而不是把当前 scratch cwd 当作 repo。
</workspace_runtime_instructions>`)

    const workspaceStateLines: string[] = []

    if (ctx.workspaceName) {
      workspaceStateLines.push(`工作区: ${ctx.workspaceName}`)
    }

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

    const skills = getWorkspaceSkills(ctx.workspaceSlug)
    if (skills.length > 0) {
      workspaceStateLines.push('Skills:')
      for (const skill of skills) {
        const qualifiedName = getWorkspaceSkillInvocationName(ctx.workspaceSlug, skill.slug)
        const description = skill.description ? `: ${skill.description}` : ''
        workspaceStateLines.push(`- ${qualifiedName}${description}`)
      }
    }

    const attachedDirectories = getWorkspaceAttachedDirectories(ctx.workspaceSlug)
    if (attachedDirectories.length > 0) {
      workspaceStateLines.push('工作区附加目录:')
      for (const directory of attachedDirectories) {
        workspaceStateLines.push(`- ${directory}`)
      }
    }

    // 这里显式说明 workspace root / files 的固定位置，避免后续再出现资源路径漂移。
    workspaceStateLines.push(`Workspace Root: ${ctx.workspaceRootPath ?? getAgentWorkspacePath(ctx.workspaceSlug)}`)
    workspaceStateLines.push(`Workspace Files: ${ctx.workspaceFilesDir ?? getWorkspaceFilesDir(ctx.workspaceSlug)}`)

    sections.push(`<workspace_state>
${workspaceStateLines.join('\n')}
</workspace_state>`)
  }

  return sections.join('\n')
}
