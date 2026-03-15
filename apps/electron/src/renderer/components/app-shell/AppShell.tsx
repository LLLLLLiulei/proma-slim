import * as React from 'react'
import { LeftSidebar } from './LeftSidebar'
import { MainContentPanel } from './MainContentPanel'

export function AppShell(): React.ReactElement {
  return (
    <div className="proma-shell-frame flex h-full min-h-0 overflow-hidden">
      <LeftSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MainContentPanel />
      </div>
    </div>
  )
}
