import * as React from 'react'
import { History, LibraryBig } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageBuilderHistorySection } from './PageBuilderHistorySection'
import { PageBuilderTemplateLibrarySection } from './PageBuilderTemplateLibrarySection'

type ResourceTab = 'templates' | 'history'

export function PageBuilderHomeResourceTabs({
  allowTemplateUse = true,
  showHistory = true,
}: {
  allowTemplateUse?: boolean
  showHistory?: boolean
} = {}): React.ReactElement {
  const [activeTab, setActiveTab] = React.useState<ResourceTab>('templates')

  React.useEffect(() => {
    if (!showHistory && activeTab === 'history') {
      setActiveTab('templates')
    }
  }, [activeTab, showHistory])

  return (
    <section className="page-builder-home-resource-tabs w-full max-w-[1120px]" data-testid="page-builder-home-resource-tabs">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">页面资源</h2>
          <p className="text-sm text-muted-foreground">
            {showHistory ? '从模板开始，或继续编辑历史项目。' : '浏览、导入、预览和管理可复用的页面模板。'}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-border/55 bg-background/78 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl">
          <Button
            aria-pressed={activeTab === 'templates'}
            className="h-9 rounded-full px-4"
            onClick={() => {
              setActiveTab('templates')
            }}
            type="button"
            variant={activeTab === 'templates' ? 'default' : 'ghost'}
          >
            <LibraryBig className="mr-2 size-4" />
            模板库
          </Button>
          {showHistory ? (
            <Button
              aria-pressed={activeTab === 'history'}
              className="h-9 rounded-full px-4"
              onClick={() => {
                setActiveTab('history')
              }}
              type="button"
              variant={activeTab === 'history' ? 'default' : 'ghost'}
            >
              <History className="mr-2 size-4" />
              历史记录
            </Button>
          ) : null}
        </div>
      </div>

      <div
        aria-hidden={activeTab !== 'templates'}
        data-testid="page-builder-template-tab-panel"
        hidden={activeTab !== 'templates'}
      >
        <PageBuilderTemplateLibrarySection allowTemplateUse={allowTemplateUse} />
      </div>
      {showHistory ? (
        <div
          aria-hidden={activeTab !== 'history'}
          data-testid="page-builder-history-tab-panel"
          hidden={activeTab !== 'history'}
        >
          <PageBuilderHistorySection />
        </div>
      ) : null}
    </section>
  )
}
