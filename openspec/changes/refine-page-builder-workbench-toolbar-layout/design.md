## Context

当前 Builder 工作台由左侧 `PreviewPane` 与右侧 `page-builder-pane` 组成。预览区顶部已有 `PC / Mobile`、选择、导出、刷新、新窗口打开等入口，但多数是纯图标按钮；右侧 `ProjectTitleBar` 同时承载项目名称、`另存模板`、`对话 / 代码` Tab，职责混杂。

生产环境的 Page Builder 静态网关已通过 `window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__` 注入 `basePath`，渲染端通过 `public-base-path.ts` 读取运行时配置。新增工具栏隐藏配置应复用这条运行时配置链路，浏览器端不直接读取 `process.env`。

本变更需要同时调整布局、状态回退、运行时配置解析和测试覆盖，但不改变预览、导出、另存模板、编辑锁、代码 Tab 等底层业务能力。

## Goals / Non-Goals

**Goals:**

- 让预览区顶部菜单栏成为预览相关操作的统一入口，并将操作按钮改为“图标 + 文字”。
- 让右侧栏顶部菜单栏只负责右侧内容切换与项目身份展示：左侧为 `对话 / 代码`，右侧为项目名称与编辑入口。
- 通过 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` 控制每个工具栏项和项目名称显示/隐藏，默认全部展示。
- 对设备切换、右侧 Tab、项目名称隐藏等边界提供确定性回退，避免空白标题栏、不可见 active tab 或不可见设备模式。
- 保持所有隐藏项对应的底层业务逻辑、API 和对话框可复用，不把“隐藏 UI”解释为“禁用能力”。

**Non-Goals:**

- 不新增权限、角色或部署模式。
- 不删除另存模板、导出、刷新、新窗口打开、区块选择或代码 Tab 的后端能力。
- 不改变预览 iframe 加载、自动刷新、CMS rendering、编辑锁、静态导出或模板保存语义。
- 不引入多环境、多租户的复杂 UI 策略系统；本次只提供单个环境变量的扁平隐藏列表。
- 不通过 CSS 选择器或 DOM 查询来隐藏按钮，避免形成不稳定的前端覆盖方案。

## Decisions

### 1. 使用单一运行时配置项控制工具栏隐藏

采用 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS`，值为逗号分隔的扁平 key 列表，例如：

```text
AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS=export,saveTemplate,projectName
```

支持的 key 固定为：`pcPreview`、`mobilePreview`、`select`、`export`、`refresh`、`saveTemplate`、`openInNewWindow`、`chatTab`、`codeTab`、`projectName`。

解析规则：

- 按英文逗号拆分，逐项 `trim`。
- 空项忽略。
- 未知 key 忽略。
- 重复 key 去重。
- 未配置或解析后为空时视为全部展示。

理由：扁平 key 比 `preview.*` / `right.*` 更稳定，配置成本低，也避免把布局区域名称暴露为外部契约。`toolbar` 比 `chrome` 更准确，避免与浏览器 Chrome 或“页面外壳”概念混淆。

备选方案：

- 使用 JSON 配置：表达能力更强，但对部署环境变量不友好，也增加解析失败场景。
- 使用多个布尔环境变量：显式但过于分散，后续增减按钮时维护成本更高。
- 使用 CSS 隐藏：实现快，但不可测试、不可维护，也容易留下键盘焦点和状态回退问题。

### 2. 复用并扩展 Page Builder 运行时配置注入链路

生产静态网关读取 `process.env.AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS`，将规范化后的数组注入：

```ts
window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__ = {
  basePath,
  hiddenToolbarItems: ['export', 'saveTemplate'],
}
```

渲染端新增或扩展运行时配置 helper，统一返回 `Set<PageBuilderToolbarItemKey>`，组件只消费规范化结果，不自行解析原始字符串。

开发环境如需支持该环境变量，应由 Vite 配置在启动时把同一解析结果注入到前端可读的构建期常量或 runtime config fallback；生产环境以静态网关注入为准。这样可以保持本地调试与 Docker 部署行为一致，同时不让浏览器代码读取 Node 环境变量。

### 3. 预览工具栏按“设备切换 + 预览操作”分组

`PreviewPane` 顶部菜单栏保持左右结构：

- 左侧：`PC`、`Mobile` 设备切换组。
- 右侧：`选择`、`刷新`、`新窗口打开`、`导出`、`另存模板` 操作组。

操作按钮统一为图标 + 中文文字，不再只依赖 `title` 或 `aria-label` 解释含义。`另存模板` 入口从 `ProjectTitleBar` 下移到 `PreviewPane`，但保存弹窗、禁用条件、编辑锁拒绝处理仍由 `BuilderPage` 统一持有并通过 props 传入。

### 4. 右侧栏顶部菜单栏拆分为左侧 Tab 与右侧项目名称

`ProjectTitleBar` 的职责收敛为右侧栏顶部菜单栏：

- 左侧渲染 `对话 / 代码` Tab 组。
- 右侧渲染项目名称、编辑按钮和编辑态输入框。
- 不再渲染 `另存模板`。
- 顶部栏高度、垂直 padding、Tab 按钮和项目名称编辑按钮尺寸应与预览工具栏保持一致，避免左右两侧顶部区域视觉错位。

`BuilderRightPanel` 继续保持聊天区和代码区始终挂载，通过 active tab 控制显示隐藏，避免 Tab 切换丢失内部状态。

### 5. 隐藏后的状态回退必须由状态层处理

隐藏配置不能只影响 DOM 渲染，还需要同步修正 active state：

- `pcPreview` 隐藏且 `mobilePreview` 可见时，默认和回退到 Mobile。
- `mobilePreview` 隐藏且 `pcPreview` 可见时，默认和回退到 PC。
- `pcPreview` 与 `mobilePreview` 都隐藏时，不渲染设备切换组，内部默认 PC。
- `chatTab` 隐藏且 `codeTab` 可见时，active tab 回退到 code。
- `codeTab` 隐藏且 `chatTab` 可见时，active tab 回退到 chat。
- `chatTab` 与 `codeTab` 都隐藏时，不渲染 Tab 组，右侧内容回退展示 chat。
- `projectName` 隐藏时，同步隐藏项目名称文本、编辑按钮和编辑态入口。
- `chatTab`、`codeTab`、`projectName` 全部隐藏时，不渲染右侧顶部菜单栏，避免保留空白高度。

这些规则应封装为可测试的纯函数或低耦合 helper，避免在多个组件中重复手写条件分支。

### 6. 隐藏 UI 不等于删除业务能力

隐藏 `saveTemplate` 只是不在预览工具栏展示入口；保存模板弹窗组件、API client、编辑锁处理仍保留，便于后续从其他入口复用。隐藏 `export`、`refresh`、`openInNewWindow`、`select` 同理，只移除可见按钮，不改变相关 handler 的能力边界。

理由：部署定制经常只要求隐藏某些入口，而不是改变服务端授权或能力模型。把 UI 隐藏和权限禁用混在一起会引入额外复杂性，也容易破坏现有测试和用户流程。

## Risks / Trade-offs

- [Risk] 只隐藏按钮但能力仍保留，可能被误解为权限控制。→ Mitigation：文档和 spec 明确该配置是 UI 可见性配置，不是安全策略；需要权限控制时应另做后端能力约束。
- [Risk] 运行时配置解析散落在组件内会导致行为不一致。→ Mitigation：集中解析为 `Set`，组件只使用 `isToolbarItemHidden(key)` 或等价 helper。
- [Risk] 隐藏 active tab 或 active device 后页面进入不可见状态。→ Mitigation：通过状态层 effect 或纯函数在配置变化时强制回退到可见项。
- [Risk] 右侧顶部菜单栏全部隐藏后仍保留空白高度。→ Mitigation：当 Tab 组和项目名称都不可见时，组件返回 `null` 或由父容器不渲染该栏。
- [Risk] 开发环境和生产环境配置入口不一致。→ Mitigation：生产使用静态网关注入，开发通过 Vite 启动期注入或统一 fallback helper，使解析和组件消费逻辑一致。

## Migration Plan

- 默认配置为空，所有项目默认展示，因此升级后没有行为破坏。
- 已有部署可按需新增 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS`；移除该环境变量即可回滚到默认全展示。
- 若某个 key 拼写错误，系统忽略该 key，不影响其他已配置项。

## Open Questions

无。当前 key 命名、隐藏语义、设备/Tab 回退规则和 `另存模板` 迁移位置已明确。
