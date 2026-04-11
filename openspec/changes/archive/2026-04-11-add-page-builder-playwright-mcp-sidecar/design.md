## Context

当前 `page-builder` 的默认工作区模板会把 `playwright` 持久化为 `stdio` MCP，并通过 `npx @playwright/mcp@latest --headless --browser chrome` 在 Agent 查询时由 `server` 所在环境本地拉起。与此同时，默认 Docker 部署只包含 `server` 与 `web` 两个服务，且 `server` 运行镜像以 Bun 为基线，并不提供 Node.js / npm / npx 运行时。这使 Docker 环境中的 page-builder 浏览器自动化能力与本地预览校验能力缺少稳定的默认实现。

仓库当前已经具备两个关键前提：

- `agent-orchestrator` 已支持把工作区 MCP 条目映射为 `stdio`、`http`、`sse` 三种 Claude Agent SDK `mcpServers`。
- `page-builder` 的 Docker 部署资产已经集中在 `build/` 下，并固定使用 `ai-page-builder` / `server` / `web` 的 Docker 可见命名。

因此，这次设计的重点不是重新设计 MCP 体系，而是在不破坏现有工作区持久化配置兼容性的前提下，为 Docker 部署补上一条稳定的 Playwright sidecar 路径，并把它限定为 page-builder 场景的运行时覆盖，同时保留“不启用 sidecar 也能运行 `server + web`”的部署路径。

还需要尊重以下约束：

- 不处理 `server-sequential-thinking` 的 Docker 运行时补齐。
- 不把 Docker 内部地址永久写入工作区 `mcp.json`，避免同一工作区在非 Docker 环境中失效。
- 对外访问入口仍然只能是 `web`，不额外暴露 Playwright sidecar 或 `server` 的宿主机端口。
- Playwright sidecar 需要能够访问 page-builder 的本地预览页，因此设计必须考虑容器网络内可达的绝对预览地址，而不仅是浏览器当前使用的相对路径。
- `@playwright/mcp` 对截图等文件写入路径存在 session 级 allowed roots 限制，因此方案既要保证 sidecar 有合法可写目录，也要保证这些产物能被 `server` 与宿主机读取。

## Goals / Non-Goals

**Goals:**

- 为 `page-builder` Docker Compose 资产增加可选的 Playwright MCP sidecar profile，并让 `server` 在启用时能通过内部网络稳定使用它。
- 保持工作区持久化 MCP 配置继续兼容本地直跑与非 Docker 场景，不把 sidecar 地址回写到工作区配置。
- 将 Docker 环境中的 `playwright` 接入收敛为 page-builder 查询时的运行时覆盖；当 sidecar 未启用时，避免退回到 Docker 容器内不可用的默认 stdio Playwright。
- 为需要访问本地预览的 page-builder 自动化流程提供容器内可达的绝对地址约定。
- 让 sidecar 在其允许写入的 session 目录中生成的截图等产物能够被 `server` 与宿主机直接读取或后续转移。
- 将变更控制在部署资产、运行时装配与必要提示上下文范围内，不扩展为新的浏览器编排产品能力。

**Non-Goals:**

- 不在本次变更中处理 `server-sequential-thinking`、Node.js 运行时补齐或其他非 Playwright 默认 MCP 的容器兼容问题。
- 不修改现有工作区模板中的 `playwright` 持久化定义为 `http://playwright:...` 之类的 Docker 内网地址。
- 不把 Playwright sidecar 对外暴露为用户可直接访问的宿主机服务。
- 不为普通工作区、非 page-builder 会话或通用 Agent 运行时默认启用该 sidecar。
- 不在本次设计中引入 Kubernetes、browser pool、会话级浏览器隔离或额外鉴权代理。
- 不在本次设计中引入对象存储、附件中转服务或额外的跨容器文件复制代理来传递 Playwright 自动化产物。

## Decisions

### 1. Docker 部署资产提供 `web + server` 基础拓扑，并通过可选 `playwright` profile 扩展为 `web + server + playwright`

compose 资产保留 `web` 与 `server` 作为基础部署；当操作者显式启用 `playwright` profile 时，再补充第三个服务：

- `web`: 对外暴露 page-builder Web 入口与 `/api` 同源代理
- `server`: 提供 API、SSE、Agent、工作区与预览文件能力
- `playwright`: 运行独立的 Playwright MCP HTTP 服务，供 `server` 通过内部网络访问

`playwright` 服务不映射宿主机端口，不作为用户可见入口，仅在启用 profile 时加入 compose 网络。

选择这一方案的原因：

- Playwright 官方已经提供适合长期运行的 MCP Docker 服务形态，使用单独 sidecar 比把浏览器及系统依赖重新塞进 `server` 镜像更符合容器职责划分。
- `server` 继续保持 Bun 主运行时，可以避免为了一个 MCP 服务把整套浏览器依赖和 Node 运行时耦合进后端镜像。
- 只保留 `web` 对外暴露，可维持现有 page-builder 部署的单入口体验，不扩大攻击面。
- sidecar 改为可选 profile 后，操作者可以明确决定是否部署 Playwright 自动化能力，而不是被默认 compose 强制拉起。

备选方案对比：

- 在 `server` 镜像内直接安装 Playwright 与浏览器依赖：兼容当前 `stdio` 设计，但会显著增加镜像体积，也无法解决“不要把浏览器能力耦合进后端容器”的部署边界问题。
- 让 `server` 容器内部再调用 `docker run` 拉起 Playwright MCP：被拒绝，因为会引入 Docker socket / Docker CLI 依赖，并恶化安全与运维边界。

### 2. 保持工作区持久化 `mcp.json` 不变，但要区分本地非 Docker 与 Docker 无 sidecar 两种无端点状态

现有 `page-builder` 模板中的 `playwright` 仍保持当前的持久化 `stdio` 配置，不修改 `apps/app/resources/templates/page-builder-workspace-mcp.json` 中的跨环境默认值。Docker 环境通过显式环境变量驱动，在 page-builder 查询构建 `mcpServers` 时，将名为 `playwright` 的默认工作区 MCP 解析为远程 HTTP MCP。

关键边界如下：

- 仅覆盖 page-builder 工作区里的默认 `playwright` 条目。
- 不改写工作区磁盘上的 `mcp.json`。
- 对普通工作区和用户自定义的其他 MCP 条目保持原样。
- 在本地非 Docker 环境中，若未提供 sidecar 地址，则继续按持久化的 `stdio playwright` 配置工作。
- 在 Docker 运行时中，若未提供 sidecar 地址，则去除默认 `playwright` runtime 注入，避免退回到容器内不可用的 `stdio + npx` 路径。

选择运行时覆盖而不是直接修改模板的原因：

- 当前工作区配置目录是持久化挂载到宿主机的，同一份工作区可能在 Docker 与非 Docker 环境之间复用。
- 一旦把 `http://playwright:8931/mcp` 这类 Docker 内网地址写进持久化配置，离开 compose 网络后该工作区就会失效。
- 运行时覆盖与现有 `workspace-scoped-agent-runtime` 中“宿主创建的 runtime MCP server 可与持久化 MCP 合并，但不得回写持久化配置”的模型一致。

备选方案对比：

- 直接把 page-builder 模板改成 HTTP MCP：被拒绝，因为会把 Docker 环境假设固化进持久化工作区文件。
- 对所有工作区统一注入 Playwright sidecar：被拒绝，因为本次只服务 page-builder 部署，不应扩大到全局运行时策略。

### 3. Docker 环境用显式环境变量声明运行时类别、Playwright sidecar 地址与预览内网 origin

`server` 服务新增两类部署输入：

- 内部 Docker 运行时标记，例如 `AI_PAGE_BUILDER_RUNTIME_ENV=docker`
- Playwright sidecar MCP 地址，例如 `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL=http://playwright:8931/mcp`
- page-builder 预览在容器网络中的绝对 origin，例如 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN=http://server:8888`

第一项用于让 `server` 区分“当前运行在 Docker 容器中，但 sidecar 可能未启用”；第二项用于让 `server` 在运行时装配远程 HTTP MCP；第三项用于把相对的工作区预览路径提升为 sidecar 可访问的绝对地址。后两者在 compose 中默认留空，仅在启用 sidecar 时配置，不进入工作区持久化配置。

选择显式环境变量而不是硬编码容器名的原因：

- Compose 在启用 sidecar 时可以继续使用 `playwright` / `server` 这些内部 DNS 名称，但显式变量便于未来替换为自定义网络地址、远程 Playwright 服务或非默认端口。
- 绝对 preview origin 是 sidecar 访问本地预览页的关键约束，单靠当前返回给浏览器的相对路径 `/api/workspaces/:id/preview/` 不足以让容器内 Playwright 自行推断访问地址。
- `AI_PAGE_BUILDER_RUNTIME_ENV` 则让运行时能区分“本地未配置 sidecar”和“Docker 中未部署 sidecar”，避免误伤本地默认 Playwright。
- 这类输入属于部署契约，应与 `AI_PAGE_BUILDER_*` 其他 Docker 可见变量保持一致。

备选方案对比：

- 在代码中写死 `http://playwright:8931/mcp` 与 `http://server:8888`：可工作，但会把 compose 默认网络结构硬编码进应用层。
- 继续只返回相对 preview URL，依赖 agent 自行猜测：被拒绝，因为 sidecar 无法稳定访问容器内本地预览。

### 6. 启用 sidecar 时让 `server` 与 `playwright` 共享同一份 page-builder 运行时存储

当启用 `playwright` profile 时，compose 让 `server` 与 `playwright` 同时挂载宿主机 `${HOME}/.ai-page-builder` 到容器内 `/home/bun/.ai-page-builder`。这份目录已经承载 page-builder 的工作区、会话与 SDK 配置，因此也作为 Playwright sidecar 产物的默认共享存储。

选择这一方案的原因：

- Playwright MCP 的截图保存路径必须落在当前 session 的 allowed roots 之下，而这些 roots 本就位于 page-builder 运行时目录中；沿用同一份目录可避免再引入第二套产物目录约定。
- 共享挂载后，sidecar 写入的截图、快照等文件可以立刻被 `server` 读取，宿主机也能直接检查同一份文件，便于 page-builder 的后续处理与运维排障。
- 这保持了“浏览器自动化运行时与 page-builder 持久化状态同域，但不对外暴露额外入口”的部署边界。

实现上的实际约束：

- Playwright sidecar 不能直接把截图写到任意工作区路径；它需要先写到 MCP 允许的 session 目录。
- 一旦文件写入共享目录中的 allowed root，`server` 或宿主机即可在同一共享存储中读取、校验或按需要移动到工作区其他位置。

备选方案对比：

- 保持 `playwright` 与 `server` 存储完全隔离，再通过附件上传或额外 API 回传截图：被拒绝，因为链路更绕，且宿主机无法直接查看 sidecar 产物。
- 单独再引入一块专用 artifact volume：可行，但第一版收益有限，且会增加 compose 资产与目录约定复杂度。

### 4. 首版 sidecar 优先复用本地已有的 Playwright jammy 基础镜像，并在容器内启动 `@playwright/mcp`

默认部署优先复用当前本地 Docker 环境已有的 `mcr.microsoft.com/playwright:v1.57.0-jammy` 作为 sidecar 基础镜像，并在容器内通过 `npx @playwright/mcp` 以 HTTP 模式启动 MCP 服务。首版浏览器基线接受该路径实际提供的 Playwright 浏览器能力，而不是继续要求与当前持久化模板中的 `chrome` 文案完全一致。

选择这一方案的原因：

- 当前本地环境已经具备该镜像，可直接复用，避免再额外引入新的 Playwright 专用镜像拉取与缓存成本。
- 该基础镜像已经包含 Playwright 所需浏览器、系统依赖以及 `node` / `npm` / `npx`，可以直接作为运行 `@playwright/mcp` 的 sidecar 基座。
- 当前变更的目标是让 Docker 默认部署稳定可用，而不是追求本地 `npx @playwright/mcp --browser chrome` 与容器 sidecar 的实现完全同构。
- 只要 agent 工具能力与 page-builder 预览校验闭环成立，首版使用该镜像承载 Playwright MCP 不会改变该功能的主要产品语义。

备选方案对比：

- 使用专门的 Playwright MCP 镜像：可行，但在当前本地环境已经具备可直接复用的 Playwright 基础镜像时收益有限。
- 自定义 sidecar 镜像去逼近 `chrome`：可行，但会增加镜像维护面，并延后第一版落地。
- 继续要求 `server` 本地拉起 `@playwright/mcp`：被拒绝，因为与 Docker 运行时现实不匹配。

### 5. page-builder 运行时需要显式向 agent 暴露“容器内可访问的预览地址”语义

当前工作区预览状态返回给浏览器的是相对路径，这对前端 iframe 足够，但对 sidecar 中的浏览器自动化不够。因此 page-builder 相关运行时上下文需要显式提供以下约定之一：

- 直接向 agent 注入当前工作区预览的绝对内网地址；或
- 至少注入可拼接绝对地址所需的内部 origin 与相对 preview path

本次设计倾向于保持现有浏览器 API 返回值不变，只在 page-builder agent 运行时上下文中增加内部访问语义，而不修改前端当前依赖的 `previewUrl` 数据结构。

原因如下：

- `previewUrl` 当前同时被首页历史、Builder 预览 iframe 等浏览器侧功能使用，改成内网绝对地址会破坏浏览器访问语义。
- sidecar 需要的是 agent 端可访问地址，而不是浏览器侧数据结构重定义。
- 运行时上下文补充比修改现有对外 API 更小、更安全。

备选方案对比：

- 直接修改 `/preview-state` 返回绝对 `http://server:8888/...`：被拒绝，因为浏览器端并不能直接访问 Compose 内网域名。
- 不提供任何补充信息：被拒绝，因为 agent 无法稳定操作本地预览。

## Risks / Trade-offs

- [Risk] 运行时覆盖逻辑若判断范围过宽，可能误伤用户自定义的 `playwright` MCP 配置，或把 Docker 无 sidecar 场景与本地非 Docker 场景混淆。  
  → Mitigation: 仅在 page-builder 工作区、Docker 环境变量显式存在、且命中默认 `playwright` 条目时才应用覆盖。

- [Risk] sidecar 通过 `mcr.microsoft.com/playwright:v1.57.0-jammy` + `npx @playwright/mcp` 运行时组装，浏览器实现与本地持久化模板中的 `chrome` 文案不完全一致。  
  → Mitigation: 在 spec 与文档中明确 Docker 默认部署优先复用现有 Playwright jammy 镜像，将浏览器实现完全对齐留作后续优化项。

- [Risk] sidecar 基础镜像版本与 `@playwright/mcp@latest` 包版本存在独立漂移。  
  → Mitigation: 第一版先优先复用本地已有镜像以降低部署摩擦；若后续出现兼容性问题，再单独收紧 MCP 包版本或切换到定制镜像。

- [Risk] sidecar 需要访问本地预览，若内部 origin 注入不完整或格式非法，agent 会出现“浏览器能看，自动化看不到”的分裂体验，甚至直接让 query 失败。  
  → Mitigation: 将内部 preview origin 作为部署级显式输入，并在运行时解析失败时降级为“不提供内部预览地址”，而不是抛出异常。

- [Risk] 新增第三个服务会提高 compose 资产复杂度，并引入额外健康检查与启动顺序要求。  
  → Mitigation: 将 sidecar 固定为内部服务，不增加用户可见入口；compose 默认值采用单一官方镜像与最少外部参数。

- [Risk] 共享 page-builder 运行时目录会让 sidecar 看到与 `server` 相同的宿主持久化内容，扩大容器间的文件可见范围。  
  → Mitigation: 仍保持 sidecar 仅在内部网络可见，并依赖 Playwright MCP 自身的 session allowed roots 约束实际写入范围，不额外暴露宿主机入口。

- [Risk] 如果忽略 Playwright MCP 的 allowed roots 约束，agent 可能尝试把截图直接写到工作区根目录而失败。  
  → Mitigation: 在运行时提示与验证流程中明确“先写入 sidecar 允许的 session 目录，再在共享存储中移动/消费”的约束。

- [Risk] 本次不处理 `server-sequential-thinking`，Docker 环境里仍可能保留另一个默认 stdio MCP 的兼容性缺口。  
  → Mitigation: 在设计与 spec 中明确其不在本次范围内，避免实现阶段顺带扩大变更面。

## Migration Plan

1. 在 `build/docker-compose.yml` 中增加可选 `playwright` profile，优先使用 `mcr.microsoft.com/playwright:v1.57.0-jammy` 作为基础镜像在容器内启动 `@playwright/mcp`，并为 `server` 声明 Docker 运行时标记与 sidecar 所需环境变量。
2. 在启用 `playwright` profile 时，让 `server` 与 `playwright` 共享同一份 page-builder 运行时目录，确保 Playwright sidecar 产物可被 `server` 与宿主机读取。
3. 为 Docker 部署模板补充新的 `AI_PAGE_BUILDER_*` 输入说明，使 `build/.env.example` 能表达“默认不启用 sidecar，启用后再提供 Playwright sidecar 与内部 preview origin”。
4. 在 `server` 的 page-builder 运行时 MCP 装配逻辑中，引入针对 `playwright` 的 Docker 环境覆盖与抑制分支：启用 sidecar 时将默认 `stdio` 条目映射为远程 HTTP MCP，未启用时抑制该 Docker runtime 注入。
5. 为 page-builder agent 运行时补充容器内可访问的预览地址语义，但不修改浏览器侧现有 `previewUrl` 接口，并在内部 origin 非法时降级为“无内部预览地址”。
6. 补充运行时与部署测试，覆盖 Docker 环境变量生效、本地非 Docker 保持默认 `stdio playwright`、Docker 无 sidecar 时去除该注入、持久化 `mcp.json` 不被改写，以及共享存储下截图产物可见等边界。
7. 回滚时移除 `playwright` profile、共享挂载与对应环境变量即可恢复当前 `server + web` 部署；工作区持久化配置无需回滚，因为本次不会修改磁盘上的 MCP 文件。

## Open Questions

- 无。当前实现已经通过 page-builder Agent 运行时动态上下文提供内部绝对预览地址，并在共享存储方案下完成了 Playwright 截图链路验证。
