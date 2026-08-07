import styles from './TotemScreens.module.css'

type IdleScreenProps = {
  onStart: () => void
}

/** Full-stage tap target. The visible copy is rendered by IdleHint in the CTA row. */
export function IdleScreen({ onStart }: IdleScreenProps) {
  return (
    <button
      type="button"
      className={styles.idleHit}
      onClick={onStart}
      aria-label="Toque para jogar"
    />
  )
}

export function IdleHint() {
  return (
    <div className={styles.idleHint} aria-hidden>
      <p className={styles.idleHintText}>Toque para jogar</p>
      <span className={styles.idlePulse} />
    </div>
  )
}
