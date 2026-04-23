import type { AgentEvent } from '@proma/shared'

export function reconstructAssistantContent(
  accumulatedText: string,
  accumulatedEvents: AgentEvent[] | undefined,
): string {
  if (!accumulatedEvents || accumulatedEvents.length === 0) {
    return accumulatedText
  }

  let reconstructedText = ''
  let currentDeltaSegment = ''
  let segmentHasDelta = false

  const resetCurrentSegment = () => {
    currentDeltaSegment = ''
    segmentHasDelta = false
  }

  for (const event of accumulatedEvents) {
    if (event.type === 'text_delta') {
      reconstructedText += event.text
      currentDeltaSegment += event.text
      segmentHasDelta = true
      continue
    }

    if (event.type === 'text_complete') {
      if (!segmentHasDelta) {
        reconstructedText += event.text
      } else if (currentDeltaSegment !== event.text) {
        if (currentDeltaSegment && reconstructedText.endsWith(currentDeltaSegment)) {
          reconstructedText =
            reconstructedText.slice(0, reconstructedText.length - currentDeltaSegment.length)
            + event.text
        } else if (!reconstructedText.endsWith(event.text)) {
          reconstructedText += event.text
        }
      }
      resetCurrentSegment()
      continue
    }

    if (
      event.type === 'tool_start'
      || event.type === 'tool_result'
      || event.type === 'task_started'
      || event.type === 'task_notification'
      || event.type === 'complete'
      || event.type === 'typed_error'
      || event.type === 'error'
    ) {
      resetCurrentSegment()
    }
  }

  return reconstructedText || accumulatedText
}
