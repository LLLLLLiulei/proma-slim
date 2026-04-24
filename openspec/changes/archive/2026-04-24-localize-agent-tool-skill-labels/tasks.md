## 1. Shared Label Mapping

- [x] 1.1 新增 renderer 侧共享工具/skill 展示名称 formatter，并为未命中映射的名称保留原样返回。
- [x] 1.2 按 design 文档中的当前清单补充首批常见内置工具、第一方 MCP 工具与已知内置 skill 的中文映射，并支持 `<workspace-slug>:<skill-slug>` 形式的 skill 调用名规范化匹配。

## 2. UI Integration

- [x] 2.1 更新 `ToolActivityItem`，让工具活动标题、第一方 MCP 工具名称和 `Skill` 摘要复用共享 formatter 显示中文名称。
- [x] 2.2 更新 `PermissionBanner`，移除与共享 formatter 冲突的独立名称格式化逻辑，并改为复用同一套中文展示规则。

## 3. Verification

- [x] 3.1 为工具活动展示补充或更新测试，覆盖已知工具中文名、第一方 MCP 工具中文名、已知 skill 中文名和未命中映射保留原名的场景。
- [x] 3.2 为权限横幅补充或更新测试，覆盖共享中文名称展示、第一方 MCP 工具中文名和未命中映射保留原名的场景。
