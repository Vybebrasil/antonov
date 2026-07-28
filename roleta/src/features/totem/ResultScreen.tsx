import type { Prize } from '@/lib/types'
import styles from './TotemScreens.module.css'

type ResultScreenProps = {
  prize: Prize
  onDone: () => void
}

export function ResultScreen({ prize, onDone }: ResultScreenProps) {
  return (
    <div className={styles.result}>
      <p className={styles.resultEyebrow}>Prêmio confirmado</p>
      <h2 className={styles.resultTitle}>{prize.name}</h2>
      <p className={styles.resultInstruction}>{prize.instruction}</p>
      <button type="button" className={styles.primaryBtn} onClick={onDone}>
        Concluir
      </button>
    </div>
  )
}
