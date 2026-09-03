import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { build } from 'vite'

await build()

// The editor entry points explicitly load sdk-all-min.js. Keep the readable
// vendor copies in source control, but do not ship their large duplicates.
await Promise.all(
  ['word', 'cell', 'slide'].flatMap((editor) =>
    ['', '.gz'].map((suffix) =>
      rm(resolve('html', 'sdkjs', editor, `sdk-all.js${suffix}`), { force: true }),
    ),
  ),
)
await import('./generate-lfos-manifest.mjs')
