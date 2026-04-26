## ADDED Requirements

### Requirement: `page-builder-guided-generation` MUST keep its prompt text owner-centric and delegate shared workspace laws outward
系统 SHALL 让 `page-builder-guided-generation` 的主文案聚焦于 ordinary owner 协议：包括关键澄清、最终确认、覆盖确认、worker 分派和 ordinary CMS boundary；共享工作区法律，例如输出目录、普通用户语气、scratch/source-of-truth 说明、共享 AskUserQuestion 边界与 CMS 高层安全边界，SHALL 主要由根级 `CLAUDE.md` 与更高层 prompt surface 承担，而不得在主控 skill 中继续展开成长篇重复规则。

#### Scenario: 主控 skill 不再重复 shared workspace output law 的完整手册
- **WHEN** 系统维护 `page-builder-guided-generation` 的主文案
- **THEN** 该文案 SHALL 只保留生成阶段所需的最小输出提醒
- **AND** 该文案 SHALL NOT 继续承担完整的 `workspace-files` 目录结构、scratch 目录性质和普通用户工作台说明手册

#### Scenario: 主控 skill 的普通交互协议继续完整保留
- **WHEN** 系统维护 `page-builder-guided-generation` 的主文案
- **THEN** 该文案 SHALL 继续保留关键提问、最终确认、覆盖确认、one-question-at-a-time 与 worker dispatch 等 owner-only protocol
- **AND** 系统 SHALL NOT 为了压缩共享边界而削弱该 owner 的控制协议

#### Scenario: 主控 skill 的 CMS 段保持 lightweight boundary 而非重复 specialist 手册
- **WHEN** 系统维护 `page-builder-guided-generation` 中与 CMS 相关的主文案
- **THEN** 该段 SHALL 只保留 ordinary flow 需要长期稳定生效的高层边界
- **AND** 该段 SHALL NOT 继续重复 existing-region consult guidance 的组件级 digest、长示例或 confirmed apply checklist

### Requirement: `page-builder-guided-generation` dispatched visual workers MUST inherit page-builder execution constraints
系统 SHALL 在 `page-builder-guided-generation` 调度 `taste-skill` 或 `redesign-skill` 时，确保这些 visual workers 继承当前 page-builder 工作区的执行边界：默认输出到 `workspace-files`，默认作者态是 plain HTML / CSS / JS，保持 HTML-first，并遵守现有 CMS regions 的高层边界；该调度链路 SHALL NOT 让 visual worker 仅凭通用 skill 文案重新退回 React / Next.js / Tailwind / package-manager 假设。

#### Scenario: 主控调度首轮视觉 worker 时继承 page-builder 输出边界
- **WHEN** `page-builder-guided-generation` 在 ordinary create 或 first-pass redesign 阶段调度 `taste-skill`
- **THEN** 系统 SHALL 让该 worker 继承当前 page-builder 的 `workspace-files` 输出目标
- **AND** 系统 SHALL 让该 worker 默认采用 plain HTML / CSS / JS 作者态，除非当前目标已明确提供其他工程上下文

#### Scenario: 主控调度二阶段精修 worker 时继承 HTML-first 与 CMS 边界
- **WHEN** `page-builder-guided-generation` 在已有方向基础上调度 `redesign-skill` 做第二阶段提质
- **THEN** 系统 SHALL 让该 worker 继续遵守 HTML-first 作者态与现有 CMS 高层边界
- **AND** 系统 SHALL NOT 让该 worker 因自身通用默认规则而引入 page-wide Vue runtime 或通用前端工程假设

#### Scenario: worker 通用文案与 page-builder override 冲突时以 page-builder 边界为准
- **WHEN** `taste-skill` 或 `redesign-skill` 的通用前端规范与当前 page-builder 工作区边界发生冲突
- **THEN** 系统 SHALL 以 page-builder execution override 为优先
- **AND** 系统 SHALL NOT 让通用 app/framework 规范覆盖当前 ordinary owner 已确认的 page-builder 作者态模型
