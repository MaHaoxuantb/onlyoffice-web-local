import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { build } from 'vite'

await build()

// sdk-all-min.js loads sdk-all.js dynamically after the editor shell starts.
// Validate both files in the production artifact so a missing runtime script
// fails the build instead of leaving documents on the loading placeholder.
await Promise.all(
  ['word', 'cell', 'slide'].map(async (editor) => {
    const minPath = resolve('html', 'sdkjs', editor, 'sdk-all-min.js')
    const fullPath = resolve('html', 'sdkjs', editor, 'sdk-all.js')
    const minSource = await readFile(minPath, 'utf8')
    if (!minSource.includes('"/sdk-all.js"')) {
      throw new Error(`${editor} runtime loader contract changed; inspect its dependencies`)
    }
    await access(fullPath)
  }),
)
await import('./generate-lfos-manifest.mjs')
