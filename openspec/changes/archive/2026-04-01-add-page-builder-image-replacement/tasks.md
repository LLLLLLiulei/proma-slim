## 1. Preview capability contract

- [x] 1.1 扩展 page-builder preview bridge 共享消息与类型，补齐已选区块能力元数据和图片目标描述符契约
- [x] 1.2 更新 `page-builder-preview-bridge.js`，按“直接 `<img>` / 区块内唯一 `<img>`”规则识别图片替换能力并随选区一起回传
- [x] 1.3 确保选区切换、预览重载和选区清空时同步清理旧的图片替换能力状态，避免工具条保留失效入口

## 2. Renderer toolbar and picker workflow

- [x] 2.1 更新 `PageBuilderBlockActionBar` 与 `PreviewPane`，使区块工具条按能力渲染 `替换图片` 按钮并继续保留既有 CMS 入口
- [x] 2.2 在 `BuilderPage` 中接入隐藏图片文件选择器、取消选择 no-op、上传中状态和失败反馈
- [x] 2.3 在 renderer API 中新增 page-builder 图片替换 multipart 请求封装，并把成功返回接入现有 preview state / revision 同步链路

## 3. Workspace asset persistence

- [x] 3.1 新增 page-builder 图片替换上传接口，接收 `workspaceId`、区块 `selector`、图片目标描述符和单张图片文件
- [x] 3.2 实现图片替换服务：校验图片上传、写入 `workspace-files/assets` 可预览资源目录，并安全回写 `workspace-files/index.html` 中目标 `<img>` 的 `src`
- [x] 3.3 让成功替换后的资源写入与 HTML 更新纳入现有 preview revision 流程，保证 Builder 预览刷新后显示新图片

## 4. Verification

- [x] 4.1 为共享类型与 preview bridge 补充测试，覆盖图片区块识别、唯一 `<img>` 解析和失效状态清理
- [x] 4.2 为 `PreviewPane` / `BuilderPage` 补充测试，覆盖工具条条件渲染、文件选择取消、上传成功与失败反馈
- [x] 4.3 为图片替换接口与 HTML writeback service 补充测试，覆盖图片校验、目标歧义拒绝写入、资源落盘和 `img src` 更新
- [x] 4.4 使用真实 Builder 页面完成一次图片替换烟测，验证选中图片区块、上传本地图片并在预览中看到更新结果
