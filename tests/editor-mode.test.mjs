import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

// Exercise the real bundled SDK methods, including their editing lock. A mock
// asc_setViewMode that only records booleans cannot catch this regression.
for (const editor of ['word', 'slide']) {
  test(`${editor}: returning to edit mode releases only the view-mode lock`, async () => {
    const source = await readFile(new URL(`../public/sdkjs/${editor}/sdk-all-min.js`, import.meta.url), 'utf8')
    const signature = editor === 'word' ? '.y3a = function (t)' : '.plb=function(t)'
    const start = source.indexOf(signature)
    assert.ok(start >= 0)
    const bodyStart = source.indexOf('{', start)
    let end = bodyStart + 1, depth = 1
    while (depth) {
      if (source[end] === '{') depth++
      if (source[end] === '}') depth--
      end++
    }
    let locks = 0
    const lock = value => { locks = value ? locks + 1 : Math.max(0, locks - 1) }
    const AscCommon = editor === 'word' ? { od: { rpa: lock } } : { Tc: { fra: lock } }
    const setViewMode = new Function('AscCommon', `return (${source.slice(start + 1 + (editor === 'word' ? 'y3a = '.length : 'plb='.length), end)})`)(AscCommon)
    const noop = () => {}
    const api = editor === 'word'
      ? { Mo: false, $ha: true, dme: noop, sMc: noop,
          ma: { Nb: { nj: null, oz: noop }, Xfc: noop, fG: noop, FAb: noop, Xta: noop } }
      : { lp: false, H8: true, uUc: noop,
          qa: { hdh: noop, Pc: { KG: noop }, HAf: noop, oGb: noop, UV: noop, Ba: {} } }
    let text = ''
    const insertText = value => {
      if (!locks && !(editor === 'word' ? api.Mo : api.lp)) text += value
    }
    for (let cycle = 0; cycle < 3; cycle++) {
      setViewMode.call(api, true)
      setViewMode.call(api, true)
      insertText('blocked')
      assert.equal(locks, 1, 'repeated view requests must not accumulate locks')
      assert.equal(text, 'edited'.repeat(cycle))
      setViewMode.call(api, false)
      insertText('edited')
      assert.equal(locks, 0, 'editing must resume after returning from view mode')
      assert.equal(text, 'edited'.repeat(cycle + 1))
    }
    lock(true) // An unrelated operation owns this lock.
    setViewMode.call(api, false)
    assert.equal(locks, 1, 'an edit request must not clear another operation’s lock')
    setViewMode.call(api, true)
    assert.equal(locks, 2)
    setViewMode.call(api, false)
    assert.equal(locks, 1, 'release only the lock acquired by view mode')
  })
}
