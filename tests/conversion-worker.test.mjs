import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'

test('the shipped WASM loader preserves an explicitly configured worker URL', async () => {
 const source = await readFile(new URL('../public/wasm/x2t/x2t.js', import.meta.url), 'utf8')
 const locateFile = path => `https://office.example/wasm/x2t/${path}`
 const context = {Module: {locateFile}}
 vm.runInNewContext(source.slice(0, source.indexOf('// end include: /pre-js.js')), context)
 assert.equal(context.Module.locateFile, locateFile)
 assert.equal(context.Module.locateFile('x2t.wasm', '/assets/'), 'https://office.example/wasm/x2t/x2t.wasm')
});
