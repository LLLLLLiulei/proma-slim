## 1. 前置审计与验证计划

- [x] 1.1 检查前 5 个模板库 changes 的 proposal/design/specs/tasks，确认实现边界与本 change 的验证范围一致。
- [x] 1.2 对照 `docs/page-builder-template-library-openspec-task-split-2026-06-13.md` 和需求设计文档，确认 Change 6 仍是验证收口，不包含新业务能力。
- [x] 1.3 梳理当前已有 Bun 测试覆盖矩阵，标出 standalone 主流程、CMS 边界、base path、编辑锁、无内置模板和无缩略图的覆盖缺口。
- [x] 1.4 若发现阻断性覆盖缺口，补充最小测试；不得引入新的 Playwright test runner 或 E2E 框架依赖。

## 2. 后端与路由回归验证

- [x] 2.1 运行并必要时补齐模板 registry 路由/服务测试，覆盖列表、详情、预览、删除、路径安全、no-store、public base path、无内置模板扫描和无缩略图字段。
- [x] 2.2 运行并必要时补齐 standalone 当前项目另存模板测试，覆盖有效编辑锁、非法 workspace、空名称、缺失入口、CMS 作者态残留、远程 runtime 依赖和关键资源失败。
- [x] 2.3 运行并必要时补齐 CMS integrated Builder 另存静态快照模板测试，覆盖有效 Builder Access Session、编辑锁、静态快照产物和敏感鉴权信息不落盘。
- [x] 2.4 运行并必要时补齐模板实例化测试，覆盖项目名称校验、workspace/session 创建、previewState 返回、失败回滚和 CMS integrated 来源模板不继承 CMS metadata。
- [x] 2.5 运行并必要时补齐 CMS 集成边界测试，确认 CMS 集成生产模式阻断全局模板库 API，dev standalone bypass 允许 standalone 模板库 API。

## 3. 前端页面与组件回归验证

- [x] 3.1 运行并必要时补齐 HomePage/资源 Tabs 测试，覆盖 standalone 默认模板库、模板库与历史记录同时挂载、CMS 生产模式隐藏资源区、dev bypass 展示资源区。
- [x] 3.2 运行并必要时补齐模板库组件/hook 测试，覆盖 loading、empty、error、retry、iframe 卡片预览、新窗口预览、删除确认、删除失败反馈和使用 pending 防重复提交。
- [x] 3.3 运行并必要时补齐使用模板 UI 测试，覆盖先输入项目名称、空名称拦截、调用 use API、写入 preview state cache、不写 bootstrap payload、不走 prompt 创建流程和失败不导航。
- [x] 3.4 运行并必要时补齐 Builder 另存模板 UI 测试，覆盖入口显示、仅填写模板名称、携带编辑锁、Agent streaming 阻止提交、CMS 固化提示、成功/失败反馈和编辑锁失效处理。
- [x] 3.5 运行历史记录相关测试，确认模板库 Tabs 和卡片样式调整没有破坏历史项目预览、编辑、删除、锁态禁删和无预览空态语义。

## 4. 真实浏览器端到端验证

- [x] 4.1 启动或确认本地 standalone PageBuilder 服务可访问，并准备一个可预览的 PageBuilder 项目作为另存模板来源。
- [x] 4.2 使用 Playwright MCP 或等效手工流程在 Builder 中点击“另存模板”，输入模板名称并确认保存成功。
- [x] 4.3 返回首页，确认模板库默认展示、目标模板出现在模板列表中，并且卡片 iframe 预览可见。
- [x] 4.4 点击模板“预览”，确认新窗口打开模板预览页面且 public URL 可访问。
- [x] 4.5 点击“使用模板”，输入新项目名称并确认，验证当前窗口进入 Builder，新 Builder 预览区直接展示模板页面，且不触发 Agent 首轮消息。
- [x] 4.6 返回首页删除该用户模板，确认模板库中该模板消失，同时历史记录仍保留通过模板创建的新项目。
- [x] 4.7 将浏览器验证的访问地址、关键步骤、结果和任何已知非阻断噪音记录到本 change 的任务完成说明或验证备注中。

## 5. 文档、OpenSpec 与归档准备

- [x] 5.1 运行与模板库相关的 Bun 测试集合、`bun run --cwd apps/page-builder typecheck`、必要的 app/server typecheck，以及 `git diff --check`。
- [x] 5.2 运行 `openspec validate verify-page-builder-template-library-e2e --strict`，并在同步/归档前运行相关模板库 changes 的 strict validate。
- [x] 5.3 检查任务拆分文档、需求设计文档和 active change 文档中关于 CMS 生产模式、dev bypass、无内置模板、无缩略图和验证方式的描述是否一致。
- [x] 5.4 如发现文档与已确认实现不一致，先修正文档或规格，再继续归档准备。
- [x] 5.5 完成 OpenSpec 主规格同步和模板库相关 changes 归档前检查，确认本 change 没有遗留未验证要求。
