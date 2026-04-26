## ADDED Requirements

### Requirement: page-builder bootstrapped owner contracts MUST remain turn-scoped and distinct from root `CLAUDE.md`
系统 SHALL 继续将 page-builder 中当前 turn 的 owner-controller / consult-only protocol 视为宿主显式注入的 turn-scoped contract，而不是根级 `CLAUDE.md` 的替代物。根级 `CLAUDE.md` SHALL 继续只承载工作区共享硬边界；当宿主已经决定某一轮的 owner 或 explicit consult guidance 时，系统 SHALL 继续通过 bootstrapped skill surfacing 或等价的 turn-level 显式机制使这些协议在当前 turn 生效。

#### Scenario: ordinary owner 仍通过 turn-scoped surfacing 生效
- **WHEN** 宿主已将某次 ordinary page-builder turn 的 owner 锁定为 `page-builder-guided-generation`
- **THEN** 系统 SHALL 继续通过 turn-scoped skill surfacing 让该 owner protocol 在当前 turn 中显式生效
- **AND** 系统 SHALL NOT 仅依赖根级 `CLAUDE.md` 取代该 owner protocol

#### Scenario: confirmed CMS apply owner 不被根级模板替代
- **WHEN** 宿主已将某次 confirmed CMS apply turn 的 owner 锁定为 `cms-binding-apply`
- **THEN** 系统 SHALL 继续通过 turn-scoped skill surfacing 让 `cms-binding-apply` 的 apply protocol 在当前 turn 中显式生效
- **AND** 系统 SHALL NOT 仅依赖根级 `CLAUDE.md` 或 workspace skill 目录存在性来替代该 apply protocol

#### Scenario: explicit existing CMS target guidance 仍通过 turn-level surfacing 激活
- **WHEN** 宿主已识别一次 explicit existing CMS target ordinary edit，并决定为当前 owner 附带 `page-builder-cms-region-authoring-guidance`
- **THEN** 系统 SHALL 继续通过 turn-level surfacing 明确激活该 consult-only capability
- **AND** 系统 SHALL NOT 将“根级 `CLAUDE.md` 已经描述 CMS 边界”视为当前 guidance 已充分激活的替代条件

### Requirement: page-builder visual workers MUST publish a top-level page-builder execution override
系统 SHALL 要求 `taste-skill` 与 `redesign-skill` 在 page-builder 场景中暴露显式的 page-builder execution override，使其在当前工作区中先遵守 execute-only 角色、`workspace-files` 输出目标、HTML-first 作者态和 CMS 高层安全边界，再决定是否进入更通用的前端设计规范；这些 workers SHALL NOT 在 page-builder 中默认假设存在 React、Next.js、Tailwind、`package.json` 或 npm 依赖环境，除非当前明确目标已经提供了对应工程上下文。

#### Scenario: visual worker 在 page-builder 中默认采用 HTML 预览页目标
- **WHEN** `taste-skill` 或 `redesign-skill` 被用于 page-builder 的整页生成、整页提质或 block 级视觉执行
- **THEN** 该 worker SHALL 先把当前目标视为 `workspace-files/index.html` 及其关联预览资源
- **AND** 该 worker SHALL NOT 仅因自身通用文案包含 app/framework 规范就默认转入 React / Next.js 工程输出模式

#### Scenario: visual worker 不默认要求 package manager 或前端框架依赖
- **WHEN** `taste-skill` 或 `redesign-skill` 在 page-builder 中开始执行，而当前目标没有提供现成的 React / Next.js / Tailwind 工程上下文
- **THEN** 该 worker SHALL 默认采用 plain HTML / CSS / JS 作者态
- **AND** 该 worker SHALL NOT 先要求检查 `package.json`、输出 `npm install` 指令或引入框架级依赖

#### Scenario: visual worker 在 page-builder 中继承 CMS 高层边界
- **WHEN** `taste-skill` 或 `redesign-skill` 在 page-builder 中执行，且当前页面已经包含现有 CMS regions
- **THEN** 该 worker SHALL 继承 page-builder 的 HTML-first 与 CMS islands 边界
- **AND** 该 worker SHALL NOT 引入 page-wide Vue runtime、Vue CDN、Vue importmap 或 `createApp` / `mount`
- **AND** 该 worker SHALL NOT 将当前页面默认理解为可自由重绑 `cms-*` 的通用前端工程
