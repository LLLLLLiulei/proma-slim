/**
 * AppearanceSettings
 *
 * 主题模式由 Jotai 管理，并持久化到 localStorage。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import {
  SettingsSection,
  SettingsCard,
  SettingsSegmentedControl,
} from './primitives'
import { themeModeAtom, updateThemeMode } from '@/atoms/theme'
import type { ThemeMode } from '../../../types'

const THEME_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

export function AppearanceSettings(): React.ReactElement {
  const [themeMode, setThemeMode] = useAtom(themeModeAtom)

  const handleThemeChange = React.useCallback((value: string) => {
    const mode = value as ThemeMode
    setThemeMode(mode)
    updateThemeMode(mode)
  }, [setThemeMode])

  return (
    <SettingsSection title="外观" description="选择浅色、深色或跟随系统主题。">
      <SettingsCard>
        <SettingsSegmentedControl
          label="主题模式"
          description="选择跟随系统时，Proma 会监听 prefers-color-scheme 的变化。"
          value={themeMode}
          onValueChange={handleThemeChange}
          options={THEME_OPTIONS}
        />
      </SettingsCard>
    </SettingsSection>
  )
}
