import { atom } from 'jotai'
import type { ThemeMode } from '../../types'

const THEME_CACHE_KEY = 'proma-theme-mode'

function getCachedThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system'
  }

  try {
    const cached = window.localStorage.getItem(THEME_CACHE_KEY)
    if (cached === 'light' || cached === 'dark' || cached === 'system') {
      return cached
    }
  } catch {
    // ignore storage failures
  }

  return 'system'
}

function cacheThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, mode)
  } catch {
    // ignore storage failures
  }
}

export const themeModeAtom = atom<ThemeMode>(getCachedThemeMode())
export const systemIsDarkAtom = atom<boolean>(true)
export const resolvedThemeAtom = atom<'light' | 'dark'>((get) => {
  const mode = get(themeModeAtom)
  if (mode === 'system') {
    return get(systemIsDarkAtom) ? 'dark' : 'light'
  }
  return mode
})

export function applyThemeToDOM(resolvedTheme: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
}

export async function initializeTheme(
  setThemeMode: (mode: ThemeMode) => void,
  setSystemIsDark: (isDark: boolean) => void,
): Promise<() => void> {
  const themeMode = getCachedThemeMode()
  setThemeMode(themeMode)
  cacheThemeMode(themeMode)

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleChange = (event: MediaQueryListEvent): void => {
    setSystemIsDark(event.matches)
  }

  setSystemIsDark(mediaQuery.matches)
  mediaQuery.addEventListener('change', handleChange)

  return () => {
    mediaQuery.removeEventListener('change', handleChange)
  }
}

export async function updateThemeMode(mode: ThemeMode): Promise<void> {
  cacheThemeMode(mode)
}
