/** Normalize BR WhatsApp to digits only (with country code 55 when possible). */
export function normalizeWhatsapp(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }
  return digits
}

export function formatWhatsappDisplay(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function isValidWhatsapp(input: string): boolean {
  const digits = input.replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11 || digits.length === 12 || digits.length === 13
}

export function pickWeightedIndex<T extends { weight: number }>(items: T[]): number {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0)
  if (total <= 0) return 0
  let roll = Math.random() * total
  for (let i = 0; i < items.length; i += 1) {
    roll -= Math.max(0, items[i].weight)
    if (roll <= 0) return i
  }
  return items.length - 1
}

/** Chance real entre prêmios elegíveis (ativos e com estoque). */
export function isPrizeEligible(prize: {
  active: boolean
  weight: number
  stock: number | null
  pity_every?: number | null
}): boolean {
  const hasDrop =
    prize.weight > 0 || (prize.pity_every != null && prize.pity_every > 0)
  return prize.active && hasDrop && (prize.stock === null || prize.stock > 0)
}

export function dropRatePercent(
  prize: { id: string; weight: number },
  pool: Array<{ id: string; weight: number; active: boolean; stock: number | null }>,
): number {
  const eligible = pool.filter(isPrizeEligible)
  const total = eligible.reduce((sum, item) => sum + Math.max(0, item.weight), 0)
  if (total <= 0) return 0
  const inPool = eligible.some((item) => item.id === prize.id)
  if (!inPool) return 0
  return (Math.max(0, prize.weight) / total) * 100
}

export function formatDropRate(percent: number): string {
  if (percent <= 0) return '0%'
  if (percent >= 100) return '100%'
  if (percent < 0.1) return '<0.1%'
  return `${percent < 10 ? percent.toFixed(1) : percent.toFixed(percent % 1 === 0 ? 0 : 1)}%`
}

export function shortPrizeLabel(name: string): string {
  if (name.length <= 22) return name
  if (name.toLowerCase().includes('holística') || name.toLowerCase().includes('holistica')) {
    return '20% Holística'
  }
  if (name.toLowerCase().includes('internet')) return 'Internet grátis'
  if (name.toLowerCase().includes('academia')) return 'Academia grátis'
  return `${name.slice(0, 20)}…`
}
