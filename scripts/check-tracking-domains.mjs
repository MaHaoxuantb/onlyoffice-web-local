import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const forbidden = [
  /(?:^|\.)360\.cn\b/i,
  /google-analytics\.com\b/i,
  /googletagmanager\.com\b/i,
]

const files = execFileSync('rg', [
  '--files',
  '--hidden',
  '-g',
  '!.git/**',
  '-g',
  '!node_modules/**',
  '-g',
  '!html/**',
  '-g',
  '!scripts/check-tracking-domains.mjs',
], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)

const violations = []
for (const file of files) {
  const source = await readFile(file, 'utf8').catch(() => null)
  if (source === null) continue
  for (const pattern of forbidden) {
    if (pattern.test(source)) violations.push(`${file}: ${pattern}`)
  }
}

if (violations.length) {
  console.error(`Forbidden tracking domains found:\n${violations.join('\n')}`)
  process.exit(1)
}

console.log('No forbidden tracking domains found.')
