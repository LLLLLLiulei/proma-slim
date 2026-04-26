## ADDED Requirements

### Requirement: page-builder 运行时上下文必须在可用时暴露稳定的浏览器调试入口
系统 SHALL 在 page-builder 运行时已经具备可用 Playwright 访问能力时，为 Agent 暴露一个稳定的浏览器调试预览入口与最小运行时说明；该入口 MUST 优先隐藏本地开发与 Docker sidecar 的地址差异，而不是要求模型自行推断当前预览 URL 与访问方式。

#### Scenario: Docker sidecar Playwright 场景注入内部浏览器预览地址
- **WHEN** 当前 page-builder turn 使用 Docker sidecar 提供的 Playwright MCP，且内部预览 origin 与当前工作区预览入口都可用
- **THEN** 系统 SHALL 向运行时上下文注入一个可供 Playwright 直接访问的内部绝对预览地址
- **AND** 系统 SHALL 同时说明该运行时不得回退到 `file://` 工作区文件路径

#### Scenario: 本地开发 Playwright 场景注入浏览器可访问的绝对预览地址
- **WHEN** 当前 page-builder turn 使用本地开发环境中的 Playwright 访问能力，且当前请求 origin 与工作区预览入口都可用
- **THEN** 系统 SHALL 向运行时上下文注入一个基于当前可访问 app origin 解析得到的绝对预览地址
- **AND** 系统 SHALL NOT 让模型自行猜测 `localhost` 端口、协议或宿主地址

#### Scenario: 缺少稳定入口时省略浏览器预览地址
- **WHEN** 当前 page-builder turn 虽然可能存在页面预览，但系统无法稳定解析出浏览器可访问的预览绝对地址
- **THEN** 系统 SHALL 省略该浏览器预览地址字段
- **AND** 系统 SHALL NOT 通过提示词暗示模型自行拼接或猜测预览 URL

#### Scenario: 没有可用 Playwright 访问能力时不注入浏览器调试入口
- **WHEN** 当前 page-builder turn 不具备可用的 Playwright 访问能力
- **THEN** 系统 SHALL NOT 向运行时上下文注入浏览器调试预览入口
- **AND** 系统 SHALL NOT 误导模型在当前 turn 假设浏览器级诊断已经可用
