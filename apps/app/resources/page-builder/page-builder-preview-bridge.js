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
  const CMS_ISLAND_ID_ATTR = 'data-proma-cms-island-id'
  const CMS_ISLAND_COMPONENT_ATTR = 'data-proma-cms-island-component'
  const CMS_ISLAND_SOURCE_SELECTOR_ATTR = 'data-proma-cms-island-source-selector'
  const CMS_ISLAND_PARENT_BLOCK_SELECTOR_ATTR = 'data-proma-cms-island-parent-block-selector'
  const CMS_ISLAND_EDIT_BOUNDARY_ATTR = 'data-proma-cms-island-edit-boundary'
  const CMS_PASSIVE_OVERLAY_KIND = 'cms-passive'
  const CMS_PASSIVE_LABEL_KIND = 'cms-passive-label'
  const CMS_PASSIVE_OVERLAY_ISLAND_ATTR = 'data-page-builder-preview-overlay-island-id'
  const BLOCKED_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'META', 'LINK'])
  const EDITABLE_TEXT_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'A', 'BUTTON', 'SPAN', 'LABEL', 'DIV'])
  const INLINE_EDITING_ATTR = 'data-page-builder-preview-inline-editing'
  const INLINE_SAVING_ATTR = 'data-page-builder-preview-inline-saving'
  const LABEL_MAX_WIDTH = 220
  const READY_ANNOUNCEMENT_INTERVAL_MS = 250
  const READY_ANNOUNCEMENT_MAX_ATTEMPTS = 12
  let selectionModeEnabled = false
  let selectionInteractionLocked = false
  let showCmsIslandOutlines = false
  let hoveredTarget = null
  let selectedTarget = null
  let lastSelectedRectKey = null
  let mutationObserver = null
  let readyAnnouncementAttempts = 0
  let readyAnnouncementTimer = null
  let activeInlineEdit = null
  let inlineSaveSequence = 0
  const pendingInlineSaves = new Map()
  const passiveCmsIslandOverlays = new Map()

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

  const resolveReplaceImageCapabilityKey = (capability) => {
    if (!capability || !capability.supported || !capability.targetDescriptor) {
      return 'replace-image:none'
    }

    return [
      'replace-image',
      capability.targetDescriptor.tagName,
      capability.targetDescriptor.childPath.join('.'),
    ].join(':')
  }

  const createBlockTargetSelection = (selector) => ({
    kind: 'block',
    selector,
    parentBlockSelector: selector,
    editBoundary: 'block',
  })

  const resolveTargetRuntimeKey = (targetSelection, islandId) => {
    return targetSelection.kind === 'cms-island'
      ? 'cms-island:' + (islandId ?? targetSelection.selector)
      : 'block:' + targetSelection.selector
  }

  const resolveRectKey = (targetSelection, rect, capabilities, islandId) => {
    if (!targetSelection || !rect) return null
    return [
      resolveTargetRuntimeKey(targetSelection, islandId),
      rect.top,
      rect.left,
      rect.right,
      rect.bottom,
      rect.width,
      rect.height,
      resolveReplaceImageCapabilityKey(capabilities?.replaceImage),
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

  const resolveGroupedRect = (elements) => {
    const rects = elements
      .filter((element) => element instanceof Element && document.contains(element))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)

    if (rects.length === 0) {
      return null
    }

    const left = Math.min(...rects.map((rect) => rect.left))
    const top = Math.min(...rects.map((rect) => rect.top))
    const right = Math.max(...rects.map((rect) => rect.right))
    const bottom = Math.max(...rects.map((rect) => rect.bottom))

    return toBridgeRect({
      top,
      left,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    })
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

  const resolveTargetRect = (target) => {
    if (!target) {
      return null
    }

    return target.targetSelection.kind === 'cms-island'
      ? resolveGroupedRect(target.elements)
      : resolveElementRect(target.primaryElement)
  }

  const refreshResolvedTarget = (target) => {
    if (!target) {
      return null
    }

    if (target.targetSelection.kind === 'cms-island') {
      const elements = resolveCmsIslandRoots(target.islandId)
      if (elements.length === 0) {
        return null
      }

      return {
        ...target,
        elements,
        primaryElement: elements[0],
      }
    }

    try {
      const element = document.querySelector(target.targetSelection.selector)
      if (!(element instanceof Element)) {
        return null
      }

      return {
        ...target,
        primaryElement: element,
        elements: [element],
      }
    } catch {
      return null
    }
  }

  const resolveReplaceImageCapabilityForTarget = (target) => {
    if (!target || target.targetSelection.kind !== 'block') {
      return null
    }

    return resolveReplaceImageCapability(target.primaryElement)
  }

  const postSelectedRect = () => {
    if (!selectedTarget) {
      clearPostedSelectionRect()
      return
    }

    const refreshedTarget = refreshResolvedTarget(selectedTarget)
    if (!refreshedTarget) {
      clearAll(true)
      return
    }

    selectedTarget = refreshedTarget

    const rect = resolveTargetRect(refreshedTarget)
    if (!rect) {
      clearAll(true)
      return
    }

    const replaceImage = resolveReplaceImageCapabilityForTarget(refreshedTarget)
    const capabilities = replaceImage
      ? {
          replaceImage,
        }
      : undefined
    const nextKey = resolveRectKey(
      refreshedTarget.targetSelection,
      rect,
      capabilities,
      refreshedTarget.islandId,
    )
    if (nextKey && nextKey === lastSelectedRectKey) {
      return
    }

    lastSelectedRectKey = nextKey
    postToParent({
      type: 'selected',
      selector: refreshedTarget.targetSelection.selector,
      targetSelection: refreshedTarget.targetSelection,
      rect,
      ...(capabilities ? { capabilities } : {}),
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

  const resolveTargetLabel = (target) => {
    if (!target) {
      return ''
    }

    return target.targetSelection.kind === 'cms-island'
      ? target.targetSelection.component
      : resolveElementLabel(target.primaryElement)
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

  const hideOverlayPair = (overlay, label) => {
    overlay.style.display = 'none'
    label.style.display = 'none'
    label.textContent = ''
  }

  const createPassiveCmsIslandOverlayPair = (islandId) => {
    const overlay = createOverlay(CMS_PASSIVE_OVERLAY_KIND)
    const label = createOverlayLabel(CMS_PASSIVE_OVERLAY_KIND)
    overlay.setAttribute(CMS_PASSIVE_OVERLAY_ISLAND_ATTR, islandId)
    label.setAttribute(CMS_PASSIVE_OVERLAY_ISLAND_ATTR, islandId)
    return {
      overlay,
      label,
    }
  }

  const clearPassiveCmsIslandOverlays = () => {
    for (const { overlay, label } of passiveCmsIslandOverlays.values()) {
      overlay.remove()
      label.remove()
    }

    passiveCmsIslandOverlays.clear()
  }

  const resolvePassiveCmsIslandTargets = () => {
    const seenIslandIds = new Set()
    const targets = []
    const roots = Array.from(document.querySelectorAll('[' + CMS_ISLAND_ID_ATTR + ']'))
      .filter((element) => element instanceof Element)

    for (const root of roots) {
      const islandId = root.getAttribute(CMS_ISLAND_ID_ATTR)
      if (!islandId || seenIslandIds.has(islandId)) {
        continue
      }

      const component = root.getAttribute(CMS_ISLAND_COMPONENT_ATTR)
      const sourceSelector = root.getAttribute(CMS_ISLAND_SOURCE_SELECTOR_ATTR)
      const parentBlockSelector = root.getAttribute(CMS_ISLAND_PARENT_BLOCK_SELECTOR_ATTR)
      const editBoundary = root.getAttribute(CMS_ISLAND_EDIT_BOUNDARY_ATTR)

      if (!component || !sourceSelector || !parentBlockSelector) {
        continue
      }

      const elements = Array.from(document.querySelectorAll('[' + CMS_ISLAND_ID_ATTR + '="' + islandId + '"]'))
        .filter((element) => element instanceof Element)
      if (elements.length === 0) {
        continue
      }

      seenIslandIds.add(islandId)
      targets.push({
        key: resolveTargetRuntimeKey({
          kind: 'cms-island',
          selector: sourceSelector,
          parentBlockSelector,
          component,
          editBoundary: 'source-atomic',
        }, islandId),
        islandId,
        targetSelection: {
          kind: 'cms-island',
          selector: sourceSelector,
          parentBlockSelector,
          component,
          editBoundary: editBoundary === 'source-atomic' ? editBoundary : 'source-atomic',
        },
        primaryElement: elements[0],
        elements,
      })
    }

    return targets
  }

  const resolveOverlayBorder = (kind, target) => {
    return kind === 'selected' && target?.targetSelection.kind !== 'cms-island'
      ? '2px solid rgba(37, 99, 235, 0.92)'
      : '2px dashed rgba(59, 130, 246, 0.65)'
  }

  const resolveOverlayBackground = (kind, target) => {
    if (kind === 'selected' && target?.targetSelection.kind !== 'cms-island') {
      return 'rgba(37, 99, 235, 0.16)'
    }

    return target?.targetSelection.kind === 'cms-island'
      ? 'rgba(59, 130, 246, 0.07)'
      : 'rgba(59, 130, 246, 0.10)'
  }

  const resolveOverlayShadow = (kind, target) => {
    if (kind === 'selected' && target?.targetSelection.kind !== 'cms-island') {
      return '0 0 0 1px rgba(255,255,255,0.8), 0 10px 28px rgba(37, 99, 235, 0.16)'
    }

    return target?.targetSelection.kind === 'cms-island'
      ? '0 0 0 1px rgba(255,255,255,0.72), 0 8px 24px rgba(59, 130, 246, 0.10)'
      : '0 0 0 1px rgba(255,255,255,0.65), 0 8px 24px rgba(59, 130, 246, 0.12)'
  }

  const updateOverlay = (overlay, target, kind) => {
    const rect = resolveTargetRect(target)
    if (!target || !rect) {
      overlay.style.display = 'none'
      return
    }

    overlay.style.display = 'block'
    overlay.style.left = rect.left + 'px'
    overlay.style.top = rect.top + 'px'
    overlay.style.width = rect.width + 'px'
    overlay.style.height = rect.height + 'px'
    overlay.style.border = resolveOverlayBorder(kind, target)
    overlay.style.background = resolveOverlayBackground(kind, target)
    overlay.style.boxShadow = resolveOverlayShadow(kind, target)
  }

  const updateOverlayLabel = (label, target) => {
    const rect = resolveTargetRect(target)
    if (!target || !rect) {
      label.style.display = 'none'
      label.textContent = ''
      return
    }

    label.textContent = resolveTargetLabel(target)
    label.style.display = 'block'

    const labelRect = label.getBoundingClientRect()
    const labelWidth = labelRect.width || LABEL_MAX_WIDTH
    const labelHeight = labelRect.height || 24
    const desiredLeft = target.targetSelection.kind === 'cms-island'
      ? rect.right - labelWidth
      : rect.left
    const maxLeft = Math.max(0, window.innerWidth - labelWidth)
    const nextTop = Math.max(0, rect.top - labelHeight - 4)

    label.style.left = Math.min(Math.max(0, desiredLeft), maxLeft) + 'px'
    label.style.top = nextTop + 'px'
  }

  const resolveEffectiveHoverTarget = () => {
    return selectionModeEnabled
      && !selectionInteractionLocked
      && hoveredTarget
      && (!selectedTarget || hoveredTarget.key !== selectedTarget.key)
      ? hoveredTarget
      : null
  }

  const syncPassiveCmsIslandOverlays = (effectiveHoverTarget) => {
    if (!selectionModeEnabled || !showCmsIslandOutlines) {
      clearPassiveCmsIslandOverlays()
      return
    }

    const passiveTargets = resolvePassiveCmsIslandTargets()
    const activeIslandIds = new Set(passiveTargets.map((target) => target.islandId))
    for (const [islandId, pair] of passiveCmsIslandOverlays.entries()) {
      if (!activeIslandIds.has(islandId)) {
        pair.overlay.remove()
        pair.label.remove()
        passiveCmsIslandOverlays.delete(islandId)
      }
    }

    const hiddenIslandIds = new Set()
    if (selectedTarget?.targetSelection.kind === 'cms-island') {
      hiddenIslandIds.add(selectedTarget.islandId)
    }
    if (effectiveHoverTarget?.targetSelection.kind === 'cms-island') {
      hiddenIslandIds.add(effectiveHoverTarget.islandId)
    }

    for (const target of passiveTargets) {
      let pair = passiveCmsIslandOverlays.get(target.islandId)
      if (!pair) {
        pair = createPassiveCmsIslandOverlayPair(target.islandId)
        passiveCmsIslandOverlays.set(target.islandId, pair)
      }

      if (hiddenIslandIds.has(target.islandId)) {
        hideOverlayPair(pair.overlay, pair.label)
        continue
      }

      updateOverlay(pair.overlay, target, 'hover')
      updateOverlayLabel(pair.label, target)
    }
  }

  const syncOverlays = () => {
    const hadSelectedTarget = Boolean(selectedTarget)
    hoveredTarget = refreshResolvedTarget(hoveredTarget)
    selectedTarget = refreshResolvedTarget(selectedTarget)

    if (hadSelectedTarget && !selectedTarget) {
      clearAll(true)
      return
    }

    if (selectedTarget === null && activeInlineEdit) {
      discardActiveInlineEdit()
    }

    const effectiveHoverTarget = resolveEffectiveHoverTarget()

    updateOverlay(hoverOverlay, effectiveHoverTarget, 'hover')
    updateOverlayLabel(hoverLabel, effectiveHoverTarget)
    updateOverlay(selectedOverlay, selectedTarget, 'selected')
    updateOverlayLabel(selectedLabel, selectedTarget)
    syncPassiveCmsIslandOverlays(effectiveHoverTarget)

    if (selectedTarget) {
      postSelectedRect()
      return
    }

    clearPostedSelectionRect()
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

  const resolveCmsIslandRoots = (islandId) => {
    if (!islandId) {
      return []
    }

    try {
      return Array.from(document.querySelectorAll('[' + CMS_ISLAND_ID_ATTR + '="' + islandId + '"]'))
        .filter((element) => element instanceof Element)
    } catch {
      return []
    }
  }

  const resolveCmsIslandTarget = (input) => {
    let element = input instanceof Element ? input : null

    while (element) {
      if (element.hasAttribute(OVERLAY_ATTR)) {
        element = element.parentElement
        continue
      }

      const islandId = element.getAttribute(CMS_ISLAND_ID_ATTR)
      if (islandId) {
        const component = element.getAttribute(CMS_ISLAND_COMPONENT_ATTR)
        const sourceSelector = element.getAttribute(CMS_ISLAND_SOURCE_SELECTOR_ATTR)
        const parentBlockSelector = element.getAttribute(CMS_ISLAND_PARENT_BLOCK_SELECTOR_ATTR)
        const editBoundary = element.getAttribute(CMS_ISLAND_EDIT_BOUNDARY_ATTR)

        if (!component || !sourceSelector || !parentBlockSelector) {
          return null
        }

        const elements = resolveCmsIslandRoots(islandId)
        if (elements.length === 0) {
          return null
        }

        return {
          key: resolveTargetRuntimeKey({
            kind: 'cms-island',
            selector: sourceSelector,
            parentBlockSelector,
            component,
            editBoundary: 'source-atomic',
          }, islandId),
          islandId,
          targetSelection: {
            kind: 'cms-island',
            selector: sourceSelector,
            parentBlockSelector,
            component,
            editBoundary: editBoundary === 'source-atomic' ? editBoundary : 'source-atomic',
          },
          primaryElement: element,
          elements,
        }
      }

      element = element.parentElement
    }

    return null
  }

  const resolveSelectableTarget = (input) => {
    const cmsIslandTarget = resolveCmsIslandTarget(input)
    if (cmsIslandTarget) {
      return cmsIslandTarget
    }

    const element = resolveSelectableElement(input)
    const selector = element ? resolveSelector(element) : null
    if (!element || !selector) {
      return null
    }

    return {
      key: resolveTargetRuntimeKey(createBlockTargetSelection(selector)),
      targetSelection: createBlockTargetSelection(selector),
      primaryElement: element,
      elements: [element],
    }
  }

  const hasVisibleDirectText = (element) => {
    return Array.from(element.childNodes).some((node) =>
      node.nodeType === Node.TEXT_NODE && Boolean(node.textContent && node.textContent.trim()),
    )
  }

  const isEditableTextHost = (element) => {
    if (!(element instanceof Element)) {
      return false
    }

    if (!EDITABLE_TEXT_TAGS.has(element.tagName)) {
      return false
    }

    if (element.children.length > 0) {
      return false
    }

    return hasVisibleDirectText(element)
  }

  const buildChildPath = (root, element) => {
    const path = []
    let current = element

    while (current && current !== root) {
      const parent = current.parentElement
      if (!parent) {
        return null
      }

      const index = Array.from(parent.children).indexOf(current)
      if (index < 0) {
        return null
      }

      path.unshift(index)
      current = parent
    }

    return current === root ? path : null
  }

  const resolveReplaceImageTargetDescriptor = (root, element) => {
    if (!root || !element || !root.contains(element) || element.tagName !== 'IMG') {
      return null
    }

    const childPath = buildChildPath(root, element)
    if (!childPath) {
      return null
    }

    return {
      version: 1,
      tagName: element.tagName.toLowerCase(),
      childPath,
    }
  }

  const resolveReplaceImageCapability = (element) => {
    if (!(element instanceof Element)) {
      return null
    }

    if (element.tagName === 'IMG') {
      const targetDescriptor = resolveReplaceImageTargetDescriptor(element, element)
      return targetDescriptor
        ? {
            supported: true,
            targetDescriptor,
          }
        : null
    }

    const imageElements = Array.from(element.querySelectorAll('img'))
    if (imageElements.length !== 1) {
      return null
    }

    const targetDescriptor = resolveReplaceImageTargetDescriptor(element, imageElements[0])
    return targetDescriptor
      ? {
          supported: true,
          targetDescriptor,
        }
      : null
  }

  const resolveEditableTextTargetDescriptor = (root, element) => {
    if (!root || !element || !root.contains(element) || !isEditableTextHost(element)) {
      return null
    }

    const childPath = buildChildPath(root, element)
    if (!childPath) {
      return null
    }

    return {
      version: 1,
      tagName: element.tagName.toLowerCase(),
      childPath,
    }
  }

  const resolveEditableTextHost = (input) => {
    if (!selectedTarget || selectedTarget.targetSelection.kind !== 'block') {
      return null
    }

    const selectedElement = selectedTarget.primaryElement
    let element = input instanceof Element ? input : null
    while (element && selectedElement.contains(element)) {
      if (isEditableTextHost(element)) {
        const descriptor = resolveEditableTextTargetDescriptor(selectedElement, element)
        if (descriptor) {
          return element
        }
      }

      if (element === selectedElement) {
        break
      }

      element = element.parentElement
    }

    return null
  }

  const placeCaretAtEnd = (element) => {
    const selection = window.getSelection()
    if (!selection) {
      return
    }

    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const teardownInlineEdit = (context) => {
    const { element } = context
    element.removeEventListener('blur', handleInlineTextBlur)
    element.removeAttribute(INLINE_EDITING_ATTR)

    if (context.previousContentEditable === null) {
      element.removeAttribute('contenteditable')
    } else {
      element.setAttribute('contenteditable', context.previousContentEditable)
    }

    if (context.previousTabIndex === null) {
      element.removeAttribute('tabindex')
    } else {
      element.setAttribute('tabindex', context.previousTabIndex)
    }
  }

  const discardActiveInlineEdit = () => {
    if (!activeInlineEdit) {
      return
    }

    teardownInlineEdit(activeInlineEdit)
    activeInlineEdit = null
  }

  function handleInlineTextBlur(event) {
    const context = activeInlineEdit
    if (!context || event.currentTarget !== context.element) {
      return
    }

    const nextText = context.element.textContent ?? ''
    teardownInlineEdit(context)
    activeInlineEdit = null

    if (nextText === context.originalText) {
      syncOverlays()
      return
    }

    const requestId = 'inline-text-save-' + String(++inlineSaveSequence)
    context.element.setAttribute(INLINE_SAVING_ATTR, 'true')
    pendingInlineSaves.set(requestId, {
      element: context.element,
      previousText: context.originalText,
      nextText,
    })

    postToParent({
      type: 'inline-text-save-request',
      requestId,
      selector: context.selector,
      textTargetDescriptor: context.descriptor,
      previousText: context.originalText,
      nextText,
    })
    syncOverlays()
  }

  const activateInlineEdit = (element) => {
    if (!selectedTarget || selectedTarget.targetSelection.kind !== 'block') {
      return false
    }

    const descriptor = resolveEditableTextTargetDescriptor(selectedTarget.primaryElement, element)
    if (!descriptor) {
      return false
    }

    if (activeInlineEdit && activeInlineEdit.element === element) {
      return true
    }

    discardActiveInlineEdit()

    activeInlineEdit = {
      element,
      selector: selectedTarget.targetSelection.selector,
      descriptor,
      originalText: element.textContent ?? '',
      previousContentEditable: element.getAttribute('contenteditable'),
      previousTabIndex: element.getAttribute('tabindex'),
    }

    element.setAttribute('contenteditable', 'true')
    element.setAttribute('tabindex', '-1')
    element.setAttribute(INLINE_EDITING_ATTR, 'true')
    element.addEventListener('blur', handleInlineTextBlur)
    element.focus()
    placeCaretAtEnd(element)
    return true
  }

  const handleInlineTextSaveResult = (message) => {
    const pending = pendingInlineSaves.get(message.requestId)
    if (!pending) {
      return
    }

    pendingInlineSaves.delete(message.requestId)

    if (!document.contains(pending.element)) {
      return
    }

    pending.element.removeAttribute(INLINE_SAVING_ATTR)
    if (!message.ok) {
      pending.element.textContent = pending.previousText
    }

    syncOverlays()
  }

  const clearHover = () => {
    hoveredTarget = null
    hideOverlayPair(hoverOverlay, hoverLabel)
  }

  const clearSelected = () => {
    discardActiveInlineEdit()
    selectedTarget = null
    clearPostedSelectionRect()
    hideOverlayPair(selectedOverlay, selectedLabel)
  }

  const clearAll = (notifyParent) => {
    logBridge('clear-all', {
      notifyParent,
      selectionModeEnabled,
      hoveredSelector: hoveredTarget?.targetSelection.selector ?? null,
      selectedSelector: selectedTarget?.targetSelection.selector ?? null,
    })
    clearHover()
    clearSelected()
    syncPassiveCmsIslandOverlays(null)
    if (notifyParent) {
      postToParent({ type: 'reset' })
    }
  }

  const updateHoveredTarget = (target) => {
    const nextTarget = target ? refreshResolvedTarget(target) : null
    if (hoveredTarget?.key === nextTarget?.key) {
      syncOverlays()
      return
    }

    hoveredTarget = nextTarget
    syncOverlays()
    postToParent({
      type: 'hover',
      selector: nextTarget?.targetSelection.selector ?? null,
      targetSelection: nextTarget?.targetSelection ?? null,
    })
  }

  const selectTarget = (target) => {
    const nextTarget = target ? refreshResolvedTarget(target) : null
    if (!nextTarget) {
      clearAll(true)
      return
    }

    selectedTarget = nextTarget
    logBridge('select-target', { selector: nextTarget.targetSelection.selector, kind: nextTarget.targetSelection.kind })
    syncOverlays()
  }

  const shouldRetargetSelection = (target) => {
    return Boolean(
      selectedTarget
      && target
      && selectedTarget.targetSelection.kind === 'block'
      && target.targetSelection.kind === 'block'
      && selectedTarget.key !== target.key
      && selectedTarget.primaryElement !== target.primaryElement
      && selectedTarget.primaryElement.contains(target.primaryElement),
    )
  }

  const handleMouseMove = (event) => {
    if (!selectionModeEnabled || selectionInteractionLocked) return
    const target = resolveSelectableTarget(event.target)
    updateHoveredTarget(target)
  }

  const handleMouseOut = (event) => {
    if (!selectionModeEnabled || selectionInteractionLocked) return

    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && document.contains(relatedTarget)) {
      return
    }

    updateHoveredTarget(null)
  }

  const handleClick = (event) => {
    if (!selectionModeEnabled || selectionInteractionLocked) return

    const target = resolveSelectableTarget(event.target)
    if (!target) {
      clearAll(true)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation()
    }

    if (shouldRetargetSelection(target)) {
      if (activeInlineEdit && activeInlineEdit.element !== target.primaryElement) {
        activeInlineEdit.element.blur()
      }

      updateHoveredTarget(target)
      selectTarget(target)
      return
    }

    if (selectedTarget && selectedTarget.key === target.key) {
      if (activeInlineEdit && activeInlineEdit.element !== target.primaryElement) {
        activeInlineEdit.element.blur()
      }

      updateHoveredTarget(selectedTarget)
      if (selectedTarget.targetSelection.kind === 'block') {
        const editableHost = resolveEditableTextHost(event.target)
        if (editableHost) {
          activateInlineEdit(editableHost)
        } else {
          syncOverlays()
        }
      } else {
        syncOverlays()
      }
      return
    }

    if (activeInlineEdit && activeInlineEdit.element !== target.primaryElement) {
      activeInlineEdit.element.blur()
    }

    updateHoveredTarget(target)
    selectTarget(target)
  }

  const handleParentMessage = (event) => {
    const data = event.data
    if (!data || typeof data !== 'object') return
    if (data.source !== PARENT_SOURCE) return

    if (data.type === 'selection-mode') {
      logBridge('parent-message', {
        type: data.type,
        enabled: Boolean(data.enabled),
        locked: Boolean(data.locked),
        showCmsIslandOutlines: Boolean(data.showCmsIslandOutlines),
      })
      selectionModeEnabled = Boolean(data.enabled)
      selectionInteractionLocked = Boolean(data.locked)
      showCmsIslandOutlines = Boolean(data.showCmsIslandOutlines)
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
      selectionInteractionLocked = false
      showCmsIslandOutlines = false
      clearAll(false)
      return
    }

    if (data.type === 'inline-text-save-result') {
      handleInlineTextSaveResult(data)
    }
  }

  const shouldWaitForCmsRenderingReady = window.__PROMA_CMS_RENDERING_PREVIEW__?.hasCmsRendering === true

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

  const initWhenPreviewReady = () => {
    if (shouldWaitForCmsRenderingReady) {
      if (window.__PROMA_CMS_RENDERING_PREVIEW_READY__ === true) {
        init()
        return
      }

      document.addEventListener('proma:cms-rendering-ready', init, { once: true })
      return
    }

    init()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenPreviewReady, { once: true })
  } else {
    initWhenPreviewReady()
  }
})()
