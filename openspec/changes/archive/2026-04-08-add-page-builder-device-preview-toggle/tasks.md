## 1. Preview header device controls

- [x] 1.1 在 `PreviewPane` 中新增本地 `PC / Mobile` 设备模式状态，并将默认模式设为 `PC`
- [x] 1.2 将预览头部左侧的“实时预览”文字替换为桌面端与移动端图标切换入口，同时保留清晰的 `aria-label` 与 `title`
- [x] 1.3 确认导出、刷新、全屏和新窗口打开按钮在新增设备切换入口后仍保持现有交互语义和布局密度

## 2. Viewport shell and anchored interactions

- [x] 2.1 在 `PreviewPane` 预览主体中引入实际视口容器 `viewportShell`，使 `PC` 模式保持全宽、`Mobile` 模式使用居中的 `390px` 目标宽度，并在空间不足时向可用宽度收敛
- [x] 2.2 将 iframe 与区块工具条 overlay 一起挂载到 `viewportShell` 下，确保页面在 `Mobile` 模式下按照真实移动端宽度重排
- [x] 2.3 将区块工具条定位基准从外层预览框调整为实际视口容器，保证切换设备模式后工具条继续正确锚定当前选中区块
- [x] 2.4 验证设备模式切换不会打断现有区块选择、图片替换、CMS 入口、删除和内联编辑等预览区交互

## 3. Verification

- [x] 3.1 更新 `PreviewPane` renderer 测试，覆盖头部不再显示“实时预览”、新增 `PC / Mobile` 切换入口以及默认 `PC` 模式行为
- [x] 3.2 更新 `PreviewPane` renderer 测试，覆盖 `Mobile` 模式下的 `390px` 视口布局、窄容器收敛以及已选区块工具条在两种模式下的锚定行为
- [x] 3.3 回归验证现有预览控制按钮与相关交互测试，确认设备模式切换未引入刷新、全屏、新窗口打开和导出静态包行为回归
