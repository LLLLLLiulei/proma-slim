(() => {
  let isEmbeddedPreview = true
  try {
    isEmbeddedPreview = window.parent !== window
  } catch {
    isEmbeddedPreview = true
  }

  if (!isEmbeddedPreview) return

  const BRIDGE_SOURCE = __PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE__
  const PARENT_SOURCE = __PAGE_BUILDER_PREVIEW_PARENT_SOURCE__
  const OVERLAY_ATTR = 'data-page-builder-preview-overlay'
  const BLOCKED_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'META', 'LINK'])
  const LABEL_MAX_WIDTH = 220
  const READY_ANNOUNCEMENT_INTERVAL_MS = 250
  const READY_ANNOUNCEMENT_MAX_ATTEMPTS = 12
  let selectionModeEnabled = false
  let hoveredElement = null
  let selectedElement = null
  let hoveredSelector = null
  let selectedSelector = null
  let lastSelectedRectKey = null
  let mutationObserver = null
  let readyAnnouncementAttempts = 0
  let readyAnnouncementTimer = null

  const logBridge = () => {}

  const cssEscape = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value)
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => {
      const code = character.codePointAt(0)
      return code ? '\\' + code.toString(16) + ' ' : character
    })
  }

  const postToParent = (message) => {
    window.parent.postMessage({
      source: BRIDGE_SOURCE,
      ...message,
    }, '*')
  }

  const toBridgeRect = (rect) => ({
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  })

  const resolveRectKey = (selector, rect) => {
    if (!selector || !rect) return null
    return [
      selector,
      rect.top,
      rect.left,
      rect.right,
      rect.bottom,
      rect.width,
      rect.height,
    ].join(':')
  }

  const resolveElementRect = (element) => {
    if (!element || !document.contains(element)) {
      return null
    }

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    return toBridgeRect(rect)
  }

  const clearPostedSelectionRect = () => {
    lastSelectedRectKey = null
  }

  const isBridgeOverlayNode = (node) => {
    return node instanceof Element && node.hasAttribute(OVERLAY_ATTR)
  }

  const shouldSyncFromMutations = (mutations) => {
    return mutations.some((mutation) => {
      if (isBridgeOverlayNode(mutation.target)) {
        return false
      }

      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (!isBridgeOverlayNode(node)) {
            return true
          }
        }

        for (const node of mutation.removedNodes) {
          if (!isBridgeOverlayNode(node)) {
            return true
          }
        }

        return false
      }

      return true
    })
  }

  const postSelectedRect = () => {
    if (!selectedElement || !selectedSelector) {
      clearPostedSelectionRect()
      return
    }

    const rect = resolveElementRect(selectedElement)
    if (!rect) {
      clearAll(true)
      return
    }

    const nextKey = resolveRectKey(selectedSelector, rect)
    if (nextKey && nextKey === lastSelectedRectKey) {
      return
    }

    lastSelectedRectKey = nextKey
    postToParent({
      type: 'selected',
      selector: selectedSelector,
      rect,
    })
  }

  const clearReadyAnnouncementTimer = () => {
    if (readyAnnouncementTimer === null) return
    window.clearInterval(readyAnnouncementTimer)
    readyAnnouncementTimer = null
  }

  const announceReady = () => {
    readyAnnouncementAttempts += 1
    logBridge('ready', { attempt: readyAnnouncementAttempts })
    postToParent({ type: 'ready' })

    if (readyAnnouncementAttempts >= READY_ANNOUNCEMENT_MAX_ATTEMPTS) {
      clearReadyAnnouncementTimer()
    }
  }

  const scheduleReadyAnnouncements = () => {
    clearReadyAnnouncementTimer()
    readyAnnouncementAttempts = 0
    announceReady()
    readyAnnouncementTimer = window.setInterval(announceReady, READY_ANNOUNCEMENT_INTERVAL_MS)
  }

  const isUniqueSelector = (selector) => {
    if (!selector) return false
    try {
      return document.querySelectorAll(selector).length === 1
    } catch {
      return false
    }
  }

  const getNthOfType = (element) => {
    let index = 1
    let sibling = element.previousElementSibling
    while (sibling) {
      if (sibling.tagName === element.tagName) {
        index += 1
      }
      sibling = sibling.previousElementSibling
    }
    return index
  }

  const formatLabelToken = (value) => {
    return String(value)
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('')
  }

  const resolveElementLabel = (element) => {
    const dataSection = element.getAttribute('data-section')
    if (dataSection) {
      return formatLabelToken(dataSection)
    }

    const ariaLabel = element.getAttribute('aria-label')
    if (ariaLabel) {
      return formatLabelToken(ariaLabel)
    }

    const title = element.getAttribute('title')
    if (title) {
      return formatLabelToken(title)
    }

    if (element.id) {
      return formatLabelToken(element.id)
    }

    const tagName = element.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tagName)) {
      return 'Header' + tagName.slice(1)
    }

    const tagLabelMap = {
      button: 'Button',
      section: 'Section',
      article: 'Article',
      nav: 'Navigation',
      header: 'Header',
      footer: 'Footer',
      main: 'Main',
      form: 'Form',
      input: 'Input',
      textarea: 'Textarea',
      select: 'Select',
      img: 'Image',
      a: 'Link',
      p: 'Paragraph',
      ul: 'List',
      ol: 'List',
      li: 'ListItem',
      span: 'Text',
      div: 'Container',
    }
    if (tagLabelMap[tagName]) {
      return tagLabelMap[tagName]
    }

    const className = Array.from(element.classList).find(Boolean)
    if (className) {
      return formatLabelToken(className)
    }

    return formatLabelToken(tagName) || 'Block'
  }

  const createOverlay = (kind) => {
    const element = document.createElement('div')
    element.setAttribute(OVERLAY_ATTR, kind)
    Object.assign(element.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '2147483647',
      borderRadius: '0',
      boxSizing: 'border-box',
      transition: 'all 120ms ease-out',
      border: kind === 'selected'
        ? '2px solid rgba(37, 99, 235, 0.92)'
        : '2px solid rgba(59, 130, 246, 0.65)',
      background: kind === 'selected'
        ? 'rgba(37, 99, 235, 0.16)'
        : 'rgba(59, 130, 246, 0.10)',
      boxShadow: kind === 'selected'
        ? '0 0 0 1px rgba(255,255,255,0.8), 0 10px 28px rgba(37, 99, 235, 0.16)'
        : '0 0 0 1px rgba(255,255,255,0.65), 0 8px 24px rgba(59, 130, 246, 0.12)',
    })
    document.body.appendChild(element)
    return element
  }

  const createOverlayLabel = (kind) => {
    const label = document.createElement('div')
    label.setAttribute(OVERLAY_ATTR, kind + '-label')
    Object.assign(label.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '2147483647',
      boxSizing: 'border-box',
      padding: '6px 10px',
      maxWidth: LABEL_MAX_WIDTH + 'px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '12px',
      lineHeight: '1',
      fontWeight: '600',
      letterSpacing: '0.01em',
      color: '#ffffff',
      background: kind === 'selected'
        ? 'rgba(37, 99, 235, 0.96)'
        : 'rgba(59, 130, 246, 0.92)',
      borderRadius: '4px',
      boxShadow: kind === 'selected'
        ? '0 8px 20px rgba(37, 99, 235, 0.22)'
        : '0 6px 16px rgba(59, 130, 246, 0.18)',
      transform: 'translateY(0)',
    })
    document.body.appendChild(label)
    return label
  }

  const hoverOverlay = createOverlay('hover')
  const selectedOverlay = createOverlay('selected')
  const hoverLabel = createOverlayLabel('hover')
  const selectedLabel = createOverlayLabel('selected')

  const updateOverlay = (overlay, element) => {
    if (!element || !document.contains(element)) {
      overlay.style.display = 'none'
      return
    }

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      overlay.style.display = 'none'
      return
    }

    overlay.style.display = 'block'
    overlay.style.left = rect.left + 'px'
    overlay.style.top = rect.top + 'px'
    overlay.style.width = rect.width + 'px'
    overlay.style.height = rect.height + 'px'
  }

  const updateOverlayLabel = (label, element) => {
    if (!element || !document.contains(element)) {
      label.style.display = 'none'
      label.textContent = ''
      return
    }

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      label.style.display = 'none'
      label.textContent = ''
      return
    }

    label.textContent = resolveElementLabel(element)
    label.style.display = 'block'
    label.style.left = rect.left + 'px'

    const labelHeight = label.getBoundingClientRect().height || 24
    const nextTop = Math.max(0, rect.top - labelHeight - 4)
    label.style.top = nextTop + 'px'
  }

  const syncOverlays = () => {
    const effectiveHoverElement = selectionModeEnabled && hoveredElement !== selectedElement
      ? hoveredElement
      : null

    updateOverlay(hoverOverlay, effectiveHoverElement)
    updateOverlayLabel(hoverLabel, effectiveHoverElement)
    updateOverlay(selectedOverlay, selectedElement)
    updateOverlayLabel(selectedLabel, selectedElement)

    if (selectedElement) {
      postSelectedRect()
    }
  }

  const resolveSelectableElement = (input) => {
    let element = input instanceof Element ? input : null

    while (element) {
      if (element.hasAttribute(OVERLAY_ATTR)) {
        element = element.parentElement
        continue
      }

      if (!BLOCKED_TAGS.has(element.tagName)) {
        return element
      }

      element = element.parentElement
    }

    return null
  }

  const resolveSelector = (element) => {
    if (element.id) {
      const idSelector = '#' + cssEscape(element.id)
      if (isUniqueSelector(idSelector)) {
        return idSelector
      }
    }

    const dataAttributes = Array.from(element.attributes)
      .filter((attribute) => attribute.name.startsWith('data-') && attribute.value)
    for (const attribute of dataAttributes) {
      const dataSelector = '[' + attribute.name + '="' + attribute.value.replace(/"/g, '\\"') + '"]'
      if (isUniqueSelector(dataSelector)) {
        return dataSelector
      }
    }

    const classNames = Array.from(element.classList)
      .filter((className) => /^[A-Za-z0-9_-]+$/.test(className))
      .slice(0, 2)
    if (classNames.length > 0) {
      const classSelector = element.tagName.toLowerCase() + '.' + classNames.map(cssEscape).join('.')
      if (isUniqueSelector(classSelector)) {
        return classSelector
      }
    }

    const segments = []
    let current = element
    while (current && !BLOCKED_TAGS.has(current.tagName)) {
      const tagName = current.tagName.toLowerCase()

      if (current.id) {
        segments.unshift('#' + cssEscape(current.id))
        const selector = segments.join(' > ')
        if (isUniqueSelector(selector)) {
          return selector
        }
        break
      }

      const nth = getNthOfType(current)
      segments.unshift(tagName + ':nth-of-type(' + nth + ')')
      const selector = segments.join(' > ')
      if (isUniqueSelector(selector)) {
        return selector
      }

      current = current.parentElement
    }

    return segments.join(' > ')
  }

  const clearHover = () => {
    hoveredElement = null
    hoveredSelector = null
    hoverOverlay.style.display = 'none'
    hoverLabel.style.display = 'none'
    hoverLabel.textContent = ''
  }

  const clearSelected = () => {
    selectedElement = null
    selectedSelector = null
    clearPostedSelectionRect()
    selectedOverlay.style.display = 'none'
    selectedLabel.style.display = 'none'
    selectedLabel.textContent = ''
  }

  const clearAll = (notifyParent) => {
    logBridge('clear-all', {
      notifyParent,
      selectionModeEnabled,
      hoveredSelector,
      selectedSelector,
    })
    clearHover()
    clearSelected()
    if (notifyParent) {
      postToParent({ type: 'reset' })
    }
  }

  const updateHoveredElement = (element) => {
    const selector = element ? resolveSelector(element) : null
    if (hoveredElement === element && hoveredSelector === selector) {
      syncOverlays()
      return
    }

    hoveredElement = element
    hoveredSelector = selector
    syncOverlays()
    postToParent({
      type: 'hover',
      selector,
    })
  }

  const selectElement = (element) => {
    const selector = element ? resolveSelector(element) : null
    if (!element || !selector) {
      clearAll(true)
      return
    }

    selectedElement = element
    selectedSelector = selector
    logBridge('select-element', { selector })
    syncOverlays()
  }

  const handleMouseMove = (event) => {
    if (!selectionModeEnabled) return
    updateHoveredElement(resolveSelectableElement(event.target))
  }

  const handleMouseOut = (event) => {
    if (!selectionModeEnabled) return

    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && document.contains(relatedTarget)) {
      return
    }

    updateHoveredElement(null)
  }

  const handleClick = (event) => {
    if (!selectionModeEnabled) return

    const target = resolveSelectableElement(event.target)
    if (!target) {
      clearAll(true)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation()
    }

    updateHoveredElement(target)
    selectElement(target)
  }

  const handleParentMessage = (event) => {
    const data = event.data
    if (!data || typeof data !== 'object') return
    if (data.source !== PARENT_SOURCE) return

    if (data.type === 'selection-mode') {
      logBridge('parent-message', {
        type: data.type,
        enabled: Boolean(data.enabled),
      })
      selectionModeEnabled = Boolean(data.enabled)
      if (!selectionModeEnabled) {
        clearAll(false)
      } else {
        syncOverlays()
      }
      return
    }

    if (data.type === 'selection-clear') {
      logBridge('parent-message', { type: data.type })
      selectionModeEnabled = false
      clearAll(false)
    }
  }

  const init = () => {
    if (document.documentElement.hasAttribute('data-page-builder-preview-bridge')) {
      return
    }

    document.documentElement.setAttribute('data-page-builder-preview-bridge', 'ready')
    document.addEventListener('mousemove', handleMouseMove, true)
    document.addEventListener('mouseout', handleMouseOut, true)
    document.addEventListener('click', handleClick, true)
    window.addEventListener('message', handleParentMessage)
    window.addEventListener('scroll', syncOverlays, true)
    window.addEventListener('resize', syncOverlays)
    if (typeof MutationObserver === 'function') {
      mutationObserver = new MutationObserver((mutations) => {
        if (!shouldSyncFromMutations(mutations)) {
          return
        }

        syncOverlays()
      })
      mutationObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
      })
    }
    scheduleReadyAnnouncements()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
})()
