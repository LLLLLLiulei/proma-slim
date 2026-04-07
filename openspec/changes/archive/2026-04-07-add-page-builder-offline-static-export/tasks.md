## 1. Shared Contracts And Export Paths

- [x] 1.1 在 `packages/shared` 中新增离线静态导出任务、阶段、结果摘要和 report 类型，供 main 与 renderer 共用
- [x] 1.2 在主进程新增 page-builder 导出根目录与任务目录 helper，统一 `staging/`、`package.zip`、`proma-export-report.json` 和 TTL 清理入口
- [x] 1.3 抽出预览与导出共享的资源引用分类辅助，覆盖 CMS URL 识别、`srcset`、HTML 属性资源和 CSS `url(...)` 解析
- [x] 1.4 为主进程接入 zip 打包依赖及其基础封装，避免依赖系统命令生成导出包

## 2. Export Core Services

- [x] 2.1 实现工作区级离线导出 job registry，管理任务生命周期，并限制同一工作区同一时刻仅存在一个活动导出任务
- [x] 2.2 实现 `workspace-files/` 到 staging 目录的复制与入口校验，在缺失 `workspace-files/index.html` 时拒绝创建导出任务
- [x] 2.3 实现 HTML/CSS 扫描与引用重写流水线，支持本地相对资源保留、远程样式表递归扫描和 unsupported runtime dependency 记录
- [x] 2.4 实现受限远程资源抓取器，区分 CMS 资源 `CmsGateway.fetchAsset()` 与通用 `http/https` 下载，并施加协议、地址、数量、体积、重定向和超时限制
- [x] 2.5 实现导出 report 生成、warning/critical failure 归类、zip 打包输出以及任务完成后的结果落盘

## 3. HTTP Routes And Renderer API

- [x] 3.1 在 `apps/app/src/main/http/routes/workspaces.ts` 中新增创建离线导出任务接口，并返回活动任务或创建结果
- [x] 3.2 在 `apps/app/src/main/http/routes/workspaces.ts` 中新增导出任务状态查询与静态包下载接口，并提供 attachment 响应头
- [x] 3.3 在 `apps/app/src/renderer/lib/api.ts` 中新增导出任务创建、状态轮询和下载地址获取方法，并统一错误翻译

## 4. Builder UI Integration

- [x] 4.1 更新 `PreviewPane` 顶部控制区，新增“导出静态包”按钮，并展示导出中的禁用态与阶段反馈
- [x] 4.2 在 `BuilderPage` 中接入导出任务创建、轮询、并发保护和完成后下载触发逻辑
- [x] 4.3 为 Builder 工作台补齐导出成功、失败和 warning 提示，在存在导出报告告警时明确提示用户查看 report

## 5. Verification

- [x] 5.1 为导出服务补充测试，覆盖 HTML/CSS 资源本地化、远程样式表嵌套资源、CMS 资源抓取、本地资源保留和 unsupported runtime dependency 记录
- [x] 5.2 为导出失败边界补充测试，覆盖关键渲染资源失败即任务失败、附件下载失败保留原始链接并记 warning、抓取预算或高风险地址拒绝
- [x] 5.3 为工作区导出路由和 renderer API 补充测试，覆盖任务创建、并发任务复用、状态查询、下载响应和入口缺失错误
- [x] 5.4 为 `PreviewPane` 与 `BuilderPage` 补充 renderer 测试，覆盖按钮状态、轮询反馈、下载触发和 warning 提示
