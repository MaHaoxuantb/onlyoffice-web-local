import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('the editor uses an open document font, a system UI fallback, and hidden rulers', async () => {
    const [component, baseStyles] = await Promise.all([
        readFile(new URL('../src/components/DocumentHandler.vue', import.meta.url), 'utf8'),
        readFile(new URL('../src/assets/base.css', import.meta.url), 'utf8'),
    ])

    assert.match(component, /DEFAULT_DOCUMENT_FONT\s*=\s*'Ubuntu'/)
    assert.match(component, /font:\s*{\s*name:\s*'Ubuntu, system-ui, sans-serif'/)
    assert.match(component, /if \(isNew\) applyNewDocumentDefaultFont\(\)/)
    assert.match(component, /put_TextPrFontName\?\.\(DEFAULT_DOCUMENT_FONT\)/)
    assert.match(component, /asc_setCellFontName\?\.\(DEFAULT_DOCUMENT_FONT\)/)
    assert.match(component, /hideRulers:\s*true/)
    assert.match(baseStyles, /font-family:\s*system-ui,\s*sans-serif/)
})

test('the editor removes download controls', async () => {
    const component = await readFile(
        new URL('../src/components/DocumentHandler.vue', import.meta.url),
        'utf8',
    )

    assert.match(component, /permissions:\s*{[\s\S]*?download:\s*false/)
    assert.match(component, /#fm-btn-download,/)
    assert.match(component, /#slot-btn-dt-download,/)
    assert.match(component, /#slot-hbtn-download/)
})
