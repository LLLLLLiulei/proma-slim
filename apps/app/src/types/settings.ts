/**
 * 应用设置类型
 *
 * 主题模式、IPC 通道等设置相关定义。
 */

import type { EnvironmentCheckResult, PromaPermissionMode, ThinkingConfig, AgentEffort } from '@proma/shared'

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 默认主题模式 */
export const DEFAULT_THEME_MODE: ThemeMode = 'light'

/** AskUserQuestion 默认超时（毫秒，0 = 不超时） */
export const DEFAULT_ASK_USER_TIMEOUT_MS = 0

/** 诊断日志级别 */
export type DiagnosticLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/** 默认诊断日志级别 */
export const DEFAULT_DIAGNOSTIC_LOG_LEVEL: DiagnosticLogLevel = 'trace'

/** 单个诊断日志文件默认最大体积（10 MB） */
export const DEFAULT_DIAGNOSTIC_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

/** 诊断日志保留策略 */
export interface DiagnosticLoggingRetentionSettings {
  /** 主日志归档文件最大保留数量 */
  maxArchiveFiles?: number
  /** turn sidecar 目录最大保留数量 */
  maxTurnDirectories?: number
  /** 归档项最大保留天数 */
  maxAgeDays?: number
}

/** 默认诊断日志保留策略 */
export const DEFAULT_DIAGNOSTIC_RETENTION: Required<DiagnosticLoggingRetentionSettings> = {
  maxArchiveFiles: 20,
  maxTurnDirectories: 50,
  maxAgeDays: 7,
}

/** 诊断日志设置 */
export interface DiagnosticLoggingSettings {
  /** 记录的最小日志级别。默认 trace，表示记录所有内建级别。 */
  level?: DiagnosticLogLevel
  /** 单个日志文件最大体积 */
  maxFileSizeBytes?: number
  /** 归档保留策略 */
  retention?: DiagnosticLoggingRetentionSettings
}

/** 应用设置 */
export interface AppSettings {
  /** 主题模式 */
  themeMode: ThemeMode
  /** Agent 默认渠道 ID（仅限 Anthropic 渠道） */
  agentChannelId?: string
  /** Agent 默认模型 ID */
  agentModelId?: string
  /** Agent 当前工作区 ID */
  agentWorkspaceId?: string
  /** 是否已完成 Onboarding 流程 */
  onboardingCompleted?: boolean
  /** 是否跳过了环境检测 */
  environmentCheckSkipped?: boolean
  /** 最后一次环境检测结果（缓存） */
  lastEnvironmentCheck?: EnvironmentCheckResult
  /** 是否启用桌面通知 */
  notificationsEnabled?: boolean
  /** 标签页持久化状态（重启恢复） */
  tabState?: PersistedTabSettings
  /** Agent 权限模式（全局默认，工作区级覆盖此值） */
  agentPermissionMode?: PromaPermissionMode
  /** Agent 思考模式 */
  agentThinking?: ThinkingConfig
  /** Agent 推理深度 */
  agentEffort?: AgentEffort
  /** Agent 最大预算（美元/次） */
  agentMaxBudgetUsd?: number
  /** Agent 最大轮次（0 或 undefined = SDK 默认） */
  agentMaxTurns?: number
  /** AskUserQuestion 等待用户响应的超时（毫秒，0 = 不超时） */
  askUserTimeoutMs?: number
  /** 教程推荐横幅是否已关闭 */
  tutorialBannerDismissed?: boolean
  /** 后端诊断日志配置 */
  diagnosticLogging?: DiagnosticLoggingSettings
}

/** 持久化的标签页状态 */
export interface PersistedTabSettings {
  tabs: Array<{
    id: string
    type: 'chat' | 'agent'
    sessionId: string
    title: string
  }>
  splitLayout: {
    mode: 'single' | 'horizontal-2' | 'vertical-2' | 'grid-4'
    panels: Array<{
      index: number
      activeTabId: string | null
    }>
    focusedPanelIndex: number
  }
}

/** 设置 IPC 通道 */
export const SETTINGS_IPC_CHANNELS = {
  GET: 'settings:get',
  UPDATE: 'settings:update',
  GET_SYSTEM_THEME: 'settings:get-system-theme',
  ON_SYSTEM_THEME_CHANGED: 'settings:system-theme-changed',
} as const
