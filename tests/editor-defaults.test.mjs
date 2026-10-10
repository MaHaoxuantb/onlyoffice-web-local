import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('the app and editor default to the system UI font and hidden rulers', async () => {
    const [component, baseStyles] = await Promise.all([
        readFile(new URL('../src/components/DocumentHandler.vue', import.meta.url), 'utf8'),
        readFile(new URL('../src/assets/base.css', import.meta.url), 'utf8'),
    ])

    assert.match(component, /font:\s*{\s*name:\s*'system-ui, sans-serif'/)
    assert.match(component, /hideRulers:\s*true/)
    assert.match(baseStyles, /font-family:\s*system-ui, sans-serif/)
})
