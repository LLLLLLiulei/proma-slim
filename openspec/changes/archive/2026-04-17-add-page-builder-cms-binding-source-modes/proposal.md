## Why

当前 page-builder 的 CMS 选择与应用链路只稳定支持“栏目查询式绑定”和“按单个栏目查询内容列表”两类来源语义，导致用户已经能在弹框里选中的“父栏目驱动的子栏目列表”“固定多个栏目”“按当前栏目渲染内容列表”“固定多个内容”这几类真实场景，无法被统一、稳定地交给 agent 与正式 runtime 落地。现在需要把 CMS 选择结果升级为可执行的数据来源模式，并让浏览弹框、handoff、skill、apply tool 与 runtime 对齐这一模型。

## What Changes

- 将 CMS 选择确认结果从当前偏 UI 的 `catalogs` / `contents-fixed` 语义，升级为面向执行的数据来源模式，明确区分：
  - `catalogs-by-parent`
  - `catalogs-by-ids`
  - `contents-by-catalog`
  - `contents-by-ids`
- 调整 CMS 浏览弹框的确认规则：
  - 栏目页签支持“仅选中当前栏目”作为父栏目来源确认；
  - 内容页签支持“仅选中当前栏目”作为内容列表来源确认；
  - 固定勾选栏目 / 内容时继续输出固定集合来源；
  - 当当前栏目下没有可用子栏目时，禁止确认父栏目来源模式。
- **BREAKING** 更新 CMS 自动 handoff 与 `cms-binding-apply` skill contract，使其基于新的 `sourceType` 决策，并将区块语义判断从“固定映射”升级为“由当前目标区块决定；不明确时发起一次短澄清”。
- 扩展 `apply_cms_binding` 与正式 runtime，使 `cms-catalog` 支持 `ids` 类固定集合来源、`cms-content` 支持 `catalog-id + ids` 的单栏目固定内容来源，并继续显式写出 `site-id`。
- 为 preview / static export / validator / manifest 管线补齐 `ids` 模式支持，确保作者态、预览态和静态化行为一致。
- 为宿主 CMS 读取链路补齐固定栏目 ID 与单栏目固定内容 ID 的受控取数能力，并明确禁止通过全量栏目树或整站内容列表退化实现 fixed-ids 绑定。
- 规定 fixed-ids 的失效处理策略：部分失效默认丢弃并保留剩余顺序，全部失效进入 empty，而不是阻断整块渲染。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-cms-selection-contract`: 将 CMS 选择结果升级为面向执行的四类来源模式，并明确 selected/checked 对应的确认语义。
- `page-builder-cms-browser-dialog`: 调整栏目页签与内容页签的确认规则、可确认条件和空态约束。
- `page-builder-cms-apply-skill`: 让 skill 基于新来源模式和目标区块语义做决策，并在区块意图不明确时仅发起一次短澄清。
- `page-builder-cms-auto-agent-handoff`: 让自动 handoff 传递新的选择结果协议与区块语义决策前提。
- `page-builder-cms-rendering-apply-tool`: 扩展正式 apply tool 支持 parent / ids 两类栏目来源和 catalog / ids 两类内容来源。
- `page-builder-cms-rendering-core`: 为 `cms-catalog` / `cms-content` 增加 fixed-ids 来源、稳定链接字段与失效项丢弃语义。
- `page-builder-cms-rendering-preview`: 让浏览器 preview 能通过宿主管理链路执行 fixed-ids 精确取数。
- `page-builder-cms-rendering-static-export`: 让静态导出 SSR 能按 fixed-ids 精确取数并保持和 preview 一致的降级行为。
- `page-builder-cms-rendering-manifest-validation`: 让 manifest/validator 识别 `ids` 等新 props，并更新 `cms-content` 必填来源约束。
- `page-builder-cms-sdk-tools`: 为宿主读取链路补齐 fixed-ids 精确查询能力，并明确禁止以全量加载退化实现。

## Impact

- Affected specs: `page-builder-cms-selection-contract`, `page-builder-cms-browser-dialog`, `page-builder-cms-apply-skill`, `page-builder-cms-auto-agent-handoff`, `page-builder-cms-rendering-apply-tool`, `page-builder-cms-rendering-core`, `page-builder-cms-rendering-preview`, `page-builder-cms-rendering-static-export`, `page-builder-cms-rendering-manifest-validation`, `page-builder-cms-sdk-tools`
- Affected code:
  - `packages/shared/src/types/page-builder-cms*.ts`
  - `apps/page-builder/src/renderer/components/builder/*`
  - `apps/page-builder/src/renderer/lib/cms-auto-agent-handoff.ts`
  - `apps/app/default-skills/cms-binding-apply/*`
  - `apps/app/src/main/lib/page-builder-cms-rendering-tools.ts`
  - `apps/app/src/main/lib/cms-gateway.ts`
  - `apps/app/src/main/http/routes/page-builder.ts`
  - `packages/page-builder-cms-rendering/src/**/*`
- Affected runtime behavior:
  - CMS 选择结果 contract version 将升级
  - `cms-catalog` / `cms-content` 作者态 props 集合将扩展
  - preview / export / validator / manifest 将识别并执行新的 fixed-ids 来源模式
