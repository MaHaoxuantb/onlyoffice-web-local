import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function loadService() {
  let source = await readFile(new URL('../src/services/lfos.ts', import.meta.url), 'utf8')
  source = source.replace(/const LFOS_SDK_URL =[\s\S]*?export interface/, "const LFOS_SDK_URL = '';\nexport interface")
  source = source.replace('await import(/* @vite-ignore */ LFOS_SDK_URL)', 'globalThis.testSDK')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#${Math.random()}`)
}

test('new documents retain their destination; cancellation, exports, and failed writes release correctly', async () => {
  globalThis.window = { self: {}, top: {} }
  const writes = [], releases = [], pickers = []
  let failWrite = false, cancel = false
  globalThis.testSDK = { lfos: {
    isAvailable: () => true,
    ready: async () => ({ name: 'LFOS' }),
    capabilities: { has: () => true },
    files: {
      save: async options => {
        pickers.push(options)
        return cancel ? null : { id: `handle-${pickers.length}`, name: options.suggestedName }
      },
      write: async (handle, data) => {
        writes.push({ handle, data })
        if (failWrite) throw new Error('write conflict')
        return { ...handle, size: data.length }
      },
      release: async handle => { releases.push(handle.id) },
    },
  } }
  try {
    const { saveFileToLFOS: save, releaseLFOSFile: release } = await loadService()
    const owner = {}, bytes = new Uint8Array([80, 75, 3, 4])
    assert.equal(await save(bytes, 'new.docx', 'docx', owner), 'saved')
    assert.equal(await save(bytes, 'new.docx', 'docx', owner), 'saved')
    assert.equal(pickers.length, 1)
    assert.equal(writes[0].handle.id, writes[1].handle.id)
    assert.equal(releases.length, 0)
    await save(bytes, 'copy.docx', 'docx', null)
    assert.deepEqual(releases, ['handle-2'])
    // A format change saves to a new destination instead of corrupting the source.
    await save(bytes, 'new.pdf', 'pdf', owner)
    assert.equal(pickers.length, 3)
    assert.deepEqual(releases, ['handle-2', 'handle-1'])
    failWrite = true
    await assert.rejects(save(bytes, 'failed.docx', 'docx', {}), /write conflict/)
    assert.equal(releases.at(-1), 'handle-4')
    cancel = true
    assert.equal(await save(bytes, 'cancelled.docx', 'docx', {}), 'cancelled')
    await release(owner)
    assert.equal(releases.at(-1), 'handle-3')
  } finally {
    delete globalThis.window
    delete globalThis.testSDK
  }
})

test('first-save conversion initializes when Emscripten completed before script.onload', async () => {
  globalThis.window = { Module: { calledRun: true, FS: { mkdir() {} } } }
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild(script) { queueMicrotask(() => script.onload()) } },
  }
  try {
    const source = await readFile(new URL('../src/utils/x2t.ts', import.meta.url), 'utf8')
    const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
    const { initX2T } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#${Math.random()}`)
    const module = await initX2T()
    assert.equal(module, window.Module)
    assert.equal(await initX2T(), module)
  } finally {
    delete globalThis.window
    delete globalThis.document
  }
})

test('save callbacks preserve dirty work on cancellation, errors, edits during save, and exported copies', async () => {
  const component = await readFile(new URL('../src/components/DocumentHandler.vue', import.meta.url), 'utf8')
  const handler = component.slice(component.indexOf('async function handleSaveDocument('), component.indexOf('interface ExportEvent'))
  const source = `
    let saveInProgress = false, documentDirty = true, dirtiedDuringSave = false;
    const props = { file: { fileName: 'new.docx', file: null } };
    const callbacks = [];
    const editor = { value: { sendCommand: value => callbacks.push(value) } };
    const c_oAscFileType2 = { 1: 'DOCX' };
    const reportUnsavedChanges = () => {};
    const showAppMessage = async () => {};
    const getDocumentMimeType = () => 'docx';
    ${handler}
    return { handleSaveDocument, callbacks, props,
      dirty: () => documentDirty,
      edit: () => { documentDirty = true; dirtiedDuringSave = true; }
    };
  `
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  const instantiate = new Function('saveFileToLFOS', 'convertBinToDocument', outputText)
  const event = actionType => ({ data: { data: { data: new Uint8Array([1]) }, option: { outputformat: 1, actionType } } })
  const convert = async () => ({ data: new Uint8Array([80, 75]), fileName: 'new.docx' })
  for (const status of ['saved', 'cancelled', 'unavailable']) {
    const app = instantiate(async () => status, convert)
    await app.handleSaveDocument(event(0))
    assert.equal(app.dirty(), status !== 'saved')
    assert.equal(app.callbacks.at(-1).data.err_code, status === 'saved' ? 0 : 1)
  }
  const copy = instantiate(async (_bytes, _name, _mime, owner) => {
    assert.equal(owner, null)
    return 'saved'
  }, convert)
  await copy.handleSaveDocument(event(6))
  assert.equal(copy.dirty(), true)
  const edited = instantiate(async () => { edited.edit(); return 'saved' }, convert)
  await edited.handleSaveDocument(event(0))
  assert.equal(edited.dirty(), true)
  const error = instantiate(async () => { throw new Error('conflict') }, convert)
  await error.handleSaveDocument(event(0))
  assert.equal(error.dirty(), true)
  assert.equal(error.callbacks.at(-1).data.err_code, 1)
})
