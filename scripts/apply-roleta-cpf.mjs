import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { neon } from '@neondatabase/serverless'

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

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error('DATABASE_URL ausente')
  process.exit(1)
}

const sql = neon(url)

await sql`ALTER TABLE roleta_leads ADD COLUMN IF NOT EXISTS cpf TEXT`
console.log('cpf column ok')

await sql`CREATE UNIQUE INDEX IF NOT EXISTS roleta_leads_whatsapp_unique_idx ON roleta_leads (whatsapp)`
console.log('whatsapp unique ok')

await sql`CREATE UNIQUE INDEX IF NOT EXISTS roleta_leads_cpf_unique_idx ON roleta_leads (cpf) WHERE cpf IS NOT NULL`
console.log('cpf unique ok')

await sql`
  ALTER TABLE roleta_spins
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
`
console.log('status column ok')

await sql`
  ALTER TABLE roleta_spins
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ
`
console.log('confirmed_at ok')

await sql`
  UPDATE roleta_spins
  SET confirmed_at = COALESCE(confirmed_at, created_at)
  WHERE status = 'confirmed' AND confirmed_at IS NULL
`

console.log('Migration roleta-cpf aplicada.')
