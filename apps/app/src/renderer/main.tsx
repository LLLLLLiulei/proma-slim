import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { useAtomValue, useSetAtom } from 'jotai'
import App from './App'
import {
  applyThemeToDOM,
  initializeTheme,
  resolvedThemeAtom,
  systemIsDarkAtom,
  themeModeAtom,
} from './atoms/theme'
import { Toaster } from './components/ui/sonner'
import './styles/globals.css'
import 'katex/dist/katex.min.css'

function ThemeInitializer(): null {
  const setThemeMode = useSetAtom(themeModeAtom)
  const setSystemIsDark = useSetAtom(systemIsDarkAtom)
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  useEffect(() => {
    let active = true
    let cleanup: (() => void) | undefined

    initializeTheme(setThemeMode, setSystemIsDark).then((nextCleanup) => {
      if (!active) {
        nextCleanup()
        return
      }
      cleanup = nextCleanup
    })

    return () => {
      active = false
      cleanup?.()
    }
  }, [setThemeMode, setSystemIsDark])

  useEffect(() => {
    applyThemeToDOM(resolvedTheme)
  }, [resolvedTheme])

  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeInitializer />
    <App />
    <Toaster position="top-right" />
  </React.StrictMode>,
)
