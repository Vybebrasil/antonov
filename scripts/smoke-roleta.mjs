import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const key = t.slice(0, i).trim()
    const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

const { listActivePrizesPublic, getSettings, createLead, spinPrize } = await import(
  '../api/_lib/roleta.js'
)

const p = await listActivePrizesPublic()
const s = await getSettings()
console.log('premios', p.length, p.map((x) => x.slug).join(','))
console.log('settings', JSON.stringify(s))

const phone = `7499${String(Date.now()).slice(-7)}`
const lead = await createLead('Teste Roleta', phone)
if (lead.error) {
  console.log('lead err', lead.error)
  process.exit(1)
}
console.log('lead', lead.lead.id)
const spin = await spinPrize(lead.lead.id, 'smoke-test')
console.log(spin.error ? `spin err ${spin.error}` : `spin ok ${spin.prize.name}`)
