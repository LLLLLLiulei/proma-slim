## ADDED Requirements

### Requirement: CMS island 的隐藏选区上下文必须保留稳定 source identity
系统 SHALL 在为已选 `cms-island` 注入下一条消息的隐藏选区上下文时，保留稳定 source identity 与兼容 selector 信息，使后续链路能够围绕同一个源 CMS 标签工作，而不是仅保留渲染态命中的结构位置。

#### Scenario: 可用 `sourceId` 被写入 CMS island 隐藏上下文
- **WHEN** 用户已选中某个 `cms-island`，且该目标存在稳定 `sourceId`
- **THEN** 系统 SHALL 在隐藏上下文中的 `targetSelection` 保留该 `sourceId`
- **AND** 系统 SHALL 同时保留源 CMS 标签 selector、所属 `parentBlockSelector`、组件类型和 `editBoundary: source-atomic`

#### Scenario: 旧页面缺少 `sourceId` 时仍保留 CMS island 语义
- **WHEN** 用户已选中某个来自旧页面的 `cms-island`，其源 CMS 标签暂时没有稳定 `sourceId`
- **THEN** 系统 SHALL 继续传递 `kind: cms-island`
- **AND** 系统 SHALL 继续传递源 CMS 标签 selector、所属 `parentBlockSelector` 与 `editBoundary: source-atomic`
- **AND** 系统 SHALL NOT 因 `sourceId` 缺失而将该目标退化为普通 block 目标

### Requirement: CMS island 的下一条消息上下文必须显式声明 source-first 写入限制
系统 SHALL 在为已选 `cms-island` 构造下一条消息的隐藏上下文时，显式声明 source-first 写入限制，使普通选区消息链路与受控 CMS 自动 apply 链路在目标边界上保持一致。

#### Scenario: 隐藏上下文声明不得写入渲染子节点或其他 block
- **WHEN** 系统为一次已选 `cms-island` 的普通消息准备隐藏上下文
- **THEN** 系统 SHALL 明确声明后续修改必须整体更新该源 CMS 标签
- **AND** 系统 SHALL 明确声明不得直接把渲染态子节点当作独立源码目标写回
- **AND** 系统 SHALL 明确声明不得修改 sibling block 或在旁边追加新的 `cms-*` 组件

#### Scenario: 隐藏上下文声明不得向 CMS slot 注入危险标签
- **WHEN** 系统为一次已选 `cms-island` 的普通消息准备隐藏上下文
- **THEN** 系统 SHALL 明确声明不得在 `cms-catalog` / `cms-content` 的 slot 中写入 `<script>` 或 `<style>`
