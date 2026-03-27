## Why

`page-builder` 首页目前只承担新项目启动入口，已经创建过的项目缺少统一的返回入口。随着项目数量增加，用户无法在首页直接浏览、预览、继续编辑或删除历史项目，这会削弱 page-builder 作为独立产品入口的连续使用体验。

## What Changes

- 在 `page-builder` 首页现有对话框下方新增历史记录卡片区，用于展示所有 `page-builder` 项目。
- 历史记录必须拆分为独立组件开发，禁止把首页新增内容全部继续堆叠进现有首页单组件中。
- 首页现有启动对话框的样式与布局保持不变，历史记录只作为其下方的增量扩展区域出现。
- 历史记录区的视觉语言必须与首页现有风格保持一致，避免引入割裂的新卡片体系，并优先参考现有 `taste-skill` 的设计约束。
- 每张历史卡片使用 `iframe` 加载对应工作区当前的静态预览页，并在卡片底部展示工作区名称与创建时间。
- 鼠标悬浮卡片时显示 `预览`、`编辑`、`删除` 三个操作；其中 `预览` 打开当前预览页，`编辑` 进入该项目最近一次会话对应的 builder 页面。
- 为 page-builder 项目补充整项目删除链路，使首页 `删除` 可以级联移除该工作区、其下所有会话，以及该工作区内的 `workspace-files` 预览产物。
- 历史记录只展示 `template === 'page-builder'` 的工作区，并按项目最近活跃时间排序，而不是按工作区创建顺序平铺。

## Capabilities

### New Capabilities
- `page-builder-home-history`: 定义 page-builder 首页中的项目历史卡片区、iframe 预览、悬浮操作，以及 page-builder 项目的继续编辑与整项目删除行为。

### Modified Capabilities
- None.

## Impact

- Affected specs: new `page-builder-home-history` capability
- Affected frontend: `apps/page-builder` 首页页面、独立历史记录组件、相关增量样式与交互逻辑
- Affected backend: page-builder 项目历史查询所复用的 workspace/session/preview 数据链路，以及 page-builder 项目级联删除接口或服务
- Affected systems: page-builder 工作区恢复入口、预览入口复用、工作区及会话删除流程
