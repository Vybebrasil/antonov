import type { AdminSettings, Lead, Prize } from './types'
import { DEFAULT_SETTINGS } from './types'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const DEVICE_KEY = 'antonov_device_id'

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Erro na requisição')
  }
  return data as T
}

function mapPrize(raw: Record<string, unknown>): Prize {
  return {
    id: String(raw.id),
    name: String(raw.name),
    slug: String(raw.slug || ''),
    weight: Number(raw.weight) || 0,
    stock: raw.stock == null ? null : Number(raw.stock),
    active: Boolean(raw.active ?? true),
    sort_order: Number(raw.sort_order) || 0,
    color: String(raw.color || '#FFC20E'),
    instruction: String(raw.instruction || ''),
    pity_every: raw.pity_every == null ? null : Number(raw.pity_every),
    pity_counter: Number(raw.pity_counter) || 0,
  }
}

export async function fetchActivePrizes(): Promise<Prize[]> {
  const data = await request<{ premios: Record<string, unknown>[] }>('/api/roleta/premios')
  return (data.premios || []).map(mapPrize)
}

export async function fetchSettings(): Promise<AdminSettings> {
  try {
    const data = await request<{ settings?: { result_timeout_seconds?: number } }>(
      '/api/roleta/premios',
    )
    return {
      ...DEFAULT_SETTINGS,
      result_timeout_seconds: data.settings?.result_timeout_seconds ?? DEFAULT_SETTINGS.result_timeout_seconds,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function createLead(name: string, whatsapp: string): Promise<Lead> {
  const data = await request<{ lead: Lead }>('/api/roleta/lead', {
    method: 'POST',
    body: JSON.stringify({ name, whatsapp }),
  })
  return data.lead
}

export async function spinPrize(leadId: string): Promise<Prize> {
  const data = await request<{ prize: Record<string, unknown> }>('/api/roleta/spin', {
    method: 'POST',
    body: JSON.stringify({ lead_id: leadId, device_id: getDeviceId() }),
  })
  return mapPrize(data.prize)
}
