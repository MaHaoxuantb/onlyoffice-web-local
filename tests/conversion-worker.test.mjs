import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

test('save worker preserves editor snapshot strings and transfers only owned byte buffers', async () => {
 const source = await readFile(new URL('../src/utils/x2t.ts', import.meta.url), 'utf8')
 const {outputText} = ts.transpileModule(source.replaceAll('import.meta.url', "'https://office.test/x2t.ts'"), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022},
 })
 const requests = []
 globalThis.Worker = class {
  postMessage(message, transfer) {
   requests.push({message, transfer})
   queueMicrotask(() => this.onmessage({data: {requestId: message.requestId, ok: true, result: {fileName: 'saved.docx', data: new Uint8Array([80, 75])}}}))
  }
  terminate() {}
 }
 try {
  const {convertBinToDocument, releaseConversionWorker} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
  const templates = await readFile(new URL('../src/utils/empty_bin.ts', import.meta.url), 'utf8')
  const templateModule = ts.transpileModule(templates, {compilerOptions: {module: ts.ModuleKind.ES2022}})
  const {g_sEmpty_bin} = await import(`data:text/javascript;base64,${Buffer.from(templateModule.outputText).toString('base64')}`)
  for (const extension of ['docx', 'xlsx', 'pptx']) {
   const snapshot = g_sEmpty_bin[`.${extension}`]
   assert.equal(typeof snapshot, 'string')
   await convertBinToDocument(snapshot, `new.${extension}`, extension.toUpperCase())
   assert.equal(requests.at(-1).message.args[0], snapshot)
   assert.deepEqual(requests.at(-1).transfer, [])
  }
  const bytes = new Uint8Array([1, 2, 3, 4])
  await convertBinToDocument(bytes, 'new.docx')
  assert.equal(requests.at(-1).message.args[0], bytes)
  assert.deepEqual(requests.at(-1).transfer, [bytes.buffer])
  await convertBinToDocument(bytes.subarray(1, 3), 'new.docx')
  assert.deepEqual(requests.at(-1).message.args[0], new Uint8Array([2, 3]))
  assert.notEqual(requests.at(-1).transfer[0], bytes.buffer)
  releaseConversionWorker()
 } finally { delete globalThis.Worker }
})

test('the shipped WASM loader preserves an explicitly configured worker URL', async () => {
 const source = await readFile(new URL('../public/wasm/x2t/x2t.js', import.meta.url), 'utf8')
 const locateFile = path => `https://office.example/wasm/x2t/${path}`
 const context = {Module: {locateFile}}
 vm.runInNewContext(source.slice(0, source.indexOf('// end include: /pre-js.js')), context)
 assert.equal(context.Module.locateFile, locateFile)
 assert.equal(context.Module.locateFile('x2t.wasm', '/assets/'), 'https://office.example/wasm/x2t/x2t.wasm')
});
