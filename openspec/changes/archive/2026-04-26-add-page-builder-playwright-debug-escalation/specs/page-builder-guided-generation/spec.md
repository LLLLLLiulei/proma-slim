## ADDED Requirements

### Requirement: 引导式专题页生成在页面问题排查中必须按需升级到真实预览诊断
系统 SHALL 让 `page-builder-guided-generation` 在 ordinary repair、ordinary iteration、selected-block follow-up 与重复反馈场景中，先基于当前预览源码和上下文做静态排查；当静态证据仍不足以稳定解释页面问题，或用户在修复后再次反馈页面仍然存在样式、布局、渲染或交互问题时，系统 MUST 在当前 turn 已提供 Playwright MCP 与稳定浏览器预览地址的前提下，升级为真实预览诊断后再继续修复。

#### Scenario: 静态证据已足够时不提前升级到 Playwright
- **WHEN** 当前 ordinary 页面问题能够仅凭 `workspace-files`、当前选择上下文与已有运行时信息被稳定解释
- **THEN** 系统 SHALL 继续先执行静态排查与修复
- **AND** 系统 SHALL NOT 因为用户提到“有问题”就默认先调用 Playwright

#### Scenario: 静态排查无法稳定解释页面问题时升级到真实预览诊断
- **WHEN** 当前 ordinary 页面问题在静态排查后仍无法被稳定解释，且当前 turn 已提供 Playwright MCP 与稳定浏览器预览地址
- **THEN** 系统 SHALL 调用 Playwright MCP 检查真实预览结果后再继续修复
- **AND** 系统 SHALL 保持 `page-builder-guided-generation` 作为该次请求的 owner

#### Scenario: 用户再次反馈页面仍有问题时升级到真实预览诊断
- **WHEN** 系统已对某个 ordinary 页面问题执行过一次修复，但用户在后续 turn 中再次反馈页面仍然存在样式、布局、渲染或交互问题
- **THEN** 系统 SHALL 将该反馈视为升级到真实预览诊断的强信号
- **AND** 在当前 turn 已提供 Playwright MCP 与稳定浏览器预览地址时，系统 SHALL 调用 Playwright MCP 检查真实预览结果后再继续修复

#### Scenario: 使用完 Playwright 后主动关闭浏览器诊断会话
- **WHEN** 系统已经通过 Playwright MCP 获取了完成当前页面问题诊断所需的真实预览证据
- **THEN** 系统 SHALL 在继续后续修复或结束当前回合前主动关闭当前 Playwright 页面、标签或浏览器诊断会话
- **AND** 系统 SHALL NOT 让该次诊断用的 Playwright 资源持续悬挂

#### Scenario: 缺少稳定浏览器入口时不猜测 URL 或安装浏览器运行时
- **WHEN** 当前 ordinary 页面问题需要浏览器级排查，但当前 turn 未提供稳定浏览器预览地址或未提供可用的 Playwright MCP
- **THEN** 系统 SHALL NOT 猜测浏览器访问 URL
- **AND** 系统 SHALL NOT 回退到 `file://` 工作区文件路径或尝试自行安装浏览器运行时
