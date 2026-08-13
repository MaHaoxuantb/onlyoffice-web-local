import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = resolve(projectRoot, 'lfos/ONLYOFFICE.app')
const outputPath = resolve(projectRoot, 'html/ONLYOFFICE.app')

function deploymentUrl() {
  const configuredUrl = process.env.LFOS_APP_URL
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  const value = configuredUrl || (vercelUrl ? `https://${vercelUrl}` : null)
  return value?.replace(/\/$/, '') || 'https://YOUR-PROJECT.vercel.app'
}

const appUrl = deploymentUrl()
const manifest = JSON.parse(await readFile(templatePath, 'utf8'))
manifest.url = appUrl
manifest.icon = `${appUrl}/icon.svg`

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Generated LFOS configuration for ${appUrl}`)
