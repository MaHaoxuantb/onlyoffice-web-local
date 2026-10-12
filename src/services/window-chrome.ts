/** ONLYOFFICE's same-origin iframe adapts its own native header. The outer app
 * remains the sole SDK client trusted by LFOS. No editor actions are replaced. */
export interface WindowChromeGeometry {
  mode: 'overlay' | 'titlebar'
  canIntegrate: boolean
  headerHeight: number
  leadingInset: number
  trailingInset: number
}

export interface WindowChromeAPI {
  get(): Promise<WindowChromeGeometry>
  subscribe(listener: (geometry: WindowChromeGeometry) => void): () => void
  setIntegrated(integrated: boolean): Promise<WindowChromeGeometry>
  bindDragRegion(element: HTMLElement): () => void
}

type EditorWindow = Window & {
  DE?: EditorNamespace
  SSE?: EditorNamespace
  PE?: EditorNamespace
}
interface EditorNamespace {
  getController(name: string): {
    viewport?: { vlayout?: {
      getItem(name: string): { height: number } | undefined
      doLayout(): void
    } }
    onLayoutChanged?(region: string): void
    api?: {
      asc_setViewMode(view: boolean): void
      Resize?(): void
      asc_Resize?(): void
    }
  } | undefined
}

export function installOnlyOfficeWindowChrome(frame: HTMLIFrameElement, chrome: WindowChromeAPI): () => void {
  const editorWindow = frame.contentWindow as EditorWindow | null
  const doc = frame.contentDocument
  if (!editorWindow || !doc) return () => {}
  let disposed = false
  let pending = false
  let scheduled = 0
  let geometry: WindowChromeGeometry | null = null
  let header: HTMLElement | null = null
  let restoreHeader: (() => void) | null = null
  let integrated = false
  let nativeHeight = 28
  let titleBox: HTMLElement | null = null
  let editorMode: 'view' | 'edit' = 'edit'
  let modeSwitch: HTMLButtonElement | null = null
  let removeModeSwitchListeners: (() => void) | null = null
  let editToolbarHeight: number | null = null

  const style = doc.createElement('style')
  style.textContent = `
    #file-menu-panel.lfos-view-hidden,
    #right-menu.lfos-view-hidden { display: none !important; }
    #app-title.lfos-integrated-header { touch-action: none; }
    .lfos-integrated-header #box-document-title {
      box-sizing: border-box;
      padding-left: var(--lfos-window-chrome-leading);
      padding-right: var(--lfos-window-chrome-trailing);
      align-items: center;
    }
    .lfos-integrated-header #box-document-title > .extra,
    .lfos-integrated-header #box-document-title > .hedset { flex: 0 0 auto; height: 100%; }
    .lfos-integrated-header #id-box-doc-name { min-width: 100px; flex: 1 1 auto; height: 100%; align-items: center; }
    .lfos-integrated-header #title-doc-name { margin-left: 0 !important; max-width: 100%; max-height: 100%; box-sizing: border-box; }
    .lfos-integrated-header .btn-header { height: 100%; }
    .lfos-editor-mode-switch {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      height: 28px;
      margin: 0 12px;
      padding: 2px;
      border: 1px solid rgba(255, 255, 255, 0.42);
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.14);
      color: rgba(255, 255, 255, 0.78);
      font: 600 12px/1 system-ui, sans-serif;
      cursor: pointer;
    }
    .lfos-editor-mode-switch > span {
      min-width: 36px;
      padding: 5px 9px;
      border-radius: 999px;
      text-align: center;
    }
    .lfos-editor-mode-switch[data-mode='view'] > [data-mode='view'],
    .lfos-editor-mode-switch[data-mode='edit'] > [data-mode='edit'] {
      background: rgba(255, 255, 255, 0.94);
      color: #343434;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    }
    .lfos-editor-mode-switch:focus-visible { outline: 2px solid white; outline-offset: 2px; }
  `
  doc.head.append(style)

  const updateModeSwitch = (mode: 'view' | 'edit') => {
    editorMode = mode
    if (modeSwitch) {
      modeSwitch.dataset.mode = mode
      modeSwitch.setAttribute('aria-checked', String(mode === 'edit'))
      modeSwitch.title = mode === 'edit' ? 'Switch to view mode' : 'Switch to edit mode'
    }
  }
  const updateToolbarVisibility = (mode: 'view' | 'edit') => {
    const namespace = editorWindow.DE ?? editorWindow.SSE ?? editorWindow.PE
    const viewportController = namespace?.getController('Viewport')
    const layout = viewportController?.viewport?.vlayout
    const api = namespace?.getController('Main')?.api
    const toolbarItem = layout?.getItem('toolbar')
    const toolbar = doc.querySelector<HTMLElement>('#toolbar')
    const fileMenu = doc.querySelector<HTMLElement>('#file-menu-panel')
    const rightMenu = doc.querySelector<HTMLElement>('#right-menu')
    if (!layout || !toolbarItem || !toolbar) return
    if (mode === 'view') {
      if (toolbarItem.height > 0) editToolbarHeight = toolbarItem.height
      // Hide the ribbon while allowing the viewport to use its former space.
      toolbar.style.setProperty('visibility', 'hidden', 'important')
      toolbar.style.setProperty('pointer-events', 'none', 'important')
      toolbar.setAttribute('aria-hidden', 'true')
      toolbarItem.height = 0
      fileMenu?.classList.add('lfos-view-hidden')
      rightMenu?.classList.add('lfos-view-hidden')
    } else {
      toolbar.style.removeProperty('visibility')
      toolbar.style.removeProperty('pointer-events')
      toolbar.removeAttribute('aria-hidden')
      // ONLYOFFICE owns the panel's inline display:none. Removing it exposes
      // an absolute, z-index:1003 panel above the ribbon (z-index:1001).
      fileMenu?.classList.remove('lfos-view-hidden')
      rightMenu?.classList.remove('lfos-view-hidden')
      if (editToolbarHeight !== null) toolbarItem.height = editToolbarHeight
    }
    const resizeEditor = () => {
      if (disposed) return
      if (api?.asc_Resize) api.asc_Resize()
      else api?.Resize?.()
    }
    if (viewportController.onLayoutChanged) viewportController.onLayoutChanged('toolbar')
    else {
      layout.doLayout()
      resizeEditor()
    }
    editorWindow.requestAnimationFrame(resizeEditor)
  }
  const setEditorMode = (mode: 'view' | 'edit') => {
    const namespace = editorWindow.DE ?? editorWindow.SSE ?? editorWindow.PE
    const api = namespace?.getController('Main')?.api
    if (!api) return
    if (mode === 'edit') updateToolbarVisibility(mode)
    api.asc_setViewMode(mode === 'view')
    if (mode === 'view') updateToolbarVisibility(mode)
    updateModeSwitch(mode)
  }
  const installModeSwitch = (title: HTMLElement) => {
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = 'lfos-editor-mode-switch'
    button.setAttribute('role', 'switch')
    button.setAttribute('aria-label', 'Document editing mode')
    button.innerHTML = '<span data-mode="view">View</span><span data-mode="edit">Edit</span>'
    const stopDrag = (event: Event) => event.stopPropagation()
    const toggleMode = (event: Event) => {
      event.stopPropagation()
      setEditorMode(editorMode === 'edit' ? 'view' : 'edit')
    }
    button.addEventListener('pointerdown', stopDrag)
    button.addEventListener('mousedown', stopDrag)
    button.addEventListener('click', toggleMode)
    title.append(button)
    modeSwitch = button
    removeModeSwitchListeners = () => {
      button.removeEventListener('pointerdown', stopDrag)
      button.removeEventListener('mousedown', stopDrag)
      button.removeEventListener('click', toggleMode)
      button.remove()
      if (modeSwitch === button) modeSwitch = null
    }
    updateModeSwitch(editorMode)
    if (editorMode === 'view') updateToolbarVisibility(editorMode)
  }
  const resetHeader = () => {
    removeModeSwitchListeners?.()
    removeModeSwitchListeners = null
    restoreHeader?.()
    restoreHeader = null
    header = null
  }
  const update = () => {
    if (disposed || !geometry) return
    try {
      const next = doc.querySelector<HTMLElement>('#app-title')
      const namespace = editorWindow.DE ?? editorWindow.SSE ?? editorWindow.PE
      const layout = namespace?.getController('Viewport')?.viewport?.vlayout
      const item = layout?.getItem('title')
      const title = next?.querySelector<HTMLElement>('#box-document-title')
      titleBox = title ?? null
      if (next !== header) resetHeader()
      if (next && title && layout && item && !header) {
        header = next
        const originalHeight = item.height
        nativeHeight = originalHeight
        const unbind = chrome.bindDragRegion(next)
        installModeSwitch(title)
        restoreHeader = () => {
          unbind()
          next.classList.remove('lfos-integrated-header')
          for (const name of ['height', 'leading', 'trailing']) next.style.removeProperty(`--lfos-window-chrome-${name}`)
          item.height = originalHeight
          layout.doLayout()
        }
      }
      const actions = title?.querySelector<HTMLElement>(':scope > .hedset')
      const extra = title?.querySelector<HTMLElement>(':scope > .extra')
      // Reserve room for every action, an editable title, and an empty drag area.
      const required = (actions?.scrollWidth ?? 0) + (extra?.scrollWidth ?? 0) +
        (modeSwitch?.scrollWidth ?? 0) + 172
      const fits = !!(geometry.canIntegrate && header && title && actions && layout && item &&
        header.getBoundingClientRect().height > 0 && Math.abs(frame.getBoundingClientRect().top) <= 1 &&
        frame.clientWidth >= geometry.leadingInset + geometry.trailingInset + required)
      if (header && item && layout && title) {
        for (const [name, value] of Object.entries({ height: geometry.headerHeight, leading: geometry.leadingInset, trailing: geometry.trailingInset })) {
          header.style.setProperty(`--lfos-window-chrome-${name}`, `${value}px`)
        }
        header.classList.toggle('lfos-integrated-header', fits)
        const height = fits ? geometry.headerHeight : nativeHeight
        if (item.height !== height) { item.height = height; layout.doLayout() }
      }
      if (pending || (fits === integrated && fits === (geometry.mode === 'overlay'))) return
      pending = true
      void chrome.setIntegrated(fits).then(value => {
        if (disposed || !geometry) {
          void chrome.setIntegrated(false).catch(() => {})
          return
        }
        integrated = fits
        geometry = value
      }).catch(() => {
        // A failed handshake must not leave the native header modified.
        integrated = false
        resetHeader()
        geometry = null
      }).finally(() => { pending = false; if (!disposed && geometry) schedule() })
    } catch {
      resetHeader()
      geometry = null
      void chrome.setIntegrated(false).catch(() => {})
    }
  }
  const schedule = () => {
    if (disposed || scheduled) return
    scheduled = editorWindow.requestAnimationFrame(() => { scheduled = 0; update() })
  }
  const observer = new ResizeObserver(schedule)
  observer.observe(frame)
  const mutation = new MutationObserver(() => {
    // ONLYOFFICE can rebuild its title row after UI preferences change.
    if (doc.querySelector('#app-title') !== header || doc.querySelector('#box-document-title') !== titleBox) schedule()
  })
  mutation.observe(doc.body, { childList: true, subtree: true })
  const unsubscribe = chrome.subscribe(value => { geometry = value; schedule() })
  void chrome.get().then(value => { if (!disposed) { geometry = value; schedule() } }).catch(() => {})
  const unload = () => cleanup()
  const cleanup = () => {
    if (disposed) return
    disposed = true
    setEditorMode('edit')
    observer.disconnect(); mutation.disconnect(); unsubscribe()
    editorWindow.cancelAnimationFrame(scheduled)
    resetHeader(); style.remove()
    editorWindow.removeEventListener('pagehide', unload)
    void chrome.setIntegrated(false).catch(() => {})
  }
  editorWindow.addEventListener('pagehide', unload)
  return cleanup
}
