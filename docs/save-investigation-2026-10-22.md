# Save failure investigation — October 22, 2026

## Confirmed production-build failure

Saving a new Word document in the unmodified local production build failed with:

```text
Bin to document conversion failed: Conversion failed with code: 88
```

The failure occurs before `files.save` or `files.write` reaches LFOS storage.
The embedded editor sets `nobase64=false` and supplies its serialized snapshot
as a string. The conversion worker adapter assumed a `Uint8Array`. Its fallback
`new Uint8Array(bin)` converts a snapshot string to an empty array, discarding
the document before X2T sees it. The old direct converter passed this string
unchanged to Emscripten's `FS.writeFile`, which accepts strings.

The adapter now sends snapshot strings unchanged through structured cloning.
Byte snapshots retain their existing transferable-buffer path. The editor event
and conversion engine types now describe both supported representations.

## Verification

- All 13 unit tests pass. The new regression test covers real Word, spreadsheet,
  and presentation template strings, complete byte buffers, and byte subarrays.
- TypeScript checking and the production build pass.
- In the Codex in-app browser, the rebuilt production app saved a new Word
  document through a local host fixture using the canonical `lfos:request` and
  `lfos:response` protocol with version 1 and origin/source checks.
- The fixture received a 21,509-byte ZIP document. After editing, it received
  another 21,543-byte ZIP document, with two writes and only one save picker.
  The app reported `Document saved.` and cleared its dirty title marker.
- The fixture uses in-memory storage; this does not verify live LFOS VFS
  persistence, reloading the saved document, or an installed production deployment.
- Actual Safari was not exercised. The source fix has not been deployed.

## Separate development-server issue

The Vite development server serves the TypeScript worker entry with an ES module
import, while the application constructs a classic worker (needed by the
Emscripten `importScripts` loader). Saving there fails with `Document conversion
stopped` before conversion starts. The production build bundles the imports into
a classic worker and reaches conversion. This separate development-loading issue
is unchanged by the snapshot fix; verification above used the production preview.
