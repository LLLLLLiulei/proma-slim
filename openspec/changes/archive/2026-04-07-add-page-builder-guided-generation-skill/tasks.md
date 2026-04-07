## 1. 主控 skill 骨架

- [x] 1.1 使用 `skill-creator` 初始化 `page-builder-guided-generation` 的 skill 目录骨架、`SKILL.md` 和 `agents/openai.yaml`
- [x] 1.2 将新主控 skill 纳入 bundled default skills，并补齐新建 page-builder 工作区的默认同步来源
- [x] 1.3 为主控 skill 准备精简的 reference 结构，只保留提问阈值、确认规则和下游 skill 编排所需的最小参考内容

## 2. 主控 skill 行为定义

- [x] 2.1 在 `SKILL.md` 中写明创建专题页、迭代当前页面、整页重做三类模式的识别规则
- [x] 2.2 在 `SKILL.md` 中写明 `AskUserQuestion` 的提问约束，包括单题优先、少量选项、可自定义、多选场景与口语化要求
- [x] 2.3 在 `SKILL.md` 中写明“可稳定成稿阈值”、最终确认摘要、非空页面覆盖确认和“你帮我决定”时的默认补足策略
- [x] 2.4 在 `SKILL.md` 中写明确认后显式调用 `design-taste-frontend`、按需调用 `redesign-existing-projects` 的编排规则

## 3. Page-builder 发送链路接入

- [x] 3.1 更新首页进入 Builder 的首条自动发送逻辑，在首次初始化发送时显式注入 `page-builder-guided-generation`
- [x] 3.2 更新 Builder 普通用户发送路径，默认显式注入 `page-builder-guided-generation`
- [x] 3.3 保留已有专用 programmatic send 的显式 `mentionedSkills`，避免 CMS 等专用 handoff 被默认主控 skill 覆盖
- [x] 3.4 更新 page-builder 工作区模板提示词，使其与主控 skill 的职责边界、`AskUserQuestion` 规则和单页专题页默认目标保持一致

## 4. 既有工作区补齐与运行时兼容

- [x] 4.1 实现既有 page-builder 工作区缺失主控 skill 时的补齐逻辑，避免只有新项目才能进入引导式流程
- [x] 4.2 确保普通 page-builder 会话在已有页面时继续走轻量迭代模式，而不会被宿主错误重置为首轮引导
- [x] 4.3 确保非空页面整页重做时可以通过现有交互能力发起覆盖确认，而不引入新的宿主状态机

## 5. 测试与验证

- [x] 5.1 为首页首条自动发送注入主控 skill、Builder 普通发送注入主控 skill、专用 programmatic send 不被覆盖补充自动化测试
- [x] 5.2 为默认 skill 同步与既有 page-builder 工作区补齐主控 skill 补充自动化测试
- [ ] 5.3 手动验证从一句需求开始的 page-builder 流程：动态提问、最终确认、单页生成、生成后迭代、非空页面整页重做确认
