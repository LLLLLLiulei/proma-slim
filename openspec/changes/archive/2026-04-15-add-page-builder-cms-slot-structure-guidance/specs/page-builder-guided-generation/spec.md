## ADDED Requirements

### Requirement: 引导式专题页生成在产出 CMS 区块时必须优先使用 slot 内承载完整动态区域的组织方式
系统 SHALL 在 `page-builder-guided-generation` 产出 CMS 相关 HTML 时，优先使用 `cms-catalog` / `cms-content` 作为动态区域源码根节点的组织方式，并 SHALL 将与该 CMS 数据直接相关的主要 HTML 壳子尽量写入 `default / empty / error` slot 中。

#### Scenario: 生成 CMS 导航区块时将主要导航容器放入 `cms-catalog` slot
- **WHEN** 引导式专题页生成链路决定创建一个 CMS 驱动的导航、栏目入口或栏目列表区块
- **THEN** 系统 SHALL 优先生成以 `cms-catalog` 作为动态区域源码根节点的结构
- **AND** 系统 SHALL 将 `ul`、`nav`、`li` 等与该导航数据直接相关的主要 HTML 结构写入 slot，而不是把主要导航容器留在组件外部

#### Scenario: 生成 CMS 内容列表区块时将主要列表容器放入 `cms-content` slot
- **WHEN** 引导式专题页生成链路决定创建一个 CMS 驱动的内容列表、卡片列表或图文列表区块
- **THEN** 系统 SHALL 优先生成以 `cms-content` 作为动态区域源码根节点的结构
- **AND** 系统 SHALL 将 `section`、`article`、`div.grid`、empty / error fallback 等与该内容数据直接相关的结构写入 slot

#### Scenario: 页面级静态外壳可保留在外，但主要动态容器不得默认外置
- **WHEN** 某个 CMS 区块同时需要页面级静态外层布局壳子
- **THEN** 系统 MAY 保留与 CMS 数据无直接关系的页面级静态壳子在组件外部
- **AND** 系统 SHALL NOT 默认生成“主要动态容器在组件外、slot 内只剩条目级节点”的结构
