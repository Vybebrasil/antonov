import { useEffect, useMemo, useRef, useState } from 'react'
import type { Prize } from '@/lib/types'
import { shortPrizeLabel } from '@/lib/utils'
import styles from './PrizeWheel.module.css'

type PrizeWheelProps = {
  prizes: Prize[]
  spinning: boolean
  targetPrizeId: string | null
  idle?: boolean
  onSpinEnd?: (prize: Prize) => void
}

const SPIN_DURATION_MS = 5200
const EXTRA_TURNS = 6

function segmentPath(index: number, total: number, radius: number): string {
  const angle = (Math.PI * 2) / total
  const start = index * angle - Math.PI / 2
  const end = start + angle
  const x1 = 50 + radius * Math.cos(start)
  const y1 = 50 + radius * Math.sin(start)
  const x2 = 50 + radius * Math.cos(end)
  const y2 = 50 + radius * Math.sin(end)
  return `M 50 50 L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`
}

function labelPosition(index: number, total: number) {
  const angle = ((index + 0.5) * 360) / total - 90
  const rad = (angle * Math.PI) / 180
  const r = 32
  return {
    x: 50 + r * Math.cos(rad),
    y: 50 + r * Math.sin(rad),
    rotate: angle + 90,
  }
}

export function PrizeWheel({
  prizes,
  spinning,
  targetPrizeId,
  idle = false,
  onSpinEnd,
}: PrizeWheelProps) {
  const [rotation, setRotation] = useState(0)
  const [transition, setTransition] = useState('none')
  const spinningRef = useRef(false)
  const onSpinEndRef = useRef(onSpinEnd)
  onSpinEndRef.current = onSpinEnd

  const total = Math.max(prizes.length, 1)

  const targetIndex = useMemo(() => {
    if (!targetPrizeId) return -1
    return prizes.findIndex((p) => p.id === targetPrizeId)
  }, [prizes, targetPrizeId])

  useEffect(() => {
    if (!spinning || targetIndex < 0 || spinningRef.current) return

    spinningRef.current = true
    const segment = 360 / total
    const targetCenter = targetIndex * segment + segment / 2
    const finalMod = (360 - targetCenter + 360) % 360

    setRotation((current) => {
      const currentMod = ((current % 360) + 360) % 360
      const delta = (finalMod - currentMod + 360) % 360
      return current + EXTRA_TURNS * 360 + delta
    })
    setTransition(`transform ${SPIN_DURATION_MS}ms var(--ease-spin)`)

    const timer = window.setTimeout(() => {
      spinningRef.current = false
      const prize = prizes[targetIndex]
      if (prize) onSpinEndRef.current?.(prize)
    }, SPIN_DURATION_MS + 40)

    return () => window.clearTimeout(timer)
  }, [spinning, targetIndex, total, prizes])

  return (
    <div className={`${styles.wrap} ${idle ? styles.idle : ''}`}>
      <div className={styles.pointer} aria-hidden>
        <span />
      </div>
      <div className={styles.glow} aria-hidden />
      <div
        className={styles.wheel}
        style={{
          transform: `rotate(${rotation}deg)`,
          transition,
        }}
      >
        <svg viewBox="0 0 100 100" className={styles.svg} role="img" aria-label="Roleta de prêmios">
          {prizes.map((prize, index) => {
            const label = labelPosition(index, total)
            return (
              <g key={prize.id}>
                <path
                  d={segmentPath(index, total, 48)}
                  fill={prize.color}
                  stroke="#000"
                  strokeWidth="0.6"
                />
                <text
                  x={label.x}
                  y={label.y}
                  fill="#000"
                  fontSize="3.4"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${label.rotate} ${label.x} ${label.y})`}
                  className={styles.label}
                >
                  {shortPrizeLabel(prize.name)}
                </text>
              </g>
            )
          })}
          <circle cx="50" cy="50" r="10" fill="#000" stroke="#FFC20E" strokeWidth="1.2" />
        </svg>
        <img
          className={styles.hub}
          src="/brand/imagotipo.png"
          alt=""
          draggable={false}
        />
      </div>
      <div className={styles.ring} aria-hidden />
    </div>
  )
}
