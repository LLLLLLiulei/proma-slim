## Why

`page-builder` 已经具备通过宿主 CMS SDK tools 读取栏目与内容数据的能力，但 Builder 工作台里仍缺少一个可视化浏览入口，用户无法直接查看 CMS 栏目树和栏目下的内容列表。先补齐只读的 CMS 浏览弹框，可以在不引入内容填充和绑定逻辑的前提下，验证前端交互、数据链路和页面工作流是否成立。

## What Changes

- 在 `page-builder` Builder 页右侧 Agent/composer 操作区域新增“浏览 CMS”入口按钮，与现有页面区块选择入口并列展示
- 新增只读 CMS 浏览弹框，使用两个页签承载 CMS 数据浏览：
  - `栏目` 页签展示栏目树
  - `内容` 页签展示左侧栏目树与右侧该栏目下的内容列表
- 为 `page-builder` 补充面向弹框浏览场景的 CMS HTTP 读取接口，复用宿主侧现有 `CmsGateway` 与归一化 CMS 数据模型
- 在首版范围内明确不处理内容确认选择、页面区域填充、block 绑定持久化、搜索筛选或批量操作
- 为栏目树与弹框壳层引入所需的前端依赖，并保持与当前 `page-builder` Radix/Tailwind 组件风格一致

## Capabilities

### New Capabilities
- `page-builder-cms-browser-dialog`: `page-builder` Builder 页提供一个只读的 CMS 浏览弹框，使用户可以在不离开当前对话工作台的情况下查看栏目树和栏目内容列表

### Modified Capabilities
无。

## Impact

- `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
- `apps/page-builder/src/renderer/components/` 下新增 CMS 浏览弹框、栏目树、内容列表相关组件
- `apps/page-builder/package.json` 中新增弹框 / 页签 / 栏目树依赖
- `apps/app/src/main/http/routes/page-builder.ts` 及相关 `page-builder` HTTP client
- 继续复用 `apps/app/src/main/lib/cms-gateway.ts` 提供的 CMS 归一化读取能力
- 后续需要为弹框打开、栏目加载、内容加载、空态和错误态补充测试
