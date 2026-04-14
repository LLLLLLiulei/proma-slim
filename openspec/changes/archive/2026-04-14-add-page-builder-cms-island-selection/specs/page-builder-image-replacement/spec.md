## MODIFIED Requirements

### Requirement: 已选区块必须只在存在唯一图片目标时暴露图片替换能力
系统 SHALL 仅在当前已选目标能够唯一映射到 `workspace-files/index.html` 中单个稳定 `<img>` 目标时暴露图片替换能力；当当前已选目标是 `cms-island` 时，即使其渲染结果中可见图片，系统也 MUST NOT 将这些运行时图片视为可替换的静态图片目标。

#### Scenario: 选中静态元素本身是图片时支持替换
- **WHEN** 用户当前已选中的普通预览元素本身是一个 `<img>`
- **THEN** 系统 SHALL 将该元素视为可替换图片目标
- **AND** 系统 SHALL 为当前选区声明支持图片替换

#### Scenario: 已选静态区块内存在唯一图片时支持替换
- **WHEN** 用户当前已选中的普通预览区块本身不是 `<img>`，但其内部恰好存在唯一一个静态 `<img>`
- **THEN** 系统 SHALL 将该唯一 `<img>` 视为当前区块的可替换图片目标
- **AND** 系统 SHALL 为当前选区声明支持图片替换

#### Scenario: 已选 CMS island 时不支持替换运行时图片
- **WHEN** 用户当前已选目标是某个 CMS island，且其渲染结果中存在一个或多个图片
- **THEN** 系统 SHALL 不为该目标声明支持图片替换
- **AND** 系统 SHALL 不把这些运行时图片视为可安全替换的静态图片目标

#### Scenario: 无图片或多图片区块不支持替换
- **WHEN** 用户当前已选中的普通静态区块内部不存在 `<img>`，或存在多个 `<img>`
- **THEN** 系统 SHALL 不为该选区声明支持图片替换
- **AND** 系统 SHALL 不把该选区视为可安全替换图片的目标

