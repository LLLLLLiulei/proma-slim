import { atom } from 'jotai'

export type SettingsTab = 'general' | 'appearance'

export const settingsTabAtom = atom<SettingsTab>('general')
