## 1. Preview bridge inline editing protocol

- [x] 1.1 扩展 page-builder preview bridge 的共享消息与类型，补齐可编辑文本热点、活动编辑态和失焦保存所需的数据契约
- [x] 1.2 更新 `page-builder-preview-bridge.js`，仅在当前已选区块内识别可稳定回写的简单文本热点，并阻止未选区块进入内联编辑
- [x] 1.3 在 `page-builder-preview-bridge.js` 中实现单击进入编辑、链接/按钮默认行为拦截、单一活动编辑态与选区切换/预览重载时的编辑清理

## 2. Renderer editing workflow

- [x] 2.1 在 `PreviewPane` 中接入文本热点编辑事件与保存请求分发，保持现有区块选中状态继续作为编辑作用域
- [x] 2.2 在 `BuilderPage` 中新增 inline text save 调用链路，处理保存中的状态同步、成功后的预览一致性以及失败反馈
- [x] 2.3 确保内联文字编辑不伪造聊天消息，且成功保存后无需重新选中同一区块即可继续编辑其他受支持文本热点

## 3. Workspace HTML persistence

- [x] 3.1 新增 page-builder 内联文字保存接口，接收 `workspaceId`、区块 `selector`、`textTargetDescriptor` 和 `nextText`
- [x] 3.2 实现 `workspace-files/index.html` 的 HTML 解析回写服务，使用可判定的文本目标描述符定位热点并在目标不唯一时拒绝写入
- [x] 3.3 将成功保存后的文件更新纳入现有 preview revision 流程，保证持久化内容与预览内容保持一致

## 4. Verification

- [x] 4.1 为 preview bridge / 共享类型补充测试，覆盖热点识别、单击编辑、链接与按钮拦截、失焦保存消息和编辑态清理
- [x] 4.2 为 `PreviewPane` 与 `BuilderPage` 补充测试，覆盖当前选区编辑作用域、保存成功后的连续编辑和失败反馈行为
- [x] 4.3 为保存接口与 HTML writeback service 补充测试，覆盖描述符命中、歧义拒绝写入和 `workspace-files/index.html` 持久化更新
