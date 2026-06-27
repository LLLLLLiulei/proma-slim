## 1. Agent SDK env 解析

- [x] 1.1 在 `apps/app/src/main/lib/agent-runtime-env.ts` 中定义本期支持的 Agent SDK env 白名单与解析结果类型
- [x] 1.2 实现从 `process.env` 收集白名单变量的解析函数，并过滤空字符串
- [x] 1.3 实现 `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` 官方变量优先、`AI_PAGE_BUILDER_ANTHROPIC_*` 旧变量 fallback 的映射逻辑
- [x] 1.4 实现凭证检测逻辑，使 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN` 任一存在即可视为可发送
- [x] 1.5 实现本地开发 `.env.local` 对 Agent SDK 白名单变量和旧兼容变量的覆盖解析

## 2. Agent SDK 注入链路

- [x] 2.1 调整 `AgentOrchestrator.buildSdkEnv()`，避免隐式继承未知 `ANTHROPIC_*`、`CLAUDE_CODE_*` 与 `API_TIMEOUT_MS`
- [x] 2.2 将解析出的白名单 Agent SDK env 合并到 SDK `options.env`，并保留现有内部默认 `CLAUDE_CODE_*` 与 `CLAUDE_CONFIG_DIR` 控制
- [x] 2.3 调整发送前缺凭证判断和错误提示，使 auth token 场景不再被 API key 检查拦截
- [x] 2.4 调整同步到 `process.env` 的逻辑，确保 SDK `options.env` 与 SDK in-process 读取到的白名单 env 一致
- [x] 2.5 保持 `ClaudeAgentAdapter` 的 `settingSources: ['project']` 不变，确认不会加载用户级 Claude settings

## 3. Docker 与配置示例

- [x] 3.1 更新 `build/docker-compose.yml` 的 `server.environment`，显式声明本期支持的 Agent SDK env 白名单和旧 `AI_PAGE_BUILDER_ANTHROPIC_*` 变量
- [x] 3.2 更新 `build/docker-compose.release.yml` 的 `server.environment`，保持与默认 compose 一致的 Agent SDK env 注入语义
- [x] 3.3 移除 compose 中对 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 的强制必填展开，避免 auth token 场景启动失败
- [x] 3.4 更新 `build/.env.standalone.example` 与 `build/.env.cms.example`，加入 DeepSeek Agent SDK env 示例和旧变量兼容说明
- [x] 3.5 更新 `build/README.md` 中的大模型/Agent SDK 配置说明，明确不使用 `env_file` 且官方变量优先
- [x] 3.6 更新 Docker 启动脚本，在调用 compose 前清理宿主机 Agent SDK 同名变量，确保 `--env-file` 优先

## 4. 测试与验证

- [x] 4.1 补充 `agent-runtime-env` 单元测试，覆盖 auth token 凭证、官方变量优先、旧变量 fallback、未知变量不透传
- [x] 4.2 补充 `agent-orchestrator` 相关测试，验证白名单 env 进入 SDK query options 且缺凭证提示正确
- [x] 4.3 更新 Docker 资产测试，验证 compose/release compose 显式声明 Agent SDK env 且不再强制旧 API key
- [x] 4.4 运行相关测试文件，必要时运行 `bun test` 或聚焦测试命令确认变更稳定
- [x] 4.5 补充 env 文件覆盖和 Docker 启动脚本清理宿主变量的回归测试
