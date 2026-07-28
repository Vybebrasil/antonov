import { useEffect } from 'react'
import type { Prize } from '@/lib/types'
import styles from './TotemScreens.module.css'

type ResultScreenProps = {
  prize: Prize
  timeoutSeconds: number
  onDone: () => void
}

export function ResultScreen({ prize, timeoutSeconds, onDone }: ResultScreenProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, timeoutSeconds * 1000)
    return () => window.clearTimeout(timer)
  }, [onDone, timeoutSeconds])

  return (
    <div className={styles.result}>
      <p className={styles.resultEyebrow}>Você ganhou</p>
      <h2 className={styles.resultTitle}>{prize.name}</h2>
      <p className={styles.resultInstruction}>{prize.instruction}</p>
      <button type="button" className={styles.primaryBtn} onClick={onDone}>
        Novo giro
      </button>
    </div>
  )
}
