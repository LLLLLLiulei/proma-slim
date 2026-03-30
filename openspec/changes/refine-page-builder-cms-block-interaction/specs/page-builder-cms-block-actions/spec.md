## ADDED Requirements

### Requirement: 手动 CMS 选择主入口必须绑定到当前已选区块
系统 SHALL 将 Builder 页中手动 `从 CMS 选择` 的主入口放在当前已选区块下方的浮动操作条中，使用户明确知道该操作作用于当前区块，而不是把它作为全局聊天输入区中的主入口。

#### Scenario: 选中区块后在区块下方出现手动 CMS 入口
- **WHEN** 用户在 Builder 预览中选中了某个页面区块
- **THEN** 系统 SHALL 在该已选区块下方展示浮动操作条
- **AND** 该操作条 SHALL 提供 `从 CMS 选择` 入口

#### Scenario: 未选区块时不以聊天输入区作为手动 CMS 主入口
- **WHEN** Builder 页当前没有任何已选区块
- **THEN** 系统 SHALL 不把手动 `从 CMS 选择` 继续作为聊天输入区中的主入口暴露给用户

#### Scenario: 区块工具条打开共享 CMS 选择器
- **WHEN** 用户点击当前已选区块下方的 `从 CMS 选择`
- **THEN** 系统 SHALL 打开 Builder 页内现有的 CMS 选择器模态框
- **AND** 系统 SHALL 将当前已选区块作为本次 CMS 选择的默认目标上下文

### Requirement: 为当前区块确认 CMS 数据后必须默认自动开始修改
系统 SHALL 在用户通过区块级 `从 CMS 选择` 确认 CMS 数据后，默认自动开始针对当前区块的修改，而不是要求用户继续手动补充一条自由文本消息。

#### Scenario: 确认 CMS 选择后自动开始区块修改
- **WHEN** 用户已选中某个区块，并通过区块级 `从 CMS 选择` 确认了一份 CMS 数据源
- **THEN** 系统 SHALL 自动开始当前区块的修改执行流程
- **AND** 系统 SHALL 不再要求用户额外手动输入一条自然语言描述才能继续

#### Scenario: 自动开始修改时写入一条用户可见的系统代发消息
- **WHEN** 系统因区块级 CMS 选择确认而自动开始修改
- **THEN** 系统 SHALL 在聊天区插入一条用户可读的系统代发消息
- **AND** 该消息 SHALL 表达“当前区块正在应用所选 CMS 数据并开始生成修改”的含义，而不是直接暴露 selector 或结构化协议字段

#### Scenario: 取消 CMS 选择时不自动开始修改
- **WHEN** 用户从区块级 CMS 选择器中关闭或取消本次选择
- **THEN** 系统 SHALL 不自动开始任何修改执行
- **AND** 系统 SHALL 返回到“当前区块仍保持选中”的状态

### Requirement: 区块级 CMS 自动应用必须仅在必要时才追问用户
系统 SHALL 将 `AskUserQuestion` 作为区块级 CMS 自动应用的例外路径，仅在当前区块与所选 CMS 数据源无法安全匹配时才触发，而不是把追问作为默认流程。

#### Scenario: 当前区块与所选 CMS 数据明显匹配时不额外追问
- **WHEN** 用户为当前区块确认的 CMS 数据源与当前区块结构能够形成安全默认动作
- **THEN** 系统 SHALL 直接继续自动修改流程
- **AND** 系统 SHALL 不额外调用 `AskUserQuestion`

#### Scenario: 当前区块与所选 CMS 数据明显不匹配时触发最小确认
- **WHEN** 用户为当前区块确认的 CMS 数据源与当前区块结构存在明显冲突，无法安全决定默认修改方式
- **THEN** 系统 SHALL 通过 `AskUserQuestion` 向用户发起一次最小必要确认
- **AND** 系统 SHALL 在收到确认结果后再继续后续修改流程

### Requirement: 自然语言触发 CMS 选择器必须继续保留为补充入口
系统 SHALL 继续支持 Agent 在对话过程中主动触发 CMS 选择器，但该路径 SHALL 作为区块级手动入口的补充入口，而不是取代“已选区块下方的 `从 CMS 选择`”这一主路径。

#### Scenario: 已存在当前选中区块时自然语言触发默认作用于当前区块
- **WHEN** 用户在对话中表达 CMS 取数意图，且当前 Builder 已存在一个选中的页面区块
- **THEN** 系统 SHALL 使本次 Agent 触发的 CMS 选择请求默认作用于当前选中区块
- **AND** 系统 SHALL 保持与区块级手动路径一致的目标区块语义

#### Scenario: 无选中区块且目标不明确时先做最小确认
- **WHEN** 用户在对话中表达 CMS 取数意图，但当前没有选中的页面区块，且系统无法安全判断是在替换已有区域还是新增区块
- **THEN** 系统 SHALL 先通过 `AskUserQuestion` 做一次最小必要确认
- **AND** 系统 SHALL 在确认后再决定是否继续触发 CMS 选择器或后续生成
