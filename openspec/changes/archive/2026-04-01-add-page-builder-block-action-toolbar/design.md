## Context

`page-builder` 当前已经具备三项和本次变更直接相关的基础能力：

- `BuilderPage` 持有页面区块选择状态、选中 `selector`、消息装饰器和 `CmsBrowserDialog` 开关。
- `PreviewPane` 负责渲染 iframe 预览，并通过 `postMessage` 与注入到预览页中的 `page-builder-preview-bridge.js` 通信。
- CMS 浏览弹框已经可以独立打开并展示栏目 / 内容浏览界面。

当前交互仍然存在明显割裂：

- 手动 CMS 入口位于 composer 旁边，是“聊天作用域”的入口，而不是“区块作用域”的入口。
- 预览桥接目前只把 `selector` 回传给父层，不回传选中元素的位置，父层无法在 iframe 外稳定锚定区块级操作条。
- 已有区块选择能力本质上是“为下一条消息准备上下文”，而不是“围绕已选区块展开一组可视操作”。

本次设计需要在不改变现有 iframe sandbox、安全边界和双栏布局的前提下，把 CMS 手动主入口迁移到已选区块下方，并明确这只是 CMS 主流程的入口迁移，不处理确认后的自动应用、绑定持久化或模板渲染。

## Goals / Non-Goals

**Goals:**

- 移除 Builder 对话输入区旁边的 `浏览 CMS` 主入口。
- 保留现有“选择进行编辑 / 从页面中选择 / 已选区域”区块选择入口和消息装饰链路。
- 在用户选中预览区块后，于该区块下方显示一个锚定的浮动工具条。
- 在工具条中提供 `从 CMS 选择数据` 按钮，并点击后打开现有 `CmsBrowserDialog`。
- 扩展预览桥接协议，使父层可以随选中元素的位置变化稳定更新工具条位置。
- 为该入口迁移补齐相应的 Builder / Preview / bridge 测试覆盖。

**Non-Goals:**

- 不在本次变更中处理 CMS 选择确认后的自动应用、系统消息插入或 Agent 自动执行。
- 不在本次变更中定义 CMS 绑定模型、模板渲染模型或发布刷新机制。
- 不新增完整的区块编辑工具条；首版只包含一个 `从 CMS 选择数据` 动作。
- 不修改现有页面区块选择的“一次性 selector 注入下一条消息”核心行为。
- 不放宽 iframe `sandbox` 权限，也不让父页面直接访问 iframe DOM。

## Decisions

### 1. `BuilderPage` 继续作为选择状态和 CMS 弹框状态的唯一拥有者

`BuilderPage` 已经持有：

- `selectionActionState`
- `selectedSelector`
- `cmsBrowserOpen`
- `messageDecorator`

本次不改变这一点。`BuilderPage` 继续决定：

- 是否处于选区模式
- 当前是否已有选中区块
- 何时清空选区
- 何时打开或关闭 `CmsBrowserDialog`

变化仅在于：

- composer 动作区只保留“选择进行编辑”这组已有入口
- `浏览 CMS` 按钮被移除
- `PreviewPane` 新增一个“请求打开 CMS 弹框”的回调入口，由 `BuilderPage` 透传 `setCmsBrowserOpen(true)`

这样做的原因：

- 选区状态与消息装饰器本来就是 Builder 级协调状态，继续放在 `BuilderPage` 最自然。
- `CmsBrowserDialog` 已经由 `BuilderPage` 持有开关，复用现有状态比在 `PreviewPane` 内重新建一套更简单。

备选方案：

- 把 CMS 弹框状态下沉到 `PreviewPane`。缺点是会让预览组件承担本不属于它的业务编排责任。

### 2. 锚定工具条由父层 React 渲染，但宿主放在 `PreviewPane` 的 iframe 外层

本次不把工具条直接注入到 iframe 页面内部，而是在 `PreviewPane` 中新增一个覆盖于 iframe 之上的 React overlay host，并在其中渲染 `PageBuilderBlockActionBar`。

推荐结构：

```text
BuilderPage
  └─ PreviewPane
       ├─ iframe
       └─ overlay host
            └─ PageBuilderBlockActionBar
```

这样做的原因：

- 工具条仍属于 Builder UI，而不是用户页面内容的一部分。
- 可以直接复用现有 React 组件、按钮和弹框回调，不需要在 bridge 脚本中再造一套交互组件。
- 后续如果工具条新增其他动作，仍可沿用同一个 React 组件，而不把复杂交互压到桥接脚本里。

备选方案：

- 把工具条渲染在 iframe 内部。缺点是样式、交互、弹框联动和后续扩展都更难维护。
- 把工具条渲染在 `BuilderPage` 根层并做全局坐标换算。可行，但比直接由 `PreviewPane` 持有 overlay host 多一层容器坐标映射，复杂度更高。

### 3. 扩展 preview bridge 协议，在 `selected` 事件中同步锚定所需几何信息

当前共享协议只把 `selector` 回传给父层，无法支撑锚定 UI。为此需要扩展 [`page-builder-preview-selection.ts`](/Users/liu/Documents/work/learning/Proma/packages/shared/src/types/page-builder-preview-selection.ts) 中的 bridge message：

- `hover` 保持不变
- `selected` 新增 `rect`
- `reset` 保持不变

`rect` 至少包含：

- `top`
- `left`
- `right`
- `bottom`
- `width`
- `height`

其坐标系采用 iframe 视口内坐标，也就是 bridge 中 `element.getBoundingClientRect()` 的结果。

桥接脚本在以下时机发送 `selected`：

- 用户第一次点击选中区块时
- 当前已选区块因 iframe 内滚动、窗口 resize 或布局变化导致位置变化时

桥接脚本在以下情况发送 `reset`：

- 父层主动要求清空选区
- 当前选中元素已不再存在或无法再测量可用位置

这样做的原因：

- `PreviewPane` 已经是 bridge 消息接收方，补充 `rect` 后即可在本地 overlay host 中直接完成定位。
- 复用现有 `selected` 事件比新增一组单独的“geometry update”协议更简单。

备选方案：

- 父页面直接读取 iframe DOM 计算位置。会要求放宽 `sandbox` 权限，不符合当前约束。
- 新增单独的 anchor 消息类型。语义更细，但对当前最小需求来说收益不足。

### 4. `PreviewPane` 本地持有选中区块的锚定几何信息，并负责定位工具条

`PreviewPane` 在接收 bridge message 时做两件事：

- 继续通过 `onSelectionEvent` 向 `BuilderPage` 转发已有的 `hover / selected / reset` 事件，保持现有 selector 选择链路不变。
- 在组件内部额外维护一个轻量的 `selectedAnchorRect` 状态，用于控制 `PageBuilderBlockActionBar` 的显示和定位。

这意味着：

- `BuilderPage` 仍只关心 `selector`
- `PreviewPane` 关心 `selector + rect`

工具条定位规则采用“简单、稳定、可预测”的首版策略：

- 默认显示在目标区块下方
- 优先与目标区块左边缘对齐
- 位置需要 clamp 在预览容器内，避免被裁切
- 当下方空间不足时，翻转到区块上方
- 收到 `reset` 或没有可用 `rect` 时隐藏工具条

overlay host 使用 `pointer-events: none`，仅工具条本身启用点击，以避免遮挡 iframe 其他区域。

这样做的原因：

- `PreviewPane` 同时拥有 iframe 容器和 bridge 消息，是处理几何信息的最合适位置。
- 让 `BuilderPage` 不必知道具体坐标，避免它额外承担预览局部布局计算。

备选方案：

- 让 `BuilderPage` 保存 `rect` 并再传回 `PreviewPane`。可行，但会把纯预览局部几何状态提升到页面级，增加不必要的耦合。

### 5. 选中区块后允许直接切换到另一个区块，工具条跟随移动

Module 1 不新增“区块锁定”状态。现有行为已经支持“最近一次选中覆盖前一次选中”，本次保持该模型：

- `selected` 状态下再次在预览中选中其他区块
- 当前 `selectedSelector` 更新为最新值
- 工具条位置更新到最新区块

点击工具条按钮打开 CMS 弹框时，不额外清空当前选区。弹框关闭后，用户仍处于“已选区域”状态，便于继续围绕该区块操作。

这样做的原因：

- 这和现有 `page-builder-preview-block-selection` 的“单次选择仅保留一个当前目标”能力保持一致。
- 首版只迁移入口，不需要为“弹框打开时是否冻结区块切换”增加额外状态复杂度。

备选方案：

- 在打开 CMS 弹框后锁定区块选择。可减少潜在歧义，但会引入新的中间状态；当前 modal 打开时用户本就很难继续点到预览，不值得先为此加复杂度。

### 6. 测试策略以“入口迁移 + 锚定更新 + 现有选择不回归”为主

本次设计会同步调整三类测试：

- `BuilderPage` 测试：
  - 删除 composer 中 `浏览 CMS` 按钮存在的断言
  - 保留已有“选择进行编辑”流程断言
  - 新增“来自 `PreviewPane` 的区块级操作请求可以打开 `CmsBrowserDialog`”断言
- `PreviewPane` 测试：
  - 新增收到 `selected + rect` 后渲染工具条
  - 新增收到后续位置更新时工具条随之移动
  - 新增 `reset` 后工具条隐藏
  - 新增点击工具条按钮触发父层回调
- bridge / shared type 测试：
  - 覆盖扩展后的 `selected` message 结构和几何同步行为

这样做的原因：

- Module 1 的核心风险不在 CMS 数据本身，而在“入口确实迁走了”“工具条位置能跟得上”“现有选区链路没有被破坏”。

## Risks / Trade-offs

- [Risk] bridge 发送位置更新过于频繁，可能造成父层频繁重渲染
  → Mitigation: 仅在 `selectedElement` 存在时同步位置，并在 bridge 侧比较上一次已发送的 `selector + rect`，无变化时不重复发送。

- [Risk] 预览中某些区块位置过于靠边，工具条可能超出可视区域
  → Mitigation: 在 `PreviewPane` 内对横向与纵向位置做 clamp，并支持上下翻转。

- [Risk] 选中元素被页面脚本替换或移除后，父层继续展示旧位置工具条
  → Mitigation: bridge 在无法继续解析或测量已选元素时主动发送 `reset`，让父层和 `PreviewPane` 一起清空工具条与选区状态。

- [Risk] 入口从 composer 移除后，用户短期内可能不习惯新的 CMS 打开路径
  → Mitigation: 保留现有“选择进行编辑”入口和已选高亮反馈，使“先选区块，再操作”路径足够明显。

- [Risk] `PreviewPane` 同时持有选择消息转发和工具条局部状态，职责变多
  → Mitigation: 将锚定 UI 抽成独立的 `PageBuilderBlockActionBar` 组件，`PreviewPane` 只负责桥接与局部定位，不处理 CMS 业务逻辑。

## Migration Plan

1. 扩展共享 preview bridge message 类型，为 `selected` 增加锚定所需的 `rect` 结构。
2. 修改 `page-builder-preview-bridge.js`，在初次选中和后续位置变化时同步 `selected + rect`，在元素失效时发送 `reset`。
3. 在 `PreviewPane` 中增加 overlay host、本地 `selectedAnchorRect` 状态以及 `PageBuilderBlockActionBar` 渲染逻辑。
4. 在 `BuilderPage` 中移除 composer 侧 `浏览 CMS` 按钮，并把“打开 CMS 弹框”回调传给 `PreviewPane`。
5. 更新 Builder / Preview 相关单测，验证入口迁移和锚定行为。

回滚策略：

- 若新工具条出现兼容性问题，可先恢复 composer 侧 `浏览 CMS` 按钮并保留桥接协议扩展；这不会影响现有区块选择和消息装饰能力。

## Open Questions

- 当前没有阻塞 Module 1 实现的开放问题。
- 后续 Module 2 若需要让 CMS 弹框以“区块绑定模式”展示额外文案，可以直接复用本次新增的工具条入口，不需要重新设计锚定机制。
