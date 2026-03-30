## Why

当前 `page-builder` 虽然已经具备自然语言建页、实时预览和页面区块选择能力，但仍然无法接入内部 CMS，让普通用户把栏目或内容作为真实数据源填充到页面区域中。由于 CMS 资源依赖内网鉴权，现阶段需要补上受控只读代理、可视化选择和轻量绑定闭环，才能让导航、图文列表、轮播和媒体区块真正落到可用业务场景，而不只是演示级静态文案生成。

## What Changes

- 为 `page-builder` 新增 CMS 数据源选择能力：用户可在 builder 中选择栏目、子栏目集合、单条内容或内容列表，并将其作为页面区块的数据来源。
- 为 Builder 页新增专用的 CMS 选择器模态框，既支持用户手动打开，也支持 Agent 在对话过程中根据用户意图主动触发，而不是受限于 `AskUserQuestion` 的少量选项展示。
- 引入由 Proma 主进程托管的只读 CMS 代理与 page-builder 专用工具能力，使 Agent 能在不暴露 CMS 凭证的前提下请求选择、读取 CMS 结构、获取内容详情，并将受保护资源导入 `workspace-files` 供静态预览使用。
- 明确 CMS 实际业务接口由宿主本地配置驱动：Proma 主进程从 `getConfigDir()/cms-settings.json` 读取 `baseUrl`、`currentSite`、`zusid` 等运行时配置，由开发者手工更新，不把 Cookie 会话凭证固化到仓库模板、工作区文件或前端页面中。
- 扩展 page-builder 的运行时隐藏上下文与轻量绑定元数据，使“当前选中的页面区块”和“本轮选中的 CMS 数据源”可以共同参与当前消息生成，同时保留后续“重新从 CMS 同步”的基础。
- 明确本次集成继续复用现有 `page-builder` 双栏工作台、工作区模板、skills 与 MCP 基础设施，不引入面向最终页面的 CMS 写回能力。

## Capabilities

### New Capabilities
- `page-builder-cms-data-sources`: 为 `page-builder` 提供 CMS 栏目/内容数据源选择、Agent 触发式选择器交互、受保护资源导入和轻量绑定元数据能力。

### Modified Capabilities
- `page-builder-preview-block-selection`: 已选页面区块的下一条消息隐藏上下文需要支持与 CMS 数据源选择结果协同工作，而不再限定为仅包含 `selector` 与用户原始文本。
- `workspace-scoped-agent-runtime`: `page-builder` 工作区运行时需要支持由宿主进程托管的只读 CMS 工具能力，并确保 CMS 凭证仅保留在服务端，不直接暴露给 Agent 或静态预览页面。

## Impact

- 影响 `apps/page-builder` 的 Builder 页交互，需要新增 CMS 选择器模态框、手动入口、Agent 触发后的选择流程，以及与现有页面区块选择状态的协同。
- 影响 `apps/app` 的主进程服务与 HTTP 路由，需要新增 CMS 本地运行时配置读取、只读代理、结构归一化、受保护资源导入、选择等待/回传机制，以及对应的测试覆盖。
- 影响 Agent 运行时装配与 page-builder 工作区规则，需要为 page-builder 会话提供受控 CMS 工具能力，并补充相关提示与策略约束。
- 不改变现有普通工作区行为，不要求最终静态页面直接依赖 CMS 登录态，也不引入 CMS 写回或双向编辑流程。
