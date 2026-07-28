import { useState, type FormEvent } from 'react'
import { formatWhatsappDisplay, isValidWhatsapp } from '@/lib/utils'
import styles from './TotemScreens.module.css'

type LeadFormProps = {
  onSubmit: (name: string, whatsapp: string) => Promise<void>
  onCancel: () => void
}

export function LeadForm({ onSubmit, onCancel }: LeadFormProps) {
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (name.trim().length < 2) {
      setError('Informe seu nome completo.')
      return
    }
    if (!isValidWhatsapp(whatsapp)) {
      setError('Informe um WhatsApp válido com DDD.')
      return
    }

    setLoading(true)
    try {
      await onSubmit(name.trim(), whatsapp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível continuar.')
      setLoading(false)
    }
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Quase lá</h2>
      <p className={styles.panelSubtitle}>Preencha para girar a roleta</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span>Nome</span>
          <input
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            maxLength={80}
          />
        </label>

        <label className={styles.field}>
          <span>WhatsApp</span>
          <input
            inputMode="numeric"
            autoComplete="tel"
            value={formatWhatsappDisplay(whatsapp)}
            onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="(00) 00000-0000"
            maxLength={16}
          />
        </label>

        {error ? <p className={styles.error}>{error}</p> : null}

        <button type="submit" className={styles.primaryBtn} disabled={loading}>
          {loading ? 'Preparando…' : 'Girar a roleta'}
        </button>
        <button type="button" className={styles.ghostBtn} onClick={onCancel} disabled={loading}>
          Voltar
        </button>
      </form>
    </div>
  )
}
