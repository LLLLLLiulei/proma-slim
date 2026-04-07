## Context

当前 `page-builder` 已经把专题页的真实产物收敛到了工作区 `workspace-files/`：
- `workspace-files/index.html` 是预览入口，相关静态资源约定写在 `workspace-files/` 下，通常是 `workspace-files/assets/`。
- Builder 左侧 iframe 通过 `workspace-preview-service` 直接读取这套文件，并用 `revision` 轮询驱动自动刷新。
- 文字内联编辑、图片区块替换、区块删除等能力也都已经证明“renderer 请求 -> main 解析/写回 `workspace-files` -> 预览刷新”这条链路成立。

但这套能力目前只解决了“在 Proma 内部生成与预览页面”，没有解决“交付给外部使用”的最后一步。直接把 `workspace-files/` 原样打包并不能满足本次目标，因为预览阶段会对 CMS 资源做代理 URL 改写，页面里也可能继续引用远程图片、样式、字体、音视频或下载附件；这些内容在脱离 Proma 后并不天然可离线使用。

本次变更真正要补的是一条独立于预览响应的“离线导出构建”流程：从当前工作区的原始页面产物生成一份可离线打开的静态包，同时把本次导出过程中未能本地化的依赖清晰暴露给用户。

## Goals / Non-Goals

**Goals:**
- 以当前工作区 `workspace-files/` 为事实来源，生成一份可脱离 Proma、解压后可直接打开的静态导出包。
- 保持导出构建对用户工作区无副作用：导出过程中对 HTML/CSS 的改写和远程资源下载只发生在临时 staging 副本中，不回写真实 `workspace-files/`。
- 支持本地化 HTML/CSS 中静态可分析的远程资源，包括常见图片、样式、字体、音视频、海报图、`srcset`、行内样式 `url(...)`、样式表 `url(...)` 以及附件型下载链接。
- 对导出结果生成结构化 report，区分“已本地化资源”“保留外链”“下载失败”“不支持的运行时依赖”。
- 在 Builder 左侧预览面板中提供项目级导出入口、导出中的状态反馈和导出完成后的下载动作。
- 为远程资源抓取增加预算和目标地址限制，避免导出能力变成新的 SSRF 或资源滥用入口。

**Non-Goals:**
- 不分析或执行 JS 运行时网络请求，不尝试捕获 `fetch/XHR`、动态 `import()` 或脚本运行后才暴露出来的资源。
- 不把导出扩展为通用站点镜像器，不递归抓取站外页面或整站依赖图。
- 不提供导出任务取消、断点续传、历史导出列表或跨应用重启恢复。
- 不在第一版中做发布部署、对象存储上传、版本管理或分享链接。
- 不对工作区中未被引用的本地文件做“可达性裁剪”；导出仍以完整 `workspace-files/` 为基础。

## Decisions

### Decision: 离线导出必须基于 `workspace-files/` staging 副本，而不是基于预览响应

**Decision**
- 导出服务从当前工作区 `workspace-files/` 复制出一个临时 staging 目录作为构建输入。
- 预览相关的响应层转换，例如 CMS 代理 URL 改写和 preview bridge 注入，不参与导出构建。
- 导出范围以整个 `workspace-files/` 为基础，再在 staging 副本中对 HTML/CSS 做资源本地化与引用重写。

**Rationale**
- `workspace-preview-service` 生成的 HTML 本身已经带有 Proma 内部预览语义，直接拿来导出会把 `/api/page-builder/cms/assets?...` 这类宿主代理地址带入结果，离线包无法使用。
- 整体复制 `workspace-files/` 能保留现有相对路径结构，也不会误删用户已经写入但暂时未被当前 `index.html` 引用的本地文件。
- 在 staging 目录里改写 HTML/CSS，可以保证导出构建失败时不会污染用户正在继续编辑的工作区。

**Alternatives considered**
- 直接导出预览响应：实现看起来更近，但会把代理 URL、预览桥接和宿主特有行为带进包里。
- 只导出“当前页面可达文件”：理论上包更小，但需要先做完整依赖图裁剪，风险高且容易误删本地文件。

### Decision: 导出采用工作区级异步任务模型，而不是单个阻塞式下载接口

**Decision**
- 新增工作区级导出任务接口，形态建议为：
  - `POST /api/workspaces/:workspaceId/page-builder/export-static-jobs`
  - `GET /api/workspaces/:workspaceId/page-builder/export-static-jobs/:jobId`
  - `GET /api/workspaces/:workspaceId/page-builder/export-static-jobs/:jobId/download`
- 导出任务状态至少包含：
  - `jobId`
  - `status: pending | running | completed | failed`
  - `phase: copying | scanning | downloading | packaging | completed`
  - `createdAt / updatedAt / expiresAt`
  - `reportSummary`
  - `downloadUrl`（仅完成时）
- 任务注册表先采用主进程内存态管理，不做跨重启恢复；同一工作区同一时刻只允许一个活动导出任务。

**Rationale**
- 导出过程可能包含较多远程资源下载与压缩打包，单个同步下载接口容易超时，也无法给 Builder UI 提供清晰的状态反馈。
- Builder 已经有基于轮询的预览状态刷新模式，前端对“发起任务后轮询状态”的模型并不陌生。
- 导出是短生命周期操作，用内存态任务模型即可满足第一版，不必提前引入持久化 job 表。

**Alternatives considered**
- 单个 `GET /export-static` 阻塞到 zip 完成后再返回：实现最短，但用户等待期间没有状态可见性，大包或慢资源会显著放大失败体验。
- 持久化任务到磁盘或数据库：更稳，但当前没有现成 job 基础设施，第一版为此增加复杂度收益不高。

### Decision: 导出临时文件存放在 Proma 配置目录下的专用导出根目录，而不是散落在工作区或 OS 临时目录

**Decision**
- 在 `getConfigDir()` 之下新增专用导出根目录，例如 `~/.proma/page-builder-exports/`。
- 每个导出任务使用独立子目录，内部至少包含：
  - `staging/`
  - `package.zip`
  - `proma-export-report.json`
- 任务完成或失败后按 TTL 清理；下载完成后若没有主动复用需求，也进入待清理状态。

**Rationale**
- 当前应用的附件、会话、工作区等持久数据都已经统一落在 `~/.proma/` 下，导出临时产物继续使用同一根目录最容易测试和治理。
- 这条路径可以通过 `PROMA_CONFIG_DIR` 在测试环境中稳定隔离，而 OS 临时目录虽然可用，但不利于和现有路径工具统一管理。
- 导出产物不应写进真实工作区，否则会污染用户项目目录。

**Alternatives considered**
- 直接写进工作区根目录：最直观，但会把导出构建过程和真实项目文件混在一起。
- 完全依赖 `tmpdir()`：可行，但会让路径治理、清理策略和测试隔离更分散。

### Decision: 资源本地化器只处理 HTML/CSS 静态可分析依赖，并复用现有 URL 分类思路

**Decision**
- 在 staging 目录中扫描所有 `.html` 文件和所有被 HTML 引用到的本地/远程样式表。
- 处理以下资源引用：
  - HTML 标签属性中的 `src` / `href` / `poster`
  - `srcset`
  - 行内 `style` 的 `url(...)`
  - `<style>` 中的 `url(...)`
  - 样式表中的 `url(...)`
  - 资源型下载链接 `<a href>`
- 本地相对路径资源保持不动；远程资源按分类处理：
  - CMS 资源：通过 `CmsGateway.fetchAsset()` 获取，复用当前 CMS 鉴权与源站校验能力
  - 普通远程静态资源：通过受限的通用 fetch 流程下载
- 所有成功下载的远程资源统一写入 `staging/assets/exported/`，并将 HTML/CSS 中的引用重写为相对路径。
- 对外部 `script[src]`、远程 `iframe[src]` 等运行时依赖不做本地化，但会记录到 report 的“unsupported runtime dependency” 中。

**Rationale**
- 这正好对应用户已接受的第一版边界：保证 HTML/CSS 静态可分析资源离线化，不承诺 JS 运行时请求。
- 当前 `workspace-preview-service` 已经有 CMS URL 识别、`srcset` 改写和 CSS `url(...)` 处理逻辑，本次应抽出共享的 URL 分类辅助，避免“预览代理”和“离线本地化”各自维护一套规则。
- 通过单独记录未处理的运行时依赖，可以让第一版仍然诚实地暴露离线完整性风险，而不是假装“导出成功就一定完全可用”。

**Alternatives considered**
- 使用 Playwright 真跑页面并抓取网络请求：覆盖面更大，但会把需求扩展成浏览器录制/回放级别，复杂度和不确定性都明显上升。
- 只把远程图片本地化，其余资源全部保留外链：实现更省，但对字体、样式、媒体和附件的离线体验改善太有限。

### Decision: 外部样式表也纳入导出图谱，并按“下载后继续扫描 CSS”处理嵌套资源

**Decision**
- 当 HTML 中引用远程样式表时，导出器先将该 CSS 下载到 staging，再把它作为新的 CSS 输入继续扫描 `url(...)` 依赖。
- 对 CSS 内部相对资源的解析，使用“原始 CSS 来源 URL”作为基准，而不是页面文件路径。
- 对本地样式表中的 `url(...)`，继续按 staging 文件实际所在路径解析相对资源。

**Rationale**
- 如果只下载远程 CSS 而不继续处理其字体、背景图等嵌套资源，页面离线后样式完整性仍然会明显受损。
- CSS 的相对 URL 解析基准与 HTML 不同，必须保留资源来源上下文，否则重写结果容易错误。

**Alternatives considered**
- 将外部样式表视为普通附件，不继续扫描：实现简单，但会在字体和背景图场景下很快失真。
- 完全禁止外部样式表：过于严格，会让很多已有页面无法导出。

### Decision: 渲染关键资源失败时任务失败；附件下载失败时保留原始链接并在 report 中告警

**Decision**
- 资源分为两类：
  - 渲染关键资源：样式表、字体、图片、`poster`、页面内直接使用的音视频资源、`srcset` 候选项等
  - 可选附件资源：资源型下载链接，例如 PDF、文档、压缩包等 `<a href>`
- 渲染关键资源下载失败时，导出任务整体失败，不生成“伪成功”的离线包。
- 可选附件下载失败时，允许导出继续完成：
  - 保留原始 `href`
  - 在 report 中记录 warning
  - 在任务状态摘要中对用户显式提示“导出完成但存在附件离线化告警”
- `proma-export-report.json` 既作为 zip 内部文件，也作为任务结果摘要的来源。

**Rationale**
- 如果样式、图片、字体等关键资源没有落地，所谓“可离线打开的完整静态包”就已经失去意义，应该明确失败。
- 对下载附件类链接，用户已经接受“允许导出并告警”的边界；保留原始链接比强行清空更能保留页面语义。
- report 作为一等产物，可以把“成功但有告警”和“真正失败”区分开来。

**Alternatives considered**
- 任意资源失败都阻断导出：最保守，但对包含外部附件的页面过于苛刻。
- 任意资源失败都继续导出：表面成功率高，但用户很难判断包到底还能不能用。

### Decision: Builder 入口放在预览面板头部，状态由 `BuilderPage` 统一编排

**Decision**
- 在 `PreviewPane` 顶部控制区增加 `导出静态包` 按钮，与现有 `刷新预览 / 全屏预览 / 新窗口打开预览` 形成同一组项目级动作。
- `PreviewPane` 只负责展示按钮、loading/disabled 状态和成功后的下载触发。
- `BuilderPage` 负责：
  - 发起导出任务
  - 轮询任务状态
  - 管理导出中的 UI 状态
  - 基于任务结果弹出 toast 或触发下载
- 导出按钮不进入区块工具条，也不绑定当前选区。

**Rationale**
- 导出是“整个页面”的动作，而不是围绕某个选中区块的局部操作，把它放到预览面板控制区更符合当前信息架构。
- `BuilderPage` 已经掌握当前 workspace/session、预览状态与全局 toast 反馈，最适合持有导出任务状态。

**Alternatives considered**
- 放到区块工具条：语义错误，会让用户误以为只导出当前区块。
- 放到 `ProjectTitleBar`：也合理，但当前顶部更偏项目身份语义，预览控制区更接近“导出当前成品”的心智。

### Decision: 通用远程资源抓取必须有明确的安全与预算限制

**Decision**
- 对非 CMS 远程资源，导出服务只允许 `http/https`。
- 通用抓取流程需限制：
  - 最大重定向次数
  - 单文件大小
  - 总下载体积
  - 资源总数
  - 单请求超时
- 目标地址必须拒绝 `localhost`、内网 IP、链路本地地址等高风险目的地。
- CMS 资源不走通用抓取器，而是继续走 `CmsGateway.fetchAsset()`，只允许来自已配置 CMS 基址的资源地址。

**Rationale**
- 页面内容由用户或 Agent 生成，导出服务如果无约束地抓取任意 URL，会天然带来 SSRF 与资源滥用风险。
- CMS 资源已经有现成的受控网关能力，应优先复用，而不是重新实现一套鉴权逻辑。

**Alternatives considered**
- 完全信任页面中的所有 URL：实现省事，但安全边界不可接受。
- 一律禁止导出任何外部资源：最安全，但与“完整静态包”的目标冲突。

### Decision: 使用主进程 zip 打包依赖生成最终压缩包，而不是依赖系统命令

**Decision**
- 在 `@proma/app` 主进程侧新增一个小型 zip 打包依赖，用它将 staging 目录写成最终 zip 文件。
- 下载接口直接返回该 zip 文件，并设置 `Content-Disposition: attachment`。

**Rationale**
- 当前仓库没有现成 zip 打包能力；依赖系统 `zip` 命令会让跨平台行为、部署环境和测试一致性都变差。
- 独立 zip 依赖更容易在单元测试中稳定验证打包结果和包内 report。

**Alternatives considered**
- 调系统 `zip` 命令：实现可能更快，但对运行环境有额外假设，不符合当前主进程自包含风格。
- 自行实现 zip 格式：收益极低，维护成本不合理。

## Risks / Trade-offs

- **[远程脚本或运行时依赖未被本地化，导致页面交互离线后不完整]** → Mitigation: 明确将其记录为 unsupported runtime dependency，并在 report 与任务完成提示中暴露风险。
- **[导出扫描与预览代理各自维护资源识别规则，后续出现能力漂移]** → Mitigation: 抽出共享的 URL 分类/识别辅助，让“预览代理改写”和“离线本地化”只在最终动作上分叉。
- **[远程资源体积过大导致导出耗时长或磁盘占用异常]** → Mitigation: 在抓取器中实施数量、体积、超时和重定向预算，并把超限视为明确错误而非无限等待。
- **[导出任务在应用重启后丢失]** → Mitigation: 第一版接受非持久化任务；Builder 侧对任务失联按失败处理，并允许用户重新发起导出。
- **[附件下载失败但仍允许导出，用户误以为所有链接都可离线]** → Mitigation: 将 warning 同时写入 zip 内 report 和 UI 提示，避免“静默降级”。
- **[外部样式表的相对资源解析错误导致字体或背景图丢失]** → Mitigation: 在导出器里显式保留每个 CSS 文件的来源上下文，并为远程 CSS + 嵌套 `url()` 补充测试。
- **[导出临时目录未及时清理导致配置目录膨胀]** → Mitigation: 为 job 目录设置统一 TTL，并在任务完成、下载完成和应用启动时执行惰性清理。

## Migration Plan

1. 在 `packages/shared` 中新增离线导出任务、导出状态摘要与 report 相关类型。
2. 在主进程新增导出根目录 helper、导出任务注册表和离线静态导出服务。
3. 抽出并复用当前预览服务中的 URL 分类/`srcset`/CSS `url(...)` 处理辅助，为离线导出和预览代理共同使用。
4. 实现 staging 复制、HTML/CSS 扫描、资源抓取、本地化改写、report 生成和 zip 打包链路。
5. 在 `workspaceRoutes` 下新增导出任务创建、状态查询和下载接口。
6. 扩展 renderer `api`，并在 `BuilderPage` / `PreviewPane` 中接入导出按钮、任务轮询、toast 与下载交互。
7. 增加测试：
   - 服务层：资源扫描、CMS 资源本地化、外部样式表嵌套资源、本地文件保留、附件 warning、critical failure
   - 路由层：任务创建、状态返回、下载 attachment
   - 前端：按钮状态、轮询、成功/失败反馈

**Rollback**
- 前端回滚时只需移除预览面板中的导出入口，即可使该能力对用户不可见。
- 后端回滚时可先下线导出任务路由和导出服务，不影响现有 `workspace-files` 预览与编辑链路。
- 即使保留共享的 URL 分类辅助，也不会改变现有预览行为，只要不启用新的离线导出调用链即可。

## Open Questions

- 通用远程资源抓取的首版预算阈值具体设为多少最合适，例如单文件大小、总下载体积、最大文件数与超时时间。
- zip 打包依赖的具体选择是使用更轻量的写入库还是功能更完整的归档库，这需要在实现阶段结合测试体验确定。
- UI 是否需要在下载开始前额外展示一份“本次导出 report 摘要”，还是只在完成 toast 与 zip 内 report 中暴露告警即可。
