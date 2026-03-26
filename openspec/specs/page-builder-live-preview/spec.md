## Purpose
定义 `page-builder` 如何基于工作区 `workspace-files` 暴露静态预览入口、预览状态接口，以及 builder 左侧 iframe 的自动刷新行为。

## Requirements

### Requirement: 工作区必须暴露 `workspace-files` 的静态预览入口
系统 SHALL 为每个工作区提供基于 `workspace-files` 的静态网页预览入口，使 builder 左侧可以直接加载当前项目的真实页面结果。

#### Scenario: 访问工作区预览入口时返回 `index.html`
- **WHEN** 当前工作区的 `workspace-files/index.html` 已存在，且前端访问该工作区的预览入口
- **THEN** 系统 SHALL 返回该工作区的 `index.html` 内容作为预览首页

#### Scenario: 访问预览静态资源时按相对路径返回文件
- **WHEN** 当前工作区的预览页面通过相对路径请求 `workspace-files` 下的静态资源文件
- **THEN** 系统 SHALL 从该工作区的 `workspace-files` 目录中返回对应资源，而不是回退到应用前端静态资源

#### Scenario: 预览入口不存在时不返回旧内容
- **WHEN** 当前工作区的 `workspace-files/index.html` 不存在
- **THEN** 系统 SHALL 将该工作区视为“暂无可预览页面”，并且不继续返回旧的预览入口内容

### Requirement: 工作区必须提供可轮询的预览状态接口
系统 SHALL 为每个工作区提供轻量预览状态查询能力，使 builder 可以在不直接重载 iframe 的情况下判断当前是否存在预览，以及预览内容是否发生变化。

#### Scenario: 存在预览时返回入口地址和版本
- **WHEN** 当前工作区存在可访问的 `workspace-files/index.html`
- **THEN** 系统 SHALL 返回 `hasPreview` 为真、可供 iframe 加载的 `entryUrl`，以及表示当前预览快照版本的 `revision`

#### Scenario: 不存在预览时返回空状态
- **WHEN** 当前工作区尚未生成任何可访问的预览入口
- **THEN** 系统 SHALL 返回 `hasPreview` 为假，并且不返回可继续加载旧预览的有效入口地址

#### Scenario: 预览文件变化时状态版本变化
- **WHEN** 当前工作区 `workspace-files` 中参与预览的文件被创建、修改、删除或替换
- **THEN** 系统 SHALL 使后续预览状态查询返回不同于先前值的 `revision`

### Requirement: Builder 页面必须基于预览状态驱动左侧 iframe
系统 SHALL 在 builder 页面中基于当前工作区的预览状态决定左侧显示真实页面还是空状态，并且让预览加载指向当前工作区的真实入口。

#### Scenario: 存在预览时加载真实页面
- **WHEN** builder 页面获取到当前工作区 `hasPreview` 为真的预览状态
- **THEN** 系统 SHALL 在左侧预览面板中加载该工作区的真实 `entryUrl`，而不是继续停留在空白占位 iframe

#### Scenario: 不存在预览时显示空状态
- **WHEN** builder 页面获取到当前工作区 `hasPreview` 为假的预览状态
- **THEN** 系统 SHALL 在左侧预览面板中显示“预览尚未生成”的空状态，而不是继续显示过期页面

#### Scenario: 新窗口打开使用当前工作区预览入口
- **WHEN** 用户在 builder 左侧点击“新窗口打开”
- **THEN** 系统 SHALL 打开当前工作区最新的预览入口地址，而不是打开固定占位地址或旧 revision 地址

### Requirement: Builder 页面必须在预览变化后自动刷新
系统 SHALL 在 builder 页面挂载期间持续感知当前工作区的预览状态，并在预览版本发生变化时自动刷新左侧 iframe，而不要求用户手动点击刷新。

#### Scenario: 预览版本未变化时不触发自动重载
- **WHEN** builder 页面连续查询到相同的预览 `revision`
- **THEN** 系统 SHALL 保持当前 iframe 内容，不因重复状态查询而执行无意义的自动刷新

#### Scenario: 预览版本变化时自动刷新 iframe
- **WHEN** builder 页面查询到新的预览 `revision`
- **THEN** 系统 SHALL 自动重新加载左侧 iframe，使用户看到更新后的网页结果

#### Scenario: 预览版本变化时刷新地址带有新的缓存规避标识
- **WHEN** builder 页面因 `revision` 变化而重新加载预览页面
- **THEN** 系统 SHALL 使用带有新版本标识的预览地址加载 iframe，以避免继续命中旧缓存内容

### Requirement: page-builder 创建的工作区必须通过根目录 `CLAUDE.md` 约束可预览产物落点
系统 SHALL 在 page-builder 创建工作区时，于该工作区根目录初始化 `CLAUDE.md`，使可预览页面产物稳定落到当前工作区的 `workspace-files` 中，而不通过改写用户消息正文来传递这些约束。

#### Scenario: page-builder 创建工作区时初始化根目录 `CLAUDE.md`
- **WHEN** 用户通过 page-builder 首页创建一个新的项目工作区
- **THEN** 系统 SHALL 在该工作区根目录写入 `CLAUDE.md`
- **AND** 该文件 SHALL 作为该工作区下后续会话共享的项目级网页构建约束

#### Scenario: `CLAUDE.md` 要求入口与静态资源写入 `workspace-files`
- **WHEN** page-builder 创建的工作区中的 Agent 生成或修改可预览网页
- **THEN** 系统 SHALL 在该工作区的 `CLAUDE.md` 中明确约束页面入口写入 `workspace-files/index.html`
- **AND** 系统 SHALL 在该工作区的 `CLAUDE.md` 中明确约束静态资源写入 `workspace-files` 相对目录，而不是散落到 session cwd

#### Scenario: builder 页不通过改写用户消息正文注入 page-builder 约束
- **WHEN** 用户在 page-builder builder 页发送普通网页需求
- **THEN** 系统 SHALL 保持该次可见用户消息正文不被 page-builder 内部约束改写
- **AND** 这些工作区级约束 SHALL 通过根目录 `CLAUDE.md` 生效

#### Scenario: 非 page-builder 创建的工作区不自动写入 `CLAUDE.md`
- **WHEN** 用户通过通用工作区创建链路创建普通工作区
- **THEN** 系统 SHALL 不因为该工作区存在普通 Agent 会话就自动写入 page-builder 专属 `CLAUDE.md`
