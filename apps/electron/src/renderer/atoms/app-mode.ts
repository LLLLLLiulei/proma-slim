import { atom } from 'jotai'

export type AppMode = 'agent'

export const appModeAtom = atom<AppMode>('agent')
