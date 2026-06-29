import * as React from 'react'
import { useAtom } from 'jotai'
import { builderActiveTabAtom, type BuilderRightPanelTab } from '@page-builder/atoms/builder-code-atoms'
import {
  getPageBuilderVisibleRightPanelTab,
  normalizePageBuilderHiddenToolbarItems,
  type PageBuilderToolbarItemKey,
} from '@page-builder/lib/toolbar-visibility'
import { cn } from '@/lib/utils'

export interface BuilderRightPanelProps {
  /** 聊天 Tab 内容（BuilderPage 渲染好的 AgentView，原样透传，零改动 AgentView） */
  chatContent: React.ReactNode
  /** 代码 Tab 内容（BuilderCodeTab） */
  codeTab: React.ReactNode
  /** 工具栏隐藏项；隐藏 active tab 时内容区需要回退到可见内容。 */
  hiddenToolbarItems?: readonly PageBuilderToolbarItemKey[] | null
}

/**
 * 右侧栏内容容器。Tab 切换按钮在 ProjectTitleBar，这里只负责按
 * builderActiveTabAtom 用 hidden 切换两个内容区（始终挂载，保留各自状态）。
 */
export function BuilderRightPanel({ chatContent, codeTab, hiddenToolbarItems: hiddenToolbarItemsInput }: BuilderRightPanelProps) {
  const [tab, setTab] = useAtom(builderActiveTabAtom)
  const hiddenToolbarItems = React.useMemo(
    () => normalizePageBuilderHiddenToolbarItems(hiddenToolbarItemsInput),
    [hiddenToolbarItemsInput],
  )
  const visibleTab = getPageBuilderVisibleRightPanelTab(tab, hiddenToolbarItems)

  React.useEffect(() => {
    if (visibleTab === tab) return
    setTab(visibleTab)
  }, [setTab, tab, visibleTab])

  return (
    <div className="h-full min-h-0">
      <div className={cn('h-full', visibleTab === 'chat' ? 'block' : 'hidden')}>{chatContent}</div>
      <div className={cn('h-full', visibleTab === 'code' ? 'block' : 'hidden')}>{codeTab}</div>
    </div>
  )
}

/** 当前激活 Tab（供需要感知 Tab 切换的子组件读取，如懒加载 Monaco） */
export function useBuilderActiveTab(): BuilderRightPanelTab {
  const [tab] = useAtom(builderActiveTabAtom)
  return tab
}
