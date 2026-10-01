import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function loadAdapter() {
  const source = await readFile(new URL('../src/services/window-chrome.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

function fixture(namespaceName) {
  const properties = new Map(), classes = new Set(), events = new Map(), queue = new Map()
  let frameId = 0, subscribed, resizer
  const actions = { scrollWidth: 240 }, extra = { scrollWidth: 0 }
  const title = { querySelector: name => name.includes('.hedset') ? actions : extra }
  const header = { getBoundingClientRect: () => ({ height: 28 }), classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: name => classes.delete(name) }, style: { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) }, querySelector: () => title }
  const item = { height: 28 }, calls = [], bindings = []
  const doc = { head: { append() {} }, body: {}, createElement: () => ({ remove() {} }), querySelector: name => name === '#app-title' ? header : title }
  const win = { [namespaceName]: { getController: () => ({ viewport: { vlayout: { getItem: () => item, doLayout() {} } } }) }, requestAnimationFrame: fn => { queue.set(++frameId, fn); return frameId }, cancelAnimationFrame: id => queue.delete(id), addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) }
  const frame = { contentDocument: doc, contentWindow: win, clientWidth: 1000, getBoundingClientRect: () => ({ top: 0 }) }
  let geometry = { canIntegrate: true, mode: 'titlebar', headerHeight: 48, leadingInset: 108, trailingInset: 64 }
  const chrome = { get: async () => geometry, subscribe: fn => { subscribed = fn; fn(geometry); return () => subscribed = null }, bindDragRegion: element => { bindings.push(element); return () => bindings.splice(bindings.indexOf(element), 1) }, setIntegrated: async integrated => { calls.push(integrated); geometry = { ...geometry, mode: integrated ? 'overlay' : 'titlebar' }; subscribed?.(geometry); return geometry } }
  globalThis.ResizeObserver = class { constructor(fn) { resizer = fn } observe() {} disconnect() {} }
  globalThis.MutationObserver = class { observe() {} disconnect() {} }
  const flush = async () => { for (let i = 0; i < 8; i++) { await Promise.resolve(); const pending = [...queue.values()]; queue.clear(); pending.forEach(fn => fn()); } }
  return { frame, chrome, item, properties, classes, bindings, calls, flush, resize: () => resizer(), geometry: value => { geometry = value; subscribed?.(value) } }
}

test('all three native editor headers integrate, fall back on narrow widths, update zoom, and clean up', async () => {
  const originalResize = globalThis.ResizeObserver, originalMutation = globalThis.MutationObserver
  const { installOnlyOfficeWindowChrome } = await loadAdapter()
  try {
    for (const namespace of ['DE', 'SSE', 'PE']) {
      const f = fixture(namespace)
      const dispose = installOnlyOfficeWindowChrome(f.frame, f.chrome)
      await f.flush()
      assert.deepEqual(f.calls, [true])
      assert.equal(f.item.height, 48)
      assert.equal(f.properties.get('--lfos-window-chrome-leading'), '108px')
      assert.ok(f.classes.has('lfos-integrated-header'))
      assert.equal(f.bindings.length, 1)
      f.frame.clientWidth = 320; f.resize(); await f.flush()
      assert.equal(f.calls.at(-1), false)
      assert.equal(f.item.height, 28)
      assert.equal(f.classes.size, 0)
      f.frame.clientWidth = 1000; f.resize(); await f.flush()
      assert.equal(f.calls.at(-1), true)
      f.geometry({ canIntegrate: true, mode: 'overlay', headerHeight: 24, leadingInset: 54, trailingInset: 32 })
      await f.flush()
      assert.equal(f.item.height, 24)
      // The outer iframe loading resets shell integration; reactivation is explicit.
      f.geometry({ canIntegrate: true, mode: 'titlebar', headerHeight: 24, leadingInset: 54, trailingInset: 32 })
      await f.flush()
      assert.equal(f.calls.at(-1), true)
      dispose(); await f.flush()
      assert.equal(f.calls.at(-1), false)
      assert.equal(f.item.height, 28)
      assert.equal(f.bindings.length, 0)
      assert.equal(f.properties.size, 0)
      assert.equal(f.classes.size, 0)
    }
  } finally { globalThis.ResizeObserver = originalResize; globalThis.MutationObserver = originalMutation }
})

test('unsupported manifests, missing editor layout, and SDK failure never activate integration', async () => {
  const originalResize = globalThis.ResizeObserver, originalMutation = globalThis.MutationObserver
  const { installOnlyOfficeWindowChrome } = await loadAdapter()
  try {
    for (const failure of ['manifest', 'layout', 'sdk', 'offset', 'hidden']) {
      const f = fixture('DE')
      if (failure === 'manifest') f.geometry({ canIntegrate: false, mode: 'titlebar', headerHeight: 48, leadingInset: 108, trailingInset: 64 })
      if (failure === 'layout') f.frame.contentWindow.DE = null
      if (failure === 'offset') f.frame.getBoundingClientRect = () => ({ top: 50 })
      if (failure === 'hidden') f.frame.contentDocument.querySelector('#app-title').getBoundingClientRect = () => ({ height: 0 })
      if (failure === 'sdk') f.chrome.setIntegrated = async () => { throw new Error('unavailable') }
      const dispose = installOnlyOfficeWindowChrome(f.frame, f.chrome)
      await f.flush()
      assert.equal(f.classes.size, 0)
      assert.equal(f.item.height, 28)
      if (failure !== 'sdk') assert.equal(f.calls.includes(true), false)
      dispose(); await f.flush()
    }
  } finally { globalThis.ResizeObserver = originalResize; globalThis.MutationObserver = originalMutation }
})
