# Page Builder 工作区

此工作区用于生成一个可在当前工作台中预览的静态网站。

## 预览输出规则

- 将预览入口页面写入 `workspace-files/index.html`。
- 将图片、样式表、脚本、字体和其他预览资源写入 `workspace-files/` 下，通常放在 `workspace-files/assets/`。
- 在预览文件之间使用相对路径，以便工作区预览路由可以直接加载该站点。
- 修改站点时，更新 `workspace-files/` 中的现有文件，而不是在其他位置创建另一份预览输出。
- 除非用户明确要求不同的结构，否则不要将预览站点放在 session 工作目录中，也不要放在 `workspace-files/` 之外的任何目录中。

## 用户确认规则

- 用户是普通用户，不懂编程和网页设计。与用户沟通时保持清晰、易懂，不要预设用户具备技术背景；必要时可以保留少量网页相关术语，并在同一句中顺手做简短解释。
- 只要需要用户确认，或者需求在关键点上存在不明确之处，始终使用 `AskUserQuestion` 工具，而不是让用户通过普通文本直接输入答案。
- 在开始构建新的网页之前，针对所有会影响结果质量但当前缺失的需求先向用户提问，例如主题、视觉风格、颜色方向、品牌气质、目标受众和核心版块。
- 只要有重要信息不明确，就先提问，不要猜测。
- 如果用户需求已经足够清晰，且不需要额外确认，可以直接开始执行。

## 引导式专题页生成规则

- 在 `page-builder` 中处理普通用户的专题页创建或后续迭代时，优先使用工作区内的 `page-builder-guided-generation` skill。
- `page-builder-guided-generation` 负责普通用户侧的需求收集、短澄清、最终确认和覆盖确认，不要把这些步骤转交给其他元流程 skill。
- 该流程默认面向单页专题页生成，并遵循 `必问项 / 条件必问项 / 强制确认项` 这一提问 contract。
- 达到可稳定成稿阈值后，先汇总简报并通过 `AskUserQuestion` 做最终确认，再开始整页生成。
- 如果当前预览页已经存在内容，而用户明确要求整页重做，先使用 `AskUserQuestion` 做覆盖确认，再执行整页改写。
- 页面已经生成后，后续普通修改默认继续围绕当前预览页迭代，而不是重新做完整问答，除非用户明确要求全部重来。
- 当精确日期、价格、电话、数据等强事实缺失时，不要编造最终信息；如页面结构仍需要该位置，使用明确标注的草稿占位文案。

## 设计技能规则

- 在确认专题页方向后，优先使用工作区内的 `taste-skill`（skill 名为 `design-taste-frontend`）生成首版页面。
- 只有在首版页面仍然明显不够成熟、层次不足或需要额外提质时，再使用工作区内的 `redesign-skill`（skill 名为 `redesign-existing-projects`）。
- 如果当前任务究竟属于新设计还是重设计并不明确，先使用 `AskUserQuestion` 工具向用户确认，再开始实现。

## CMS 应用与结构规则

- 当 page-builder 流程已经拿到明确的 CMS 选择结果和目标区块 selector 时，优先使用工作区内的 `cms-binding-apply` skill 来判断当前 Phase 1A 是否可以应用。
- `cms-binding-apply` 只用于 CMS 选择完成之后的兼容性判断和正式应用，不用于浏览 CMS 数据，也不替代 CMS 选择器本身。
- 该阶段仅允许 `ready`、`needs-clarification`、`incompatible` 三种结论，并且默认只处理 `replace-current`。
- 如果 `cms-binding-apply` 得到 `ready`，要在同一轮继续调用 `mcp__cms__apply_cms_binding`，不要绕过正式工具直接改写 workspace 文件。
- 产出 CMS 驱动源码时，`cms-catalog` / `cms-content` 尽量作为动态区域源码根节点。
- `ul`、`section`、`article` 等主要动态容器尽量写在 slot 中；`empty` / `error` 的主要 fallback 结构也尽量写在对应 slot 中。

## 工作说明

- 当前 session 目录是一个 scratch 工作目录，不是最终发布的预览根目录。
- 如果用户要求继续迭代当前页面，将 `workspace-files/` 中的现有文件视为预览的事实来源。
