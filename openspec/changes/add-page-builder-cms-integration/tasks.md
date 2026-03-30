## 1. CMS backend foundation

- [x] 1.1 新增 page-builder 专用 CMS 运行时配置与共享类型定义，明确 `getConfigDir()/cms-settings.json` 的文件结构、`baseUrl/currentSite/zusid` 读取方式、统一错误模型以及 `channel-node` / `channel-children` / `content-item` / `content-list` 数据结构
- [x] 1.2 拆分实现 `cms-client`，统一封装只读服务账号访问、`Cookie: CurrentSite + ZUSID` 组装、浏览器兼容请求头注入、请求超时与基础错误处理
- [x] 1.3 拆分实现 `cms-normalizer`，把栏目、文章、图片、音频、视频、文件等原始响应归一化为 page-builder 可复用结构
- [x] 1.4 拆分实现 `cms-service`，提供栏目树查询、子栏目查询、基于 `catalogID + title` 的内容搜索、栏目内容列表，以及基于列表结果与 `extendJSON` 的首期内容详情归一化能力
- [x] 1.5 为受保护图片、文件及媒体资源补充服务端预览代理能力，优先支持 `preview/news/<relative-path>` 资源链路，确保前端选择器可在不暴露原始 CMS 凭证和受保护地址的前提下预览资源
- [x] 1.6 为页面生成链路补充资源导入能力，确保受保护资源可落到 `workspace-files/assets/` 并返回稳定的本地相对路径映射
- [x] 1.7 补充 CMS 服务端测试，覆盖栏目查询、内容查询、归一化、受保护资源代理、资源导入与异常回退行为

## 2. Agent runtime and interactive tools

- [x] 2.1 定义 `RequestCmsSelection` 的工具输入/输出契约，明确 selector、操作类型、允许的数据源类型、内容类型限制、多选能力与 `presentationHint`
- [x] 2.2 定义 `cms_list_channels`、`cms_get_channel_children`、`cms_search_contents`、`cms_list_channel_contents`、`cms_get_content_detail`、`cms_import_asset_to_workspace` 的共享 schema 与返回字段，并明确第一阶段 `cms_search_contents` 为栏目范围内标题搜索
- [x] 2.3 实现 page-builder 专用的 CMS 交互等待服务，复用现有 AskUser 风格的 pending 生命周期管理，支持工具触发、用户确认、用户取消、页面退出与会话清理
- [x] 2.4 为 page-builder 会话组装宿主托管的 in-process CMS 工具服务器，并把 `RequestCmsSelection` 与 `cms_*` 只读数据工具接入同一运行时入口
- [x] 2.5 更新 page-builder 运行时装配逻辑，仅对需要 CMS 数据源能力的 page-builder 会话注入宿主托管工具服务器，并保持 CMS 凭证仅存在于主进程
- [x] 2.6 更新 page-builder 工作区规则与模板说明，明确遇到 CMS 数据需求时优先调用 `RequestCmsSelection`，并约束导航/列表/媒体场景的数据源优先级
- [x] 2.7 补充 Agent 运行时测试，覆盖 CMS 工具注入、交互工具恢复、取消分支、凭证不泄露与普通工作区不受影响的行为

## 3. Builder CMS picker flow

- [x] 3.1 在 `apps/page-builder` 中新增独立的 CMS 选择器模态框组件骨架，保持与当前 Builder 页风格一致，并明确为模态框覆盖层而非抽屉模式
- [x] 3.2 为 CMS 选择器建立独立状态模型，支持栏目模式与内容模式切换，以及单条/列表两类选择语义
- [x] 3.3 接入栏目树浏览、栏目内标题搜索、内容类型筛选、结果卡片预览与加载/空态/错误态展示，并在未选栏目时明确限制内容搜索入口
- [x] 3.4 在 Builder 页接入手动“从 CMS 选择”入口，并与现有页面区块选择状态协同，确保不破坏当前左右分栏布局和共享对话框样式
- [x] 3.5 为 Builder 页增加 CMS 交互事件处理，使 Agent 调用 `RequestCmsSelection` 后能够自动打开同一个 CMS 选择器模态框，并在确认或取消后把结构化结果回传主进程
- [x] 3.6 补齐选择器确认、取消、关闭后的本地状态恢复逻辑，确保手动入口与 Agent 触发入口共用同一套组件与结果协议
- [x] 3.7 补充 Builder 页与 CMS 选择器测试，覆盖手动打开、Agent 触发打开、取消选择、确认选择、模态框关闭后的状态恢复与样式不回退

## 4. Message decoration and binding persistence

- [x] 4.1 定义归一化后的 CMS 选择结果到隐藏上下文的格式化协议，确保只注入确认后的最小结构化字段，不携带原始 CMS 响应或凭证信息
- [x] 4.2 扩展 page-builder 的消息装饰链路，使区块 `selector` 与 CMS 选择结果可共同注入 `composedUserMessage`，同时保持可见聊天正文不变
- [x] 4.3 在发送成功与失败链路中补齐 CMS 选择结果的一次性清理策略，确保成功后清空、失败后保留，且与现有区块选择行为一致
- [x] 4.4 新增工作区私有的轻量绑定元数据读写模块，定义绑定文件结构并记录页面区块与 CMS 数据源的绑定关系、渲染 hint、快照时间和导入资源路径
- [x] 4.5 将页面生成阶段的资源导入结果与绑定元数据串联，确保后续“重新从 CMS 同步”具备最小必要的来源与资产映射信息
- [x] 4.6 补充绑定与消息链路测试，覆盖隐藏上下文注入、成功/失败清理、轻量绑定持久化、聊天历史不污染和静态 HTML 不内嵌绑定元数据

## 5. End-to-end verification and docs

- [x] 5.1 更新相关 page-builder 模板、`CLAUDE.md` 规则与实现说明文档，明确 CMS 选择器、数据源类型、交互工具和快照 + 轻量绑定的行为边界
- [x] 5.2 记录与 CMS 实际接口契约相关的实现备注，包括 OpenAPI 导出地址与实际业务宿主的区别、`cms-settings.json` 本地配置约束、字段映射、媒体资源大小限制、导入失败回退策略和后续“重新从 CMS 同步”的扩展入口
- [ ] 5.3 完成一轮 page-builder CMS 生成链路回归，验证“选区块 -> 自然语言触发 CMS 选择 -> 确认数据源 -> 生成页面 -> 资源导入 -> 记录绑定”的完整流程
- [ ] 5.4 补充针对“导出静态页面不直接依赖 CMS 鉴权/内网”的专项验证，确认页面引用优先落在工作区本地资源或受控代理预览链路上
