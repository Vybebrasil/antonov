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

export type TotemConfig = {
  prizes: Prize[]
  settings: AdminSettings
  /** Changes whenever the admin uploads different totem art. */
  layoutSignature: string | null
}

export async function fetchTotemConfig(): Promise<TotemConfig> {
  const data = await request<{
    premios?: Record<string, unknown>[]
    settings?: { result_timeout_seconds?: number; layout_signature?: string }
  }>('/api/roleta/premios')
  return {
    prizes: (data.premios || []).map(mapPrize),
    settings: {
      ...DEFAULT_SETTINGS,
      result_timeout_seconds:
        data.settings?.result_timeout_seconds ?? DEFAULT_SETTINGS.result_timeout_seconds,
    },
    layoutSignature:
      typeof data.settings?.layout_signature === 'string'
        ? data.settings.layout_signature
        : null,
  }
}

export async function fetchLayout(): Promise<string | null> {
  try {
    const data = await request<{ layout_url?: string | null }>('/api/roleta/layout')
    return data.layout_url || null
  } catch {
    return null
  }
}

export async function createLead(name: string, whatsapp: string): Promise<Lead> {
  const data = await request<{ lead: Lead }>('/api/roleta/lead', {
    method: 'POST',
    body: JSON.stringify({ name, whatsapp }),
  })
  return data.lead
}

export async function spinPrize(leadId: string): Promise<{ prize: Prize; spin_id: string }> {
  const data = await request<{
    prize: Record<string, unknown>
    spin_id: string
  }>('/api/roleta/spin', {
    method: 'POST',
    body: JSON.stringify({ lead_id: leadId, device_id: getDeviceId() }),
  })
  return {
    prize: mapPrize(data.prize),
    spin_id: String(data.spin_id),
  }
}

export async function confirmSpinCpf(
  spinId: string,
  cpf: string,
): Promise<{ prize?: Prize; cancelled?: boolean }> {
  const data = await request<{
    prize?: Record<string, unknown>
    cancelled?: boolean
    error?: string
  }>('/api/roleta/confirm-cpf', {
    method: 'POST',
    body: JSON.stringify({ spin_id: spinId, cpf }),
  })
  return {
    prize: data.prize ? mapPrize(data.prize) : undefined,
    cancelled: data.cancelled,
  }
}
