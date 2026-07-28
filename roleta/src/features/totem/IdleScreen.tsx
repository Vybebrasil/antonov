import styles from './TotemScreens.module.css'

type IdleScreenProps = {
  onStart: () => void
}

export function IdleScreen({ onStart }: IdleScreenProps) {
  return (
    <button type="button" className={styles.idleHit} onClick={onStart} aria-label="Toque para jogar">
      <p className={styles.idleHint}>Toque para jogar</p>
      <span className={styles.idlePulse} aria-hidden />
    </button>
  )
}
