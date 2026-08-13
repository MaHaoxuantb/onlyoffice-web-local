import { build } from 'vite'

await build()
await import('./generate-lfos-manifest.mjs')
