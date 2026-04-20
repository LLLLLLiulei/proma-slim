## ADDED Requirements

### Requirement: page-builder 根级 `CLAUDE.md` 必须声明 CMS islands 的 HTML-first 作者态模型
系统 SHALL 在 page-builder 工作区根级 `CLAUDE.md` 中明确声明作者态页面是 HTML-first 的：`cms-catalog` / `cms-content` 是宿主管理的 CMS source tags，Vue template 语法只属于这些 CMS source tags 的 slot authoring，而普通页面区域 MUST 保持普通 HTML/CSS/JS。

#### Scenario: 初始化根级模板时写入 CMS islands 作者态模型
- **WHEN** 系统为新的或已有的 page-builder 工作区初始化、回填或刷新根级 `CLAUDE.md`
- **THEN** 该文件 SHALL 明确说明 `cms-catalog` / `cms-content` 是宿主管理的 CMS islands source tags
- **AND** 该文件 SHALL 明确说明 Vue template 语法只应出现在这些 CMS source tags 的 slot authoring 中
- **AND** 该文件 SHALL 明确说明 `cms-*` 之外的页面区域保持普通 HTML/CSS/JS

#### Scenario: 根级模板禁止作者自管 Vue runtime 与整页 mount
- **WHEN** 根级 `CLAUDE.md` 描述 page-builder 的 CMS 全局边界
- **THEN** 该文件 SHALL 明确禁止 Agent 为 CMS 渲染自行引入 Vue runtime、Vue CDN、Vue importmap 或自定义 bootstrap
- **AND** 该文件 SHALL 明确禁止 Agent 通过 page-wide `createApp` / `mount` 把整页改造成单一 Vue app
- **AND** 该文件 SHALL 将新的 CMS source tag authoring 继续路由到受控 CMS flow，而不是 generic Vue authoring
