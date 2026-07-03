## ADDED Requirements

### Requirement: CMS apply skill guidance must distinguish decision payloads, apply payloads, and generated source
系统 SHALL 让 `cms-binding-apply` 的主文案和 references 明确区分三类内容：传给 `mcp__cms__decide_cms_binding` 的结构化 `decision`、传给 `mcp__cms__apply_cms_binding` 的 slot inner template payload，以及工具执行后写入作者态 HTML 的完整 `cms-catalog` / `cms-content` 源码示例。默认 guidance MUST NOT 让模型把完整源码示例直接传入 `templateBody`、`emptyTemplate` 或 `errorTemplate`。

#### Scenario: Apply payload examples contain slot inner content only
- **WHEN** `cms-binding-apply` references 展示 `mcp__cms__apply_cms_binding` 调用示例
- **THEN** 示例 SHALL 只把 slot 内部内容放入 `templateBody`、`emptyTemplate` 与 `errorTemplate`
- **AND** 示例 SHALL NOT 在这些字段中包含外层 `cms-catalog`、`cms-content` 或整段最终作者态源码
- **AND** 如需展示完整作者态源码，文档 SHALL 明确标注该示例是工具执行后的输出形态，不是 tool input

#### Scenario: Slot scope guidance matches auto-generated wrapper behavior
- **WHEN** `cms-binding-apply` guidance 描述 slot scope
- **THEN** guidance SHALL 说明正式 apply 工具会自动生成 slot wrapper 并声明统一 scope `{ items, loading, error, empty }`
- **AND** guidance SHALL 指导模型在 slot inner content 中使用该 scope 的字段
- **AND** guidance SHALL NOT 要求模型在 `templateBody` 内重复声明外层 `v-slot` wrapper，除非明确说明该单层 wrapper 仅为兼容输入且会被自动解包

### Requirement: CMS apply skill decision examples must cover catalog-list without changing tool kind
系统 SHALL 在 `cms-binding-apply` 的 ready decision 示例中覆盖 `catalog-list` 目标语义，并明确栏目导航和栏目列表在当前 Phase 1A 中都由 `catalog-nav` 工具链承载；系统 MUST NOT 因目标是 `catalog-list` 就发明新的 `toolKind` 或 `mappingKind`。

#### Scenario: Catalog-list ready example uses catalog-nav tool chain
- **WHEN** `cms-binding-apply` 为栏目来源映射到 `catalog-list` 展示 ready decision 示例
- **THEN** 示例 SHALL 使用 `targetBlockKind: "catalog-list"`
- **AND** 示例 SHALL 使用 `mappingKind: "catalog-nav"`
- **AND** 示例 SHALL 使用 `toolKind: "catalog-nav"`
- **AND** 示例 SHALL 使用当前 selection 对应的合法 `source.siteId` 与栏目来源字段

#### Scenario: Unsupported catalog presentation asks for clarification instead of inventing schema
- **WHEN** 当前栏目来源可以落到 `nav` 或 `catalog-list`，但目标语义无法稳定判断
- **THEN** skill guidance SHALL 要求返回 `needs-clarification`
- **AND** skill guidance SHALL 禁止发明 `toolKind: "catalog-list"`、`mappingKind: "catalog-list"` 或其他 schema 不支持的枚举值
