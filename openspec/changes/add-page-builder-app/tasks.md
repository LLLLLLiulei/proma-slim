## 1. App Scaffold And Shared Runtime Access

- [x] 1.1 创建 `apps/page-builder` 应用骨架，并补齐 `package.json`、`tsconfig`、`vite.config`、`tailwind` 与入口文件
- [x] 1.2 配置 `page-builder` 的双别名解析与 Tailwind 扫描范围，使其可以直接复用 `apps/app` 内部 renderer 模块和样式
- [x] 1.3 接入最小页面路由能力，支持首页 `/` 与 builder 路径 `/builder/:workspaceId/:sessionId`

## 2. Home Page Project Startup Flow

- [x] 2.1 实现首页轻标题与极简需求输入框，并复用现有输入组件的基础能力
- [x] 2.2 参考 `design-taste-frontend` 等相关前端设计 skill 细化首页视觉，但保持与现有输入框和对话体验一致的产品语言
- [x] 2.3 实现首页提交流程：创建“未命名项目”工作区、创建首个会话，并在成功后跳转到对应 builder 页面
- [x] 2.4 实现首页启动链路的失败处理，确保工作区创建成功但会话创建失败时可仅重试会话创建
- [x] 2.5 实现首页到 builder 的 bootstrap prompt 缓存写入，供 builder 首次初始化时消费

## 3. Builder Layout And Project Shell

- [x] 3.1 实现 builder 页紧凑双栏布局，替换 `apps/app` 现有侧边栏/页签工作台结构，并避免大圆角卡片化外观
- [x] 3.2 实现左侧精简预览面板，包含 iframe 容器、“全屏”和“新窗口打开”两个操作入口
- [x] 3.3 实现 builder 顶部项目标题条，展示当前工作区名称“未命名项目”并支持编辑工作区名

## 4. Embedded Agent Conversation Integration

- [x] 4.1 实现 builder 初始化层，加载当前工作区与会话并写入现有 Agent 相关 atom，满足嵌入式对话视图运行条件
- [x] 4.2 为现有 `AgentView` 增加 `page-builder` 嵌入所需的最小可配置能力，例如允许隐藏自身 header，由 builder 接管顶部项目区
- [x] 4.3 在 builder 右侧直接挂载现有 Agent 对话能力，确保消息列表、输入区、流式输出、停止生成和错误态均可正常工作，并保持样式统一
- [x] 4.4 实现首页首条需求在 builder 中的一次性自动发送，并在刷新或重新进入已有消息会话时避免重复发送

## 5. Verification

- [x] 5.1 为首页启动流和 builder 初始化链路补充测试，覆盖工作区/会话创建、失败回退与 bootstrap prompt 消费
- [x] 5.2 为 builder 项目标题语义和嵌入式对话行为补充测试，验证编辑工作区名不会误改会话标题且隐藏 header 后对话仍可正常运行
- [x] 5.3 运行 `page-builder` 相关构建或类型检查，并验证其不会破坏 `apps/app` 现有运行与界面行为
