## Context

当前 page-builder 的 CMS 站点上下文由宿主配置 `siteID` 隐式决定：

- Builder 弹框只会读取一个固定站点下的栏目与内容，没有显式站点切换入口。
- `PageBuilderCmsSelectionResult`、自动 handoff payload、`cms-binding-apply` skill 输入和 `apply_cms_binding` 都不显式携带站点。
- `cms-catalog` / `cms-content` 组件、preview runtime、SSR 与 static export 也没有作者态的站点 props，只能依赖宿主固定站点配置。

这在多站点 CMS 场景下有三个问题：

1. 站点来源不可见。用户和 Agent 只能看到栏目 / 内容 ID，无法判断它们属于哪个站点。
2. 作者态源码不可迁移。相同的 HTML 放到不同宿主配置下会指向不同站点，源码本身不自描述。
3. 导出与运行时边界不清晰。preview / export 会继续受宿主静态 `siteID` 影响，而不是受作者态标签约束。

同时，仓库中已有 slim API 文档明确提供 `/api/sites` 站点列表能力，且 token 获取流程本身并不依赖 `siteID`。这使得“连接上下文由宿主管理、站点上下文由业务显式传入”的拆分成为可行方案。

## Goals / Non-Goals

**Goals:**

- 让 CMS 浏览弹框在栏目 / 内容页签前显式选择站点，并按站点范围加载后续数据。
- 让 CMS 选择结果、自动 handoff、skill 输入和 apply tool 都显式保留 `siteId`。
- 让 `cms-catalog` / `cms-content` 的作者态源码显式带上 `site-id`，并被 preview / export / SSR 一致消费。
- 移除 page-builder CMS 运行链路对宿主静态 `siteID` 配置的依赖，只保留 `baseUrl`、`username`、`password` 作为连接与鉴权上下文。
- 为旧页面提供兼容路径：当标签缺少 `site-id` 时，统一按 `siteId = 1` 处理。

**Non-Goals:**

- 不在本 change 中实现旧 HTML 的自动批量迁移工具。
- 不在本 change 中为普通对话型 Agent 工作流新增“浏览站点”交互；本次只覆盖 Builder CMS 浏览弹框与相关自动应用链路。
- 不在本 change 中为 workspace 记忆“上次所选站点”的持久化偏好；首版使用确定性默认规则。

## Decisions

### 1. 统一站点上下文命名：HTML 用 `site-id`，类型与 JSON 用 `siteId`，上游请求用 `siteID`

作者态 HTML 属性统一采用 kebab-case：

```html
<cms-catalog site-id="14" level="children" parent-id="3">...</cms-catalog>
<cms-content site-id="14" catalog-id="1035" page-size="6">...</cms-content>
```

而 shared types、selection result、tool input、runtime query 使用 `siteId`。只有真正请求上游 slim API 时，才映射为 query string 中的 `siteID`。

这样做的原因：

- 与现有 `catalog-id`、`parent-id` 等作者态属性命名保持一致。
- DOM 扫描、manifest 和 validator 已经围绕 kebab-case 属性设计；直接在 HTML 层使用 `siteID` 会引入大小写归一化与特判问题。
- TypeScript / JSON 层继续使用 `siteId`，便于与现有 shared types 和 query object 对齐。

备选方案：

- **直接在 HTML 中使用 `siteID`**：放弃。会让 DOM 属性名处理更脆，也不符合现有 CMS 标签作者态风格。

### 2. 宿主 CMS 配置模型去掉静态 `siteID`

page-builder CMS 宿主配置改为仅保留：

- `baseUrl`
- `username`
- `password`

静态 `siteID` 不再作为宿主配置的一部分，也不再作为 runtime 的隐式站点上下文。`CmsTokenProvider` 继续只依赖连接与鉴权材料，provider cache key 也应去掉 `siteID`。

这样做的原因：

- token 获取接口本身不依赖站点，保留静态 `siteID` 只会让连接上下文和业务上下文混在一起。
- 一旦作者态标签可以显式表达站点，继续保留宿主静态 `siteID` 只会制造双重真相来源。

备选方案：

- **保留宿主静态 `siteID` 作为默认站点**：放弃。会继续引入“源码未写站点但行为受宿主影响”的隐式耦合，不符合这次变更的目标。

### 3. 宿主 CMS 读取链路改为“显式站点 + 默认回退 1”

宿主需要新增站点列表读取能力，并让 CMS 读接口接受显式 `siteId`：

- `GET /api/page-builder/cms/sites`
- `GET /api/page-builder/cms/catalogs?siteId=...`
- `GET /api/page-builder/cms/catalogs/:catalogId?siteId=...`
- `GET /api/page-builder/cms/contents?siteId=...&catalogId=...`

宿主内部 `CmsGateway` 也改为按请求接收 `siteId`。当调用方或作者态标签没有显式提供 `siteId` 时，统一回退到 `1`。

这样做的原因：

- 兼容旧页面中的无站点标签。
- 避免在读链路里出现“有时来自标签、有时来自宿主配置”的双来源分叉。

备选方案：

- **对缺失 `siteId` 的请求直接报错**：放弃。与用户要求的“旧页面默认 1”不一致，也会让已有 HTML 无法预览和导出。

### 4. CMS 浏览弹框增加站点下拉框，并在切站点时重置站点范围内状态

弹框打开后先加载站点列表。站点下拉框位于 `栏目` / `内容` tabs 前，并遵循以下默认规则：

- 优先选中 `siteId = 1`，如果返回列表中存在该站点。
- 否则选中站点列表中的第一个可用站点。

切换站点时，必须清空并重新建立以下状态：

- 当前栏目选择
- 栏目勾选结果
- 内容勾选结果
- 栏目详情缓存
- 内容列表缓存
- 当前内容分页状态

这样做的原因：

- 栏目 ID、内容 ID 和详情缓存都具有站点边界，不能跨站点复用。
- 不引入 workspace 持久化“最近站点”状态，可以让首版实现保持简单、确定。

备选方案：

- **记住每个 workspace 的上次站点**：暂不做。用户未明确要求，且会引入额外本地存储与恢复逻辑。

### 5. 选择结果、自动 handoff、skill 输入和 apply tool 全链路显式携带 `siteId`

`PageBuilderCmsSelectionResult` 需要升版，并在顶层增加 `siteId`。自动 handoff 组装 `PageBuilderCmsApplySkillInput` 时，保留完整 `selection.siteId`。`cms-binding-apply` 的 `ready` 路径、`apply_cms_binding` 的 binding source，以及生成后的 `cms-*` 标签都必须携带显式站点。

这样做的原因：

- 让 CMS 站点与栏目 / 内容 / targetSelection 一起成为 durable payload，而不是由后续步骤再隐式推断。
- 避免 preview 中看见的是站点 A，实际 apply 时却写成站点 B 的情况。

备选方案：

- **仅在最终 `apply_cms_binding` 时追加 `siteId`**：放弃。这样 handoff / skill 决策阶段仍然无法知道当前绑定的站点。

### 6. 系统生成的新 CMS 标签始终显式写出 `site-id`，旧标签缺失时仅做运行时兼容

运行时兼容规则：

- 当旧页面中的 `<cms-catalog>` / `<cms-content>` 缺少 `site-id` 时，preview、SSR、static export 和 apply 读取默认按 `siteId = 1` 执行。

作者态生成规则：

- `apply_cms_binding` 和任何宿主生成的新 `cms-*` 标签都必须写出显式 `site-id`。

这样做的原因：

- 满足旧页面兼容性要求。
- 又能保证系统新生成的源码逐步收敛到显式、自描述的作者态结构。

备选方案：

- **新旧标签都允许继续隐式依赖宿主站点**：放弃。会让这次变更失去核心价值。

## Risks / Trade-offs

- **[旧页面在非 1 号站点上可能发生行为变化]** → 这是明确的 breaking change；通过 proposal、design、任务和测试显式记录，并要求后续通过重绑或源码更新补上 `site-id`。
- **[站点切换后缓存串用导致栏目/内容错站点]** → 所有缓存 key 和异步状态都必须纳入 `siteId` 维度，并在切换站点时清空站点范围内缓存。
- **[不同站点下相同 catalogId/contentId 导致 SSR 复用错误]** → runtime query contract 必须把 `siteId` 纳入浏览器和服务端缓存键；现有任务级 cache key 序列化已基于完整 query，可直接复用这一策略。
- **[host config 去掉 `siteID` 后，未覆盖的旧代码路径仍尝试读取它]** → 需要在 `CmsGateway`、`resolvePageBuilderCmsConfig`、token provider、routes、preview 和 static export 相关测试中成套清理并回归验证。

## Migration Plan

1. 将宿主 CMS 配置模型收敛为 `baseUrl + username + password`，并移除 page-builder runtime 对静态 `siteID` 的读取。
2. 引入 `/api/page-builder/cms/sites` 与显式 `siteId` 查询参数，完成 Builder 弹框与 renderer API 的站点选择链路。
3. 升级 `PageBuilderCmsSelectionResult`、自动 handoff payload、`cms-binding-apply` input 和 `apply_cms_binding` 生成逻辑，使新写入标签全部带 `site-id`。
4. 扩展 `packages/page-builder-cms-rendering` 的 props、query helper、template scan、manifest、validator、preview 与 SSR/export，使其按显式 `site-id` 或缺省值 `1` 运行。
5. 补齐回归测试，确认三类路径全部稳定：
   - 新写入标签显式带 `site-id`
   - 旧标签缺省 `site-id` 时统一回退到 `1`
   - 多站点页面中的不同 islands 不会相互串缓存或串站点

## Open Questions

- 当前不保留额外 open question。首版按“默认选中站点 1，否则选中第一个站点”的规则推进；如后续需要 workspace 级“最近使用站点”记忆，可在后续 change 中单独增加。
