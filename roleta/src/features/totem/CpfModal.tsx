import { useState, type FormEvent } from 'react'
import styles from './TotemScreens.module.css'

type CpfModalProps = {
  prizeName: string
  onSubmit: (cpf: string) => Promise<void>
}

function formatCpf(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function CpfModal({ prizeName, onSubmit }: CpfModalProps) {
  const [cpf, setCpf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) {
      setError('Informe um CPF válido com 11 dígitos.')
      return
    }
    setLoading(true)
    try {
      await onSubmit(digits)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar o CPF.')
      setLoading(false)
    }
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Confirme seu prêmio</h2>
      <p className={styles.panelSubtitle}>
        Você ganhou <strong>{prizeName}</strong>. Informe seu CPF para validar o resgate.
        Cada CPF pode participar apenas uma vez.
      </p>

      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <label className={styles.field}>
          <span>CPF</span>
          <input
            inputMode="numeric"
            autoFocus
            value={formatCpf(cpf)}
            onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="000.000.000-00"
            maxLength={14}
          />
        </label>

        {error ? <p className={styles.error}>{error}</p> : null}

        <button type="submit" className={styles.primaryBtn} disabled={loading}>
          {loading ? 'Confirmando…' : 'Confirmar prêmio'}
        </button>
      </form>
    </div>
  )
}
