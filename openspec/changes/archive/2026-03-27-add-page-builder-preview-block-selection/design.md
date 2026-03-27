## Context

`page-builder` 当前的 Builder 页由左侧 `PreviewPane` 和右侧复用的 `AgentView` 组成。预览通过 `apps/app/src/main/lib/workspace-preview-service.ts` 暴露的 `/api/workspaces/:id/preview/*` 静态入口提供，并在 `apps/page-builder/src/renderer/pages/BuilderPage.tsx` 中轮询 `preview-state` 以驱动 iframe 自动刷新。

当前实现已经具备两个对本次变更非常关键的基础能力：

- Builder 页已经集中持有预览 URL、刷新节奏和左右分栏状态，适合作为“选区模式”的状态拥有者。
- 共享 `AgentView` 已支持 `messageDecorator`，允许在不重写聊天页的前提下对最终发送给 Agent 的消息做轻量包装。

同时存在两个明确约束：

- 预览 iframe 当前使用 `sandbox="allow-forms allow-scripts"`，未启用 `allow-same-origin`。父页面不能直接读取 iframe DOM。
- 用户已明确要求保持当前 page-builder 的紧凑布局和现有对话框样式，不接受为了该能力重写 Builder 对话页。

因此，本次设计需要在“复用现有聊天 UI”和“不放宽 iframe 权限”之间找到一条最小改动路径。

## Goals / Non-Goals

**Goals:**

- 在 Builder 页右侧输入区增加“从页面中选择”入口，进入一次性的预览选区模式。
- 在左侧预览中支持 hover 高亮和 click 选中高亮，并将选中的区块转换为稳定的 `selector`。
- 将 `selector` 仅作为下一条消息的隐藏上下文发送给 Agent；发送成功后自动清空选区与注入状态。
- 当预览刷新、重载或退出选区模式时，立即失效当前高亮与选中状态，不做恢复。
- 最大限度复用现有 `BuilderPage`、`PreviewPane`、`AgentView` 和工作区预览服务。

**Non-Goals:**

- 不实现多选、框选、跨层级批量选择或历史选择记录。
- 不在预览刷新后恢复高亮或重新定位到上一次选中的区块。
- 不向 Agent 注入完整 HTML 片段、截图或额外结构化元数据，只注入 `selector` 与用户当前消息。
- 不改变现有 page-builder 的双栏基础布局，不为此功能引入新的预览渲染引擎。

## Decisions

### 1. 由 `BuilderPage` 统一持有“选区模式 + 当前选中 selector”状态

`BuilderPage` 将新增与区块选择相关的本地状态，例如：

- 选区按钮当前所处的三态：`idle` / `armed` / `selected`
- 当前 hover 的区块信息
- 当前已选中的区块信息
- 当前预览 revision 对应的选择会话版本

`PreviewPane` 只负责渲染 iframe、转发预览消息和展示工具栏，不负责决定“下一条消息是否要带 selector”。右侧 `AgentView` 仍然是唯一的消息发送入口。

这样做的原因：

- `BuilderPage` 已同时拥有预览 URL、预览刷新状态和 `AgentView` 的嵌入点，天然适合作为跨面板协调层。
- 选区只对下一条消息生效，本质上是 Builder 级别的临时 UI 状态，不应下沉到全局 store。
- 用显式三态驱动按钮文案和预览可选性，比多个布尔值拼接更不容易出现“按钮文案和真实状态不一致”的问题。

备选方案：

- 把选区状态直接塞进 `PreviewPane`。缺点是发送消息后的清理逻辑会反向耦合到右侧聊天区域。
- 把选区状态做成全局 atom。缺点是作用域过大，容易影响普通会话页，不符合“仅 page-builder Builder 页生效”的要求。

### 2. 通过注入轻量桥接加载器 + 外部桥接资源 + `postMessage` 与 sandbox 预览通信

由于 iframe 没有 `allow-same-origin`，父页面不能直接操作预览 DOM。本次将保持现有 sandbox 不变，在工作区预览 HTML 响应中注入一个轻量 bridge loader，再由该 loader 加载服务端提供的外部桥接 JS 资源，使预览页在选区模式下自行完成：

- DOM hover 命中
- 高亮边框渲染
- click 选中
- 生成目标节点的 `selector`
- 将 hover / selected 事件通过 `window.parent.postMessage(...)` 上报给 Builder 页

父页面负责：

- 进入/退出选区模式时向 iframe `postMessage`
- 接收 hover / select / ready / reset 事件
- 在发送下一条消息或预览重载时触发 clear

视觉呈现上，预览内的高亮框采用直角描边，不使用圆角卡片样式；同时在当前 hover 或 selected 区块左上角渲染一个轻量标签，优先基于 `data-section` / `id` 命名，缺失时回退到 `Header2`、`Button`、`Section` 等通用区块名。这样用户在复杂页面中可以更快确认当前命中的区块语义，而不会把高亮框误解为页面自身设计的一部分。

这样做的原因：

- 不需要放宽 iframe 权限，保持当前预览安全边界。
- 桥接运行时代码独立为外部资源文件，便于维护、测试与缓存版本控制，同时避免继续把大量 JS 直接内联到 HTML 响应里。
- 只要 bridge loader 随 HTML 返回即可工作，不需要替换现有预览加载链路。

备选方案：

- 给 iframe 增加 `allow-same-origin` 后由父页面直接读 DOM。实现简单，但会改变现有安全模型，并增加宿主和预览的强耦合。
- 在预览内容中预埋 selection SDK。要求生成页面本身配合，不适合 page-builder 生成任意静态网页的场景。

### 3. 预览桥接只对 `template: 'page-builder'` 的 HTML 入口注入，并保持对普通静态文件透明

桥接注入放在 `workspace-preview-service` 一侧实现，但只对以下响应生效：

- 目标工作区 `template === 'page-builder'`
- 返回内容是 HTML 文档

CSS、JS、图片等静态资源继续按现有方式原样透传。HTML 文档在返回前只插入一个指向 `/api/page-builder/preview-bridge.js?v=<hash>` 的 bridge loader；实际桥接逻辑由该外部 JS 资源承载。

这样做的原因：

- 预览路由是现有唯一稳定入口，在这里注入最不需要改动 page-builder 产出的网页文件本身。
- 通过独立资源文件提供桥接逻辑，可用内容哈希驱动版本切换，减少 iframe 命中旧脚本缓存后的调试成本。
- 仅限 page-builder 工作区，可避免把选择桥接带到普通 Agent 工作区预览。

备选方案：

- 在生成网页时直接把 bridge 写入工作区文件。缺点是污染用户实际产物，也会让生成结果和运行时能力耦合。
- 在 `PreviewPane` 通过 URL 参数动态要求注入。仍需要服务端配合识别 HTML 并修改响应，本质复杂度更高。

### 4. `selector` 采用“优先稳定属性，回退结构路径”的单字符串策略

桥接脚本在用户点击节点时生成单个 `selector` 字符串，优先级建议如下：

- 节点已有语义明确且可能稳定的标识，如 `id`、显式 `data-*` 标记
- 较短且可读的 class 组合
- 必要时回退到带 `:nth-of-type()` 的层级路径

最终只把一个 selector 传回父页面，而不传 HTML 片段或节点文本快照。

这样做的原因：

- 用户已经明确要求只注入 `selector` 与当前消息，避免把提示词侵入做得过重。
- 单字符串最容易塞进现有消息装饰链路，也便于后续 Agent 在工作区内自行搜索或修改目标区域。

备选方案：

- 注入 outerHTML 或可见文本摘要。上下文更丰富，但会显著增加 prompt 噪音，并可能随着页面变化快速失效。
- 同时传多种 selector 候选。更鲁棒，但需要额外协议与消费逻辑，当前阶段收益不足。

### 5. 共享 `AgentView` 增加“底部左侧动作区”扩展点，而不是复制 page-builder 专用聊天组件

当前 `AgentView` 底部左侧已经承载附件按钮和提示文案。为保持复用，本次会为 `AgentView` 增加一个很小的扩展点，例如“composer leading actions slot”或同等能力，让 page-builder 在不改写消息列表和输入框主体的前提下，额外挂入“从页面中选择”按钮。

page-builder 只负责传入：

- 按钮文案与图标
- 当前是否处于选区模式
- 点击按钮后的模式切换行为

这样做的原因：

- 用户已经明确要求 Builder 页直接复用现有对话框和列表。
- 保持共享消息列表、附件、权限横幅、AskUser 横幅、输入框和发送逻辑不分叉。

备选方案：

- 在 Builder 页自己重组消息区与输入区。短期可行，但后续会偏离 `apps/app` 的共享能力，维护成本高。
- 把“从页面中选择”按钮塞到 `PreviewPane` 工具栏。交互路径不符合用户要求，且会弱化“选中后马上发消息”的连续性。

### 6. 通过 `messageDecorator` 注入下一条消息的隐藏上下文，并补一个发送成功后的清理回调

现有 `AgentView` 已支持 `messageDecorator(userMessage) => string`。page-builder 将继续利用这个入口，把当前选择包装为对 Agent 可消费的隐藏上下文，并只包含：

- 当前用户消息
- 当前选中的 `selector`

为了实现“只对下一条消息生效，发送后自动清除”，共享 `AgentView` 需要补充一个最小的发送生命周期回调，例如：

- 发送成功后通知宿主清空当前 selection
- 发送失败时保留当前 selection，便于用户重试

这样做的原因：

- 能复用现有消息发送主链路，不需要 page-builder 自己组装发送请求。
- “成功才清空、失败不清空”符合一次性上下文的预期，也能避免用户在失败后重新选区。

备选方案：

- 在调用发送前立即清空 selection。缺点是发送失败时上下文丢失。
- 完全在 `messageDecorator` 内部做一次性消费。由于缺少发送结果信号，无法区分成功和失败。

### 7. 预览刷新或 iframe 重建时直接清空选择状态，不做恢复

当前 Builder 页会根据 `preview-state.revision` 自动刷新 iframe，也支持手动刷新。每当 iframe URL 变化、`frameKey` 变化或桥接重新 ready 时，父页面都应主动将 hover/selected 状态重置为空，并退出当前 selection mode。

这样做的原因：

- 用户已明确说明刷新后的高亮恢复可不做。
- selector 本来就只保证在当前 DOM 生命周期内尽量可用，刷新后继续保留反而容易制造错误关联。

备选方案：

- 基于 selector 在新 DOM 中尝试重新命中。理论上更连续，但会引入额外失败态和错误高亮，不符合当前阶段目标。

## Risks / Trade-offs

- [Risk] 生成网页结构高度动态，自动生成的 selector 可能不够稳定
  → Mitigation: 优先使用 `id`/语义化 `data-*`，仅在缺失时回退到结构路径；并将作用域限定为“下一条消息”。

- [Risk] 某些网页可能通过全屏覆盖层、`pointer-events` 或自定义事件阻碍节点选择
  → Mitigation: 桥接在捕获阶段监听 pointer 事件，并在选区模式下阻止默认点击跳转。

- [Risk] 注入脚本修改 HTML 响应，可能对极少数依赖严格字节内容的页面产生影响
  → Mitigation: 仅对 page-builder 工作区的 HTML 文档注入，且注入内容保持最小；静态资源完全不改写。

- [Risk] 共享 `AgentView` 新增扩展点后，其他嵌入方可能误用
  → Mitigation: 扩展点保持可选且无 page-builder 传参时行为完全不变，并补充针对默认模式的回归测试。

- [Risk] 用户进入选区模式后忘记退出，可能误以为左侧预览“不能正常点击”
  → Mitigation: 进入选区模式后在按钮态与预览 hover 高亮上提供明显反馈；选中并成功发送后自动退出。

## Migration Plan

1. 为 `add-page-builder-preview-block-selection` 增加能力 spec，明确 Builder 入口、hover/selected 高亮、一次性消息注入和刷新清空行为。
2. 在共享 `AgentView` 中加入可选的 composer 动作扩展点和发送成功回调，保持默认调用方零改动。
3. 在 `BuilderPage` 与 `PreviewPane` 中接入选区模式状态、iframe 事件桥接和一次性 selector 注入。
4. 在 `workspace-preview-service` 中为 page-builder 工作区 HTML 响应注入 bridge loader，并由 `page-builder` 路由提供外部 bridge JS 资源，再补充对应服务端测试。
5. 补充 Builder 页、共享 `AgentView`、预览桥接消息协议的测试，再进入实现阶段。

回滚策略：

- 若功能上线后出现兼容性问题，可先关闭 page-builder HTML 注入分支并保留共享 `AgentView` 的扩展点，Builder 页会退回到现有纯文本对话流程。

## Open Questions

- 当前没有阻塞设计推进的开放问题。实现阶段若发现某些页面无法稳定生成可用 selector，再根据真实样例补充 selector 生成规则即可。
