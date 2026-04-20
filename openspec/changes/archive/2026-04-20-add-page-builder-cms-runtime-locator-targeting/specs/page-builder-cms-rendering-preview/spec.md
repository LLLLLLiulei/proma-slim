## ADDED Requirements

### Requirement: 浏览器 preview bootstrap 必须为 CMS 渲染根节点注入 runtime locator 元数据
系统 SHALL 在浏览器端为每个顶层 `cms-catalog` / `cms-content` island 从当前作者态源标签推导 runtime locator，并 SHALL 只在该 island 渲染结果的顶层根节点上注入该 locator 元数据，而不得把这些内部定位字段写回作者态源码。

#### Scenario: 单个 CMS island 的多个渲染根节点共享同一 locator 元数据
- **WHEN** 某个顶层 `cms-catalog` 或 `cms-content` 在 preview 中渲染出多个顶层根节点
- **THEN** 系统 SHALL 为这些根节点注入同一组 `sourceSelector`、`parentBlockSelector`、`component` 与 `htmlPath`
- **AND** 系统 SHALL 允许前端 runtime 为该组根节点派生共享的 `islandKey`

#### Scenario: runtime locator 从源标签推导而不是镜像作者态 sourceId
- **WHEN** 某个顶层 `cms-catalog` 或 `cms-content` 完成 preview 挂载
- **THEN** 系统 SHALL 基于当前源 CMS 标签和其 parent block 推导 runtime locator
- **AND** 系统 SHALL NOT 以作者态 `data-proma-cms-source-id` 作为 preview root 的正式 identity 来源

#### Scenario: preview 注解不得改写作者态源码
- **WHEN** 某个页面包含顶层 `cms-*` islands 并完成 preview 注解
- **THEN** 系统 SHALL 仅在 preview 响应注入的运行时 DOM 中暴露 locator 元数据
- **AND** 系统 SHALL NOT 将这些 runtime locator attrs 写回 `workspace-files/index.html`
