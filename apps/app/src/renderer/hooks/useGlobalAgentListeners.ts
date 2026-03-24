import { useAgentSSE } from './useAgentSSE'

export function useGlobalAgentListeners() {
  return useAgentSSE()
}
