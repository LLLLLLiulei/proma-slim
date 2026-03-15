import * as React from 'react'
import { useAtom } from 'jotai'
import { Palette, Settings } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { settingsTabAtom, type SettingsTab } from '@/atoms/settings-tab'
import { AppearanceSettings } from './AppearanceSettings'
import { GeneralSettings } from './GeneralSettings'

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: '通用', icon: <Settings size={16} /> },
  { id: 'appearance', label: '外观', icon: <Palette size={16} /> },
]

function renderTab(tab: SettingsTab): React.ReactElement {
  switch (tab) {
    case 'appearance':
      return <AppearanceSettings />
    case 'general':
    default:
      return <GeneralSettings />
  }
}

export function SettingsPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useAtom(settingsTabAtom)

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-52 border-r border-border/60 p-4">
        <h2 className="px-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">设置</h2>
        <nav className="mt-4 flex flex-col gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                activeTab === tab.id
                  ? 'bg-primary/10 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <ScrollArea className="flex-1">
        <div className="px-6 py-6">
          {renderTab(activeTab)}
        </div>
      </ScrollArea>
    </div>
  )
}
