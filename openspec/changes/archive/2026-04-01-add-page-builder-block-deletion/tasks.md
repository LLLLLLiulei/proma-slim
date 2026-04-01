## 1. Toolbar and confirmation flow

- [x] 1.1 更新 `PageBuilderBlockActionBar` 与 `PreviewPane`，启用 `删除` 按钮并把删除点击事件上抛到 Builder 页
- [x] 1.2 在 `BuilderPage` 中接入删除确认 `AlertDialog`，处理打开、取消、确认和删除中状态
- [x] 1.3 确保删除成功后清空当前选区与工具条状态，删除失败时保留当前选区并展示错误反馈

## 2. Renderer delete request chain

- [x] 2.1 在 renderer API 中新增 page-builder 删除区块请求封装，仅传当前已选区块的 `selector`
- [x] 2.2 将删除成功返回接入现有 preview state / revision 同步链路，并补充成功提示

## 3. Workspace HTML deletion

- [x] 3.1 新增 page-builder 区块删除接口，接收 `workspaceId` 与当前已选区块 `selector`
- [x] 3.2 实现区块删除服务：校验唯一 `selector`、从 `workspace-files/index.html` 中移除目标元素并返回新的 preview state
- [x] 3.3 让删除写回纳入现有 preview revision 流程，保证 Builder 预览刷新后显示删除结果

## 4. Verification

- [x] 4.1 为 `PreviewPane` / `BuilderPage` 补充测试，覆盖删除按钮展示、确认弹框取消、删除成功与失败反馈
- [x] 4.2 为 renderer API、删除路由与 HTML 删除服务补充测试，覆盖请求封装、唯一定位删除与失败拒绝写入
- [x] 4.3 使用真实 Builder 页面完成一次区块删除烟测，验证选中区块、确认删除并在预览中看到区块消失
