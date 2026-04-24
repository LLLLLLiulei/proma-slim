const TOOL_LABELS: Record<string, string> = {
  AskUserQuestion: '向用户提问',
  Bash: '执行命令',
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  Glob: '查找文件',
  Grep: '搜索文本',
  WebSearch: '网页搜索',
  WebFetch: '抓取网页',
  NotebookEdit: '编辑笔记本',
  Skill: '调用技能',
  TodoWrite: '更新待办事项',
  TodoRead: '查看待办事项',
  Task: '委派子任务',
  TaskCreate: '创建任务',
  TaskUpdate: '更新任务',
  TaskGet: '查看任务详情',
  TaskList: '查看任务列表',
  TeamCreate: '创建协作组',
  Agent: '调用子代理',
}

const MCP_TOOL_LABELS: Record<string, string> = {
  mcp__cms__list_catalogs: 'CMS / 查询栏目列表',
  mcp__cms__list_contents: 'CMS / 查询内容列表',
  mcp__cms__decide_cms_binding: 'CMS / 生成绑定方案',
  mcp__cms__apply_cms_binding: 'CMS / 应用内容绑定',
  mcp__image_search__search_images: '图片搜索 / 搜索图片',
  mcp__image_search__download_images: '图片搜索 / 导入图片',
}

const MCP_SERVER_LABELS: Record<string, string> = {
  cms: 'CMS',
  image_search: '图片搜索',
}

const SKILL_LABELS: Record<string, string> = {
  brainstorming: '方案探索',
  'cms-binding-apply': 'CMS 绑定执行',
  'find-skills': '技能发现',
  'page-builder-cms-region-authoring-guidance': '既有 CMS 区域内容编辑指导',
  'page-builder-guided-generation': '页面引导生成',
  'redesign-skill': '二阶段视觉精修',
  'soft-skill': '高端视觉设计',
  'taste-skill': '首轮视觉设计',
}

function normalizeSkillInvocationName(skillName: string): string {
  const separatorIndex = skillName.lastIndexOf(':')
  if (separatorIndex <= 0 || separatorIndex >= skillName.length - 1) {
    return skillName
  }
  return skillName.slice(separatorIndex + 1)
}

export function formatAgentToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? MCP_TOOL_LABELS[toolName] ?? toolName
}

export function formatAgentSkillLabel(skillName: string): string {
  const normalizedSkillName = normalizeSkillInvocationName(skillName)
  return SKILL_LABELS[normalizedSkillName] ?? skillName
}

export function formatAgentMcpServerLabel(serverName: string): string {
  return MCP_SERVER_LABELS[serverName] ?? serverName
}

