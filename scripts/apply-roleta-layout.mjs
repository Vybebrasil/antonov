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

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL)
await sql`ALTER TABLE roleta_settings ADD COLUMN IF NOT EXISTS layout_name TEXT`
await sql`ALTER TABLE roleta_settings ADD COLUMN IF NOT EXISTS layout_type TEXT`
await sql`ALTER TABLE roleta_settings ADD COLUMN IF NOT EXISTS layout_data TEXT`
console.log('layout columns ok')
