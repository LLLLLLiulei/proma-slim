## 1. CMS tool error formatting layer

- [x] 1.1 在 `apps/app/src/main/lib/cms-sdk-tools.ts` 中提炼统一的 CMS tool 错误分类与 plain-text 格式化 helper。
- [x] 1.2 为高频错误类别补齐恢复路径映射，包括输入校验失败、handoff 失效/不匹配、decision 失效/已消费、apply 上下文缺失、模板/结构校验失败，以及上游 CMS 鉴权或网关失败。
- [x] 1.3 为未分类异常提供默认兜底错误文案，确保输出仍包含失败摘要、下一步动作与禁止行为，并保持脱敏。

## 2. CMS runtime tool integration

- [x] 2.1 将统一错误格式化层接入 `mcp__cms__list_catalogs` 与 `mcp__cms__list_contents`，确保读取类失败返回可执行指引。
- [x] 2.2 将统一错误格式化层接入 `mcp__cms__decide_cms_binding`，确保 handoff 相关失败明确要求重新获取上下文而不是直接 apply。
- [x] 2.3 将统一错误格式化层接入 `mcp__cms__apply_cms_binding`，确保 decision、revision、模板与上游失败明确区分恢复路径。

## 3. Verification

- [x] 3.1 在 `apps/app/src/main/lib/cms-sdk-tools.test.ts` 中为读取类工具补充错误指引测试，覆盖输入校验失败与上游鉴权/网关失败。
- [x] 3.2 在 `apps/app/src/main/lib/cms-sdk-tools.test.ts` 中为 `decide_cms_binding` 补充 handoff 缺失、过期和上下文不匹配的错误指引测试。
- [x] 3.3 在 `apps/app/src/main/lib/cms-sdk-tools.test.ts` 中为 `apply_cms_binding` 补充 decision 失效、作者态上下文缺失、模板/结构失败与默认兜底错误测试。
