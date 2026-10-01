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
  getController(name: string): { viewport?: { vlayout?: {
    getItem(name: string): { height: number } | undefined
    doLayout(): void
  } } } | undefined
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

  const style = doc.createElement('style')
  style.textContent = `
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
  `
  doc.head.append(style)

  const resetHeader = () => { restoreHeader?.(); restoreHeader = null; header = null }
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
      const required = (actions?.scrollWidth ?? 0) + (extra?.scrollWidth ?? 0) + 148
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
    observer.disconnect(); mutation.disconnect(); unsubscribe()
    editorWindow.cancelAnimationFrame(scheduled)
    resetHeader(); style.remove()
    editorWindow.removeEventListener('pagehide', unload)
    void chrome.setIntegrated(false).catch(() => {})
  }
  editorWindow.addEventListener('pagehide', unload)
  return cleanup
}
