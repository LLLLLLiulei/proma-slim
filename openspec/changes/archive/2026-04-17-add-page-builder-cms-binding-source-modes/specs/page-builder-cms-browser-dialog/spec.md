## ADDED Requirements

### Requirement: CMS 浏览弹框的确认动作必须将当前浏览状态映射为可执行来源模式
系统 SHALL 在 CMS 浏览弹框中根据“当前高亮栏目”和“已勾选固定项”这两类状态，输出可直接交给后续 handoff 与 apply 链路消费的来源模式；固定勾选结果 MUST 优先于仅高亮当前栏目；当当前栏目不满足父栏目来源前提时，系统 MUST 阻止该确认路径，而不是生成一个稳定空来源结果。

#### Scenario: 栏目页签未勾选固定栏目时按当前栏目确认父栏目来源
- **WHEN** 用户位于栏目页签，当前已高亮某个栏目，且没有勾选任何固定栏目
- **THEN** 系统 SHALL 允许用户确认当前栏目
- **AND** 系统 SHALL 将本次确认映射为 `catalogs-by-parent`

#### Scenario: 栏目页签已勾选固定栏目时固定集合优先
- **WHEN** 用户位于栏目页签，并勾选了一个或多个固定栏目
- **THEN** 系统 SHALL 优先将本次确认映射为 `catalogs-by-ids`
- **AND** 系统 SHALL NOT 再把当前高亮栏目解释为父栏目来源

#### Scenario: 当前栏目没有直接子栏目时禁止确认父栏目来源
- **WHEN** 用户位于栏目页签，当前已高亮某个栏目，没有勾选任何固定栏目，且该栏目下没有可用直接子栏目
- **THEN** 系统 SHALL 禁止用户以父栏目来源确认
- **AND** 系统 SHALL 提示当前栏目下没有可用子栏目

#### Scenario: 内容页签未勾选固定内容时按当前栏目确认按栏目取内容来源
- **WHEN** 用户位于内容页签，当前已高亮某个栏目，且没有勾选任何固定内容条目
- **THEN** 系统 SHALL 允许用户确认当前栏目
- **AND** 系统 SHALL 将本次确认映射为 `contents-by-catalog`

#### Scenario: 内容页签已勾选固定内容时固定集合优先
- **WHEN** 用户位于内容页签，并勾选了一个或多个固定内容条目
- **THEN** 系统 SHALL 优先将本次确认映射为 `contents-by-ids`
- **AND** 系统 SHALL NOT 再把当前高亮栏目解释为 `contents-by-catalog`
- **AND** 固定内容勾选结果 SHALL 只允许来自当前同一个栏目
