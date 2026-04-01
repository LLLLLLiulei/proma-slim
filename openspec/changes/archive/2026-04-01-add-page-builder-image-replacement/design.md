## Context

当前 `page-builder` 已经具备三条与本次需求直接相关的基础能力：
- Builder 可以在左侧预览中选中单个区块，并通过 preview bridge 把当前选区的 `selector` 与锚定矩形回传给外层工作台。
- 已选区块下方已经存在锚定工具条，当前固定提供 `从 CMS 选择数据` 入口，说明“围绕已选区块挂接额外动作”这条交互路径已经成立。
- 主进程已经有一套基于 HTML 解析回写 `workspace-files/index.html` 的落盘模式，内联文字编辑也已经证明“preview bridge -> renderer API -> main writeback -> preview revision 刷新”这条链路可行。

但工具条当前仍只覆盖“选区 + CMS”与“选区 + 文本微调”这两类操作。对于“把当前页面中的某张现有图片替换成用户本地图片”这种明确、局部、确定性的修改，用户仍需要回到对话流重新描述需求，路径过长。

这个需求的关键难点不在“文件上传”本身，而在两个边界：
- 如何稳定判断当前已选区块是否支持图片替换，以及到底替换哪一张图片。
- 如何让上传后的图片既成为 `workspace-files` 可预览资源，又能把 HTML 中对应 `<img>` 的 `src` 安全改写为新资源路径。

因此首版设计必须显式收敛范围：只支持静态 HTML 中能唯一映射到单个 `<img>` 的场景，不碰多图区块歧义、背景图、`picture/source` 集合或资源管理问题。

## Goals / Non-Goals

**Goals:**
- 在支持图片替换的已选区块工具条中展示 `替换图片` 按钮，而不影响现有 `从 CMS 选择数据` 行为。
- 让用户通过本地文件选择弹框选取单张图片，并限制文件类型为图片。
- 通过主进程上传与回写链路，把新图片写入当前工作区 `workspace-files` 可预览资源目录，并更新目标 `<img>` 的 `src`。
- 沿用现有 preview revision 机制，让替换完成后的预览显示新图片。
- 将“是否支持替换图片”的判断收敛为稳定、可测试的规则，而不是依赖宿主层猜测 iframe DOM。

**Non-Goals:**
- 不支持多图区块内的二次目标选择。
- 不支持 CSS `background-image`、`picture/source`、`srcset` 或运行时脚本动态生成的图片节点。
- 不支持客户端裁剪、压缩、拖拽排序、资源库管理或旧图片文件自动清理。
- 不绕过现有 preview revision 机制做 iframe 内即时 DOM patch。
- 不让工具条在不支持替换图片的区块上展示误导性的入口。

## Decisions

### Decision: 由 preview bridge 负责识别图片区块能力，并把能力元数据随选区一起回传

**Decision**
- preview bridge 在发出 `selected` 消息时，不再只回传 `selector` 和 `rect`，还要附带当前选区的能力元数据。
- 首版增加 `replaceImage` 能力描述，至少包含：
  - `supported`
  - `targetDescriptor`（支持时）
- `targetDescriptor` 采用与内联文字编辑相同思路的“块内确定性路径”模型，用于在目标区块内唯一定位 `<img>`。

**Rationale**
- 宿主侧 `PreviewPane`/`BuilderPage` 不应直接探测 iframe 内 DOM；能力判断最自然的落点是在已经运行于真实预览文档中的 bridge。
- 工具条未来很可能继续增加能力感知动作，把“当前选区支持什么”做成 bridge 输出的结构化元数据，后续扩展成本更低。
- 与其让 React 外层重复实现图片区块推断，不如让真正知道 DOM 结构的 bridge 一次性做判断并统一输出。

**Alternatives considered**
- 在 renderer 里直接读取 iframe DOM：职责边界差，且会让宿主层对沙箱预览内部结构形成强耦合。
- 固定让所有已选区块都显示 `替换图片`：用户会在不支持的区块上点到无效入口，反馈太差。

### Decision: 首版图片区块识别采用“选中元素本身是 `<img>` 或块内存在唯一 `<img>`”规则

**Decision**
- 当已选元素本身就是 `<img>` 时，直接视为支持图片替换。
- 当已选元素不是 `<img>`，但其内部恰好存在唯一一张 `<img>` 时，也视为支持图片替换，并把该 `<img>` 作为替换目标。
- 当已选区块内不存在图片，或存在多张图片时，bridge 不声明 `replaceImage` 能力。

**Rationale**
- 这条规则兼顾“点到图片本身”的精确场景和“点到图片卡片/图片区块”的自然场景，同时避开多图歧义。
- 相比只支持直接点中 `<img>`，唯一图片推断对用户更友好。
- 相比多图区块也强行显示入口，这个规则更稳定、更容易测试，也更符合首版范围控制。

**Alternatives considered**
- 仅允许选中 `<img>` 本身后替换：实现最简单，但用户必须点得非常精确。
- 多图区块也显示入口，点击后再二次选择图片：体验完整，但会把需求扩展成新的选择子流程。

### Decision: 文件选择和上传编排由 renderer 驱动，使用隐藏 file input 而不是桥接脚本直接触发

**Decision**
- `PageBuilderBlockActionBar` 只负责暴露 `替换图片` 动作。
- `PreviewPane` / `BuilderPage` 负责持有隐藏的 `input[type=file]`，设置 `accept="image/*"` 并处理文件选择结果。
- 用户取消文件选择时，系统直接 no-op，不改变当前预览或选区上下文。

**Rationale**
- 工具条本身就在宿主 React 树里，使用现有 renderer 文件选择模式最自然，也便于测试和错误处理。
- bridge 更适合处理 iframe 内点击与选区语义，不应承担本地文件访问入口。
- 上传状态、toast 反馈和后续 API 调用都已经属于宿主工作流，放在 renderer 更一致。

**Alternatives considered**
- 让 bridge 触发文件选择：实现绕路，职责不清。
- 用独立弹窗承载文件上传：对单一替换操作来说过重。

### Decision: 后端采用 multipart 上传接口，并在主进程同时完成资源落盘与 HTML `src` 回写

**Decision**
- 新增 page-builder 图片替换接口，形态为 `multipart/form-data`：
  - `payload`: JSON，包含 `selector` 与 `imageTargetDescriptor`
  - `file`: 单张图片文件
- 主进程负责：
  - 校验文件是图片
  - 生成稳定且避免缓存冲突的资源文件名
  - 将文件写入 `workspace-files/assets/...`
  - 解析 `workspace-files/index.html`
  - 基于 `selector + imageTargetDescriptor` 定位目标 `<img>` 并更新 `src`
  - 返回新的 preview state

**Rationale**
- 资源文件写入和 HTML 回写本质上是同一事务链路，拆成两个接口会增加中间态和失败恢复复杂度。
- `workspace-preview-service` 已经天然把 `workspace-files` 作为预览根目录，只要文件写入该目录，预览就能直接访问。
- 继续使用“选择器 + 描述符”的写回模式，能和内联文字编辑形成统一的持久化模型。

**Alternatives considered**
- 先上传文件，再单独发 HTML 更新请求：接口拆分后中间态复杂，失败恢复更差。
- 直接把图片转成 base64 写入 HTML：首版虽然能用，但会导致 HTML 膨胀且不利于后续资源管理。

### Decision: 图片替换后的预览一致性继续复用现有 revision 刷新机制，而不是在 iframe 内就地打补丁

**Decision**
- 成功替换图片后，系统通过现有 preview revision 机制让左侧预览重载并显示新图片。
- 首版不额外实现“只改 `<img src>` 但不重载 iframe”的局部预览补丁能力。
- 成功替换后的选区行为继续遵循现有“真实预览重载会使选区失效”的规则。

**Rationale**
- 现有 Builder 已经围绕 preview revision 建立了稳定的刷新链路，复用这条链路风险最低。
- 若为了保留选区而引入 iframe 内 DOM patch，会显著增加 bridge / renderer / main 三方同步复杂度。
- 首版的重点是让资源落盘与 HTML 引用稳定成立，而不是优化到“重载后保持完全连续的编辑上下文”。

**Alternatives considered**
- 保存成功后直接 patch iframe 中的 `<img src>`：视觉更平滑，但需要额外的宿主与 iframe 状态同步协议。
- 上传成功后不触发预览刷新：会让预览内容与 `workspace-files` 脱节。

## Risks / Trade-offs

- **[唯一图片识别规则对部分复杂卡片不够宽松]** → Mitigation: 首版坚持“唯一图片才支持”，先保证确定性；后续如果需要再单独设计多图区块子选择流程。
- **[浏览器缓存导致替换后仍命中旧图片]** → Mitigation: 生成新的目标文件名并更新 HTML `src`，避免复用原资源路径。
- **[上传文件 MIME 声称为图片但内容异常]** → Mitigation: 首版至少同时校验前端 `accept` 与后端 `content-type`，并在设计上预留后续增强文件嗅探的空间。
- **[真实预览重载后当前选区失效]** → Mitigation: 复用现有选区生命周期规则，首版接受该行为，并在后续如有强需求再单独优化“成功后保留上下文”。
- **[HTML 回写路径和 bridge 描述符不一致]** → Mitigation: 与内联文字编辑一样，共享块内目标定位的描述符思路，并通过针对直接 `<img>` 与唯一子 `<img>` 两类结构的测试兜底。

## Migration Plan

1. 扩展共享 preview bridge 消息类型，允许 `selected` 消息携带图片区块能力和图片目标描述符。
2. 在 preview bridge 中新增图片目标识别逻辑，按“直接 `<img>` / 唯一子 `<img>`”规则声明 `replaceImage` 能力。
3. 扩展区块工具条和 `PreviewPane`，使其按能力渲染 `替换图片` 按钮并接入本地文件选择。
4. 在 `BuilderPage` 和 renderer API 中补齐图片上传调用链路、上传中状态和错误反馈。
5. 在主进程新增图片上传与 HTML `img src` 回写服务，并将其挂到 page-builder 路由上。
6. 为 bridge、renderer、上传接口和 HTML 回写补充测试，并用真实 Builder 页面做一次图片替换烟测。

**Rollback**
- 可先移除工具条中的 `替换图片` 按钮与 renderer 上传入口，只保留现有 CMS 工具条和选区机制。
- 即使保留后端上传 / 回写服务，只要不从前端暴露入口，也不会影响现有 Builder 工作流。
- 若回写策略不稳定，可临时关闭 capability 暴露，让 bridge 不再声明 `replaceImage` 支持。

## Open Questions

- 首版是否需要为上传图片补一个统一的最大体积限制与用户提示文案？
- 成功替换后是否值得在后续迭代里优化为“保留当前选区并重新锚定工具条”？
