## Purpose
定义 `page-builder` preview bridge runtime 的模块化源码组织、单资产交付边界与验证要求，确保桥接运行时在保持现有宿主注入契约不变的前提下可持续维护和演进。

## Requirements

### Requirement: Preview bridge 必须以模块化源码维护并继续通过单个宿主资产交付
系统 SHALL 将 page-builder preview bridge 维护为模块化源码，而不是继续把全部运行时逻辑手工堆叠在单个资源文件中；同时系统 SHALL 继续通过宿主提供的单个 preview bridge 资产向浏览器交付该运行时，而不得要求浏览器直接请求一组 preview bridge 子模块资源。

#### Scenario: 预览页面继续通过单个 bridge 资产加载运行时
- **WHEN** 某个 page-builder 预览页面启用了 preview bridge 注入
- **THEN** 系统 SHALL 继续向该页面注入单个 preview bridge 资产
- **AND** 浏览器 SHALL 不被要求直接请求额外的 preview bridge 子模块 URL 才能完成 bridge 初始化

#### Scenario: bridge 源模块变更后宿主资产版本同步变化
- **WHEN** preview bridge 的任一源模块发生变更
- **THEN** 系统 SHALL 重新生成对应的 preview bridge 资产内容
- **AND** 系统 SHALL 使对外 bridge 资产版本随该内容变化而更新

### Requirement: Preview bridge 源码必须围绕稳定职责边界拆分
系统 SHALL 将 preview bridge runtime 按稳定职责边界拆分为可独立维护的源模块，并 SHALL 通过明确的组合入口与共享状态边界协调这些模块，而不得继续依赖一个高耦合单文件中的隐式顶层可变局部变量来承载全部职责。

#### Scenario: bridge 入口组合选择、overlay、CMS island、inline editing 与 bootstrap 职责
- **WHEN** 系统组织 preview bridge 源模块
- **THEN** 系统 SHALL 使 bridge 入口显式组合目标解析、overlay 编排、CMS island 语义、inline editing 与 bootstrap 生命周期等职责
- **AND** 系统 SHALL 不要求单个源文件独自承载这些职责的全部实现

#### Scenario: 模块通过显式共享状态协作
- **WHEN** 多个 preview bridge 模块需要协作访问当前 hover/selected target、交互锁定或活动编辑态
- **THEN** 系统 SHALL 通过显式共享状态或明确依赖传递协调这些模块
- **AND** 系统 SHALL 不依赖跨多个模块散落的隐式顶层局部变量作为唯一状态边界

### Requirement: Preview bridge 验证必须同时覆盖打包边界和运行时行为
系统 SHALL 使用双层验证保护模块化后的 preview bridge：既要验证宿主交付的单资产 bridge 产物与版本边界，也要验证 bridge 关键职责的运行时行为，而不得主要依赖大量 bundle 文本片段匹配来证明实现正确。

#### Scenario: 宿主侧测试验证单资产 bridge 产物仍可读取并具备版本语义
- **WHEN** 系统测试 preview bridge 资产读取与交付逻辑
- **THEN** 测试 SHALL 验证宿主能够读取单个 bridge 产物
- **AND** 测试 SHALL 验证 bridge 产物内容变化会引起对外版本变化

#### Scenario: 运行时测试验证关键 bridge 职责行为
- **WHEN** 系统测试 preview bridge 的选择、overlay、CMS island 或 inline editing 能力
- **THEN** 测试 SHALL 以模块行为或 bridge 运行时行为为主进行验证
- **AND** 系统 SHALL 不主要依赖 bundle 内部文本片段必须逐段匹配的方式来覆盖这些职责
