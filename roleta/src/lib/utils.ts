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

/** Approx. printable characters that fit in `width` at SVG `fontSize` (viewBox units). */
export function maxCharsForLabelWidth(width: number, fontSize: number): number {
  const charWidth = fontSize * 0.52
  if (charWidth <= 0) return 4
  return Math.max(3, Math.floor(width / charWidth))
}

function truncateLine(text: string, maxChars: number): string {
  const limit = Math.max(3, Math.floor(maxChars))
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}

/**
 * Wrap a prize name into up to `maxLines` lines that fit `maxCharsPerLine`.
 * Breaks on spaces; falls back to hard truncate on the last line.
 */
export function fitPrizeLabelLines(
  name: string,
  maxCharsPerLine: number,
  maxLines = 2,
): string[] {
  const label = name.trim()
  const limit = Math.max(3, Math.floor(maxCharsPerLine))
  const linesCap = Math.max(1, Math.floor(maxLines))

  if (label.length <= limit) return [label]

  const words = label.split(/\s+/).filter(Boolean)
  if (words.length === 0) return [truncateLine(label, limit)]

  const lines: string[] = []
  let current = ''

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]
    const candidate = current ? `${current} ${word}` : word
    const isLastLineSlot = lines.length >= linesCap - 1

    if (candidate.length <= limit) {
      current = candidate
      continue
    }

    if (!current) {
      // Single word longer than a line.
      if (isLastLineSlot) {
        const rest = words.slice(i).join(' ')
        lines.push(truncateLine(rest, limit))
        return lines
      }
      lines.push(truncateLine(word, limit))
      current = ''
      continue
    }

    lines.push(current)
    current = word

    if (lines.length >= linesCap) {
      // Overflow: fold remaining words into the last line.
      const rest = [current, ...words.slice(i + 1)].join(' ')
      lines[lines.length - 1] = truncateLine(
        `${lines[lines.length - 1]} ${rest}`.trim(),
        limit,
      )
      return lines
    }
  }

  if (current) {
    if (lines.length >= linesCap) {
      lines[lines.length - 1] = truncateLine(
        `${lines[lines.length - 1]} ${current}`.trim(),
        limit,
      )
    } else {
      lines.push(truncateLine(current, limit))
    }
  }

  return lines.length > 0 ? lines : [truncateLine(label, limit)]
}
