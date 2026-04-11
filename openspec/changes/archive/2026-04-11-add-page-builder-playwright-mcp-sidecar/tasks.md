## 1. Docker Sidecar Assets

- [x] 1.1 更新 `build/docker-compose.yml`，增加可选 `playwright` profile，并为 `server` 注入 Docker 运行时标记与可外部覆盖的 Playwright / 内部预览输入。
- [x] 1.2 调整 `build/.env.example`，补充“按需启用 Playwright sidecar profile”以及内部预览 origin 的外部覆盖输入说明。
- [x] 1.3 让 `playwright` 服务优先基于 `mcr.microsoft.com/playwright:v1.57.0-jammy` 在容器内启动 `@playwright/mcp` HTTP 服务，并保持该 sidecar 不对宿主机暴露独立入口。

## 2. Runtime MCP Override

- [x] 2.1 在 page-builder 运行时装配链路中识别 Docker 环境提供的 `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL`，仅对 page-builder 工作区的默认 `playwright` 条目应用远程 HTTP MCP 覆盖。
- [x] 2.2 保证 Docker runtime 覆盖不会回写工作区持久化 `mcp.json`，且用户自定义的 `playwright` 配置继续按原配置生效。
- [x] 2.3 保持非 page-builder 工作区与本地非 Docker 场景的 MCP 装配行为不变；当 Docker 运行时未部署 sidecar 时，抑制默认 `playwright` 注入而不回退到容器内 `stdio` 路径。

## 3. Internal Preview Addressing

- [x] 3.1 为 page-builder Agent 运行时补充内部可达的预览访问语义，使 Docker runtime `playwright` 可获得当前工作区预览的绝对访问地址或等价的拼接输入。
- [x] 3.2 保持浏览器侧现有 `previewUrl` / `preview-state` 接口不变，避免把 compose 内网地址直接暴露给前端。
- [x] 3.3 在无可用预览或内部 preview origin 非法时保持 runtime `playwright` 可用，但不向 Agent 注入伪造或不可解析的内部预览地址。

## 4. Verification

- [x] 4.1 补充 `build` 相关测试或校验步骤，验证默认 compose 资产包含 `playwright` sidecar 且其运行时输入配置正确。
- [x] 4.2 补充 page-builder 运行时测试，覆盖默认 `playwright` 被 Docker 远程端点覆盖、用户自定义配置不被误伤、持久化 `mcp.json` 不被改写等边界。
- [x] 4.3 补充 page-builder 预览相关测试，覆盖 runtime `playwright` 在有预览与无预览两种情况下的内部访问语义。
- [x] 4.4 运行相关测试与必要的 Docker smoke check，确认 `web` 单入口、`server` 内网访问和 `playwright` sidecar 闭环成立。
  已验证本地非 Docker page-builder 继续保留默认持久化 `stdio playwright`；Docker 运行时在未启用 sidecar 时去除相关注入，启用 `playwright` profile 后可恢复远程 HTTP runtime sidecar。
  已验证 `docker compose up -d`、`docker compose --profile playwright up -d`、`docker compose ps`、`curl --noproxy '*' http://127.0.0.1:3333/`、`curl --noproxy '*' http://127.0.0.1:3333/api/workspaces`、`docker exec server` 访问 `playwright` sidecar，以及宿主机 `127.0.0.1:8931` 不可直连。
  额外验证了方案1共享存储：`server` 与 `playwright` 共享 `${HOME}/.ai-page-builder -> /home/bun/.ai-page-builder`，Playwright sidecar 生成的 `scheme1-shared-volume-smoke.png` 在 sidecar、`server` 与宿主机三边可见，SHA-256 一致为 `83b861092d6291db5467a53683be4bf61e3d027ff2979fc23ba2fb309b245c5c`。
  验证过程中确认 `@playwright/mcp` 文件写入受 session allowed roots 限制，截图需要先落在 sidecar 允许的 session 目录，再通过共享存储供 `server` 或宿主机读取/移动。
