import type { AgentEvent } from '@ai-page-builder/shared'

export function reconstructAssistantContent(
  accumulatedText: string,
  accumulatedEvents: AgentEvent[] | undefined,
): string {
  if (!accumulatedEvents || accumulatedEvents.length === 0) {
    return accumulatedText
  }

  let reconstructedText = ''
  let hasOpenStreamedText = false
  let openTextTurnId: string | undefined
  let lastTextTurnId: string | undefined

  const appendSegmentText = (text: string, turnId: string | undefined): void => {
    if (
      reconstructedText
      && turnId
      && lastTextTurnId
      && turnId !== lastTextTurnId
    ) {
      reconstructedText += '\n\n'
    }

    reconstructedText += text
    if (turnId) {
      lastTextTurnId = turnId
    }
  }

  for (const event of accumulatedEvents) {
    if (event.type === 'text_delta') {
      appendSegmentText(event.text, event.turnId)
      hasOpenStreamedText = true
      openTextTurnId = event.turnId
      continue
    }

    if (event.type === 'text_complete') {
      const completesOpenStream = hasOpenStreamedText
        && (!event.turnId || !openTextTurnId || event.turnId === openTextTurnId)

      if (!completesOpenStream) {
        appendSegmentText(event.text, event.turnId)
      } else if (event.turnId) {
        lastTextTurnId = event.turnId
      }
      hasOpenStreamedText = false
      openTextTurnId = undefined
    }
  }

  return reconstructedText || accumulatedText
}
