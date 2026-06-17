## Why

PageBuilder 已具备用户模板 registry、当前项目另存模板和模板实例化为新项目的后端能力，但首页仍只能通过 prompt 创建项目或查看历史记录。为了让用户真正复用已保存模板，需要在 standalone 首页补齐模板库 UI，并把“预览、使用模板、删除模板”和现有历史记录并列呈现。

## What Changes

- 在 PageBuilder standalone 首页输入框下方新增“模板库 / 历史记录”资源区 Tab，默认打开“模板库”。
- 新增首页模板库列表，展示用户模板名称和预览效果，不在卡片中展示描述或标签。
- 支持模板库 loading、empty、error、retry 状态；无模板时引导用户先在 Builder 中另存模板。
- 支持卡片内 iframe 预览和新窗口打开模板预览，均使用模板自身 `previewUrl`。
- 支持点击“使用模板”后输入项目名称，再调用模板实例化 API，并在当前窗口跳转到新 Builder 项目。
- 使用模板成功后写入 workspace preview state cache，并确保不写 bootstrap prompt、不触发 Agent 首轮消息。
- 支持删除用户模板，删除前二次确认，删除成功后更新模板列表，删除失败展示明确反馈。
- 保留历史记录现有预览、编辑、删除能力，历史记录作为 Tab 内容接入，不重写其业务语义。
- CMS 集成模式下不展示 standalone 模板库；仅在现有 dev standalone bypass 启用时按 standalone 行为展示。

## Capabilities

### New Capabilities

- `page-builder-home-template-library`: 定义 PageBuilder standalone 首页模板库 Tab、模板列表状态、预览、使用模板跳转、删除用户模板、CMS 模式隐藏和历史记录不回退的用户可见行为。

### Modified Capabilities

- `page-builder-home-history`: 调整首页历史记录展示契约，将历史记录从 standalone 首页的直接区域改为资源 Tabs 中的“历史记录”Tab，并保持历史记录原有预览、编辑、删除语义不回退。

## Impact

- 前端 API：扩展 `apps/app/src/renderer/lib/api.ts`，新增模板列表、详情、使用和删除 API wrapper。
- 首页页面：调整 `apps/page-builder/src/renderer/pages/HomePage.tsx`，将 standalone 下原历史记录区域替换为资源 Tabs。
- 首页组件：新增模板库 hook、资源 Tabs、模板库 section 和模板卡片组件。
- Session storage：使用模板成功后调用现有 bootstrap cache 和 preview state cache 能力，保证 Builder 首屏直接展示模板页面且不自动发送 prompt。
- 路由与预览：复用 `buildBuilderPath`、`getPageBuilderPublicBasePath` 和 `openUrlInNewWindow`。
- 测试：补充 renderer API、HomePage、模板库组件/hook 测试，并回归历史记录现有行为。
