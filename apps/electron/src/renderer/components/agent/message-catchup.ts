import type { AgentMessage } from '@proma/shared'

export interface LoadSessionMessagesWithCatchupOptions {
  initialMessages?: AgentMessage[]
  maxAttempts?: number
  retryDelayMs?: number
  wait?: (ms: number) => Promise<void>
}

const DEFAULT_MAX_ATTEMPTS = 20
const DEFAULT_RETRY_DELAY_MS = 500

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function loadSessionMessagesWithCatchup(
  loadMessages: () => Promise<AgentMessage[]>,
  options: LoadSessionMessagesWithCatchupOptions = {},
): Promise<AgentMessage[]> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)
  const wait = options.wait ?? defaultWait

  let messages = options.initialMessages ?? await loadMessages()

  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    if (messages.at(-1)?.role !== 'user') {
      break
    }

    await wait(retryDelayMs)
    messages = await loadMessages()
  }

  return messages
}
