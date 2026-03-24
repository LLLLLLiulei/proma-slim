const POPUP_GAP = 4
const VIEWPORT_PADDING = 8

export function createMentionPopup(content: HTMLElement): HTMLDivElement {
  const popup = document.createElement('div')
  popup.style.position = 'absolute'
  popup.style.zIndex = '9999'
  popup.style.visibility = 'hidden'
  document.body.appendChild(popup)
  popup.appendChild(content)
  return popup
}

export function positionPopup(
  popup: HTMLDivElement | null,
  rect: DOMRect | null | undefined,
): void {
  if (!rect || !popup) return

  requestAnimationFrame(() => {
    const popupWidth = popup.offsetWidth
    const popupHeight = popup.offsetHeight
    const left = Math.min(rect.left, window.innerWidth - popupWidth - VIEWPORT_PADDING)
    popup.style.left = `${Math.max(VIEWPORT_PADDING, left)}px`

    const spaceAbove = rect.top
    if (spaceAbove >= popupHeight + POPUP_GAP) {
      popup.style.top = `${rect.top - popupHeight - POPUP_GAP}px`
    } else {
      popup.style.top = `${rect.bottom + POPUP_GAP}px`
    }

    popup.style.visibility = 'visible'
  })
}
