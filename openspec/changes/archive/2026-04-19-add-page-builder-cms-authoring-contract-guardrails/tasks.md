## 1. Contract Foundation

- [x] 1.1 新增共享的 `CmsAuthoringContract` 定义，并覆盖当前支持的 CMS 组件、props、source mode、slot scope、字段白名单与禁止结构
- [x] 1.2 为 handoff / skills / prompts 提供从 `CmsAuthoringContract` 派生组件级 digest 或人类可读 reference 的统一出口
- [x] 1.3 为 contract 与其派生引用补充同步校验，防止字段名、props 或禁用结构再次漂移

## 2. Rendering And Apply Validation

- [x] 2.1 更新 CMS rendering core 的扫描、编译与 validation 逻辑，使其直接消费 canonical contract
- [x] 2.2 在 CMS 模板编译/校验阶段拦截未支持字段访问、未声明 slot 变量、危险标签与禁止结构
- [x] 2.3 更新 `apply_cms_binding` 的正式写入路径，在 mutation 前执行 contract 预检并返回结构化错误
- [x] 2.4 更新统一 HTML mutation pipeline，使所有阻断性 CMS authoring validation error 都 fail closed
- [x] 2.5 在新建或重绑 legacy CMS 标签时统一显式写出 `site-id`，同时保留旧页面读时兼容

## 3. Handoff And Skill Alignment

- [x] 3.1 更新 CMS 自动 handoff payload，注入组件级 contract digest 与当前作者态目标快照
- [x] 3.2 更新 `cms-binding-apply` skill、引用示例与执行约束，使其只使用 canonical contract 中存在的 props 和字段
- [x] 3.3 在 `cms-binding-apply` 中为 contract 违规场景返回 `incompatible` 或 `needs-clarification`，禁止继续进入 `ready`
- [x] 3.4 更新 `page-builder-guided-generation` 与相关默认 guidance，使其在处理已有 CMS 标签时只引用当前 contract

## 4. Guidance Cleanup And Regression Coverage

- [x] 4.1 归档或显式 supersede 已过时的 CMS 文档与示例，移除默认 guidance 对它们的依赖
- [x] 4.2 补充回归测试，覆盖 contract digest、字段白名单、预检失败、pipeline fail-closed 与 legacy `site-id` 升级
- [x] 4.3 补充面向 handoff / skill / apply 链路的集成测试，验证模型可见 guidance 与正式校验边界一致

## 5. Stability Follow-up

- [x] 5.1 扩展 canonical `CmsAuthoringContract`，为 `cms-catalog` / `cms-content` 字段补充类型、可选性、语义描述与推荐用法元信息
- [x] 5.2 更新 handoff digest、skills、examples 与同步测试，使模型可见 guidance 直接消费新的字段元信息，并修正可选字段示例
- [x] 5.3 补充 validator 对常见 Vue authoring 漏洞的诊断覆盖，例如 `v-for` 缺少 `:key`、可选 URL/图片字段守卫与其他高频坏模式
- [ ] 5.4 为 workspace preview 增加最近一次安全 CMS 作者态回退能力，避免临时无效源码直接把预览打成最终错误状态
- [ ] 5.5 收紧普通编辑链路与 turn 级 CMS guardrail 的协同，确保无效 CMS 作者态在失败回合后恢复为安全状态并反馈结构化错误
