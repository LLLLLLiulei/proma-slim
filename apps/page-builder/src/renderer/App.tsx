import * as React from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { House } from 'lucide-react'
import { BuilderPage } from '@page-builder/pages/BuilderPage'
import { HomePage } from '@page-builder/pages/HomePage'
import { getPageBuilderPublicBasePath } from '@page-builder/lib/public-base-path'
import { buildHomePath, parsePageBuilderRoute } from '@page-builder/lib/routes'

function usePathname(): string {
  const [pathname, setPathname] = React.useState(() => window.location.pathname)

  React.useEffect(() => {
    const onPopstate = () => {
      setPathname(window.location.pathname)
    }

    window.addEventListener('popstate', onPopstate)
    return () => {
      window.removeEventListener('popstate', onPopstate)
    }
  }, [])

  return pathname
}

function navigateHome(): void {
  window.history.pushState(null, '', buildHomePath(getPageBuilderPublicBasePath()))
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function NotFound(): React.ReactElement {
  return (
    <div className="page-builder-home-shell flex min-h-[100dvh] items-center justify-center px-6 py-10">
      <div className="page-builder-home-panel max-w-md space-y-4 p-8 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">页面不存在</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          当前地址不属于 `page-builder` 的首页或构建页。
        </p>
        <Button className="gap-2" onClick={navigateHome} type="button">
          <House className="size-4" />
          返回首页
        </Button>
      </div>
    </div>
  )
}

export default function App(): React.ReactElement {
  const pathname = usePathname()
  const publicBasePath = getPageBuilderPublicBasePath()
  const route = React.useMemo(() => parsePageBuilderRoute(pathname, publicBasePath), [pathname, publicBasePath])

  return (
    <TooltipProvider delayDuration={200}>
      {route.name === 'home' && <HomePage />}
      {route.name === 'builder' && (
        <BuilderPage sessionId={route.sessionId} workspaceId={route.workspaceId} />
      )}
      {route.name === 'not-found' && <NotFound />}
    </TooltipProvider>
  )
}
