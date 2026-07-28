import { useCallback, useEffect, useState } from 'react'
import {
  confirmSpinCpf,
  createLead,
  fetchActivePrizes,
  fetchLayout,
  fetchSettings,
  spinPrize,
} from '@/lib/api'
import type { AdminSettings, Lead, Prize } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/types'
import { CpfModal } from './CpfModal'
import { IdleScreen } from './IdleScreen'
import { LeadForm } from './LeadForm'
import { PrizeWheel } from './PrizeWheel'
import { ResultScreen } from './ResultScreen'
import styles from './TotemPage.module.css'

type Step = 'idle' | 'lead' | 'ready' | 'spinning' | 'cpf' | 'result'

export function TotemPage() {
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS)
  const [layoutUrl, setLayoutUrl] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [lead, setLead] = useState<Lead | null>(null)
  const [targetPrizeId, setTargetPrizeId] = useState<string | null>(null)
  const [wonPrize, setWonPrize] = useState<Prize | null>(null)
  const [spinId, setSpinId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingPrizes, setLoadingPrizes] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [prizeList, adminSettings, layout] = await Promise.all([
          fetchActivePrizes(),
          fetchSettings(),
          fetchLayout(),
        ])
        if (cancelled) return
        setPrizes(prizeList)
        setSettings(adminSettings)
        setLayoutUrl(layout)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar prêmios.')
        }
      } finally {
        if (!cancelled) setLoadingPrizes(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const reset = useCallback(() => {
    setStep('idle')
    setLead(null)
    setTargetPrizeId(null)
    setWonPrize(null)
    setSpinId(null)
    setError(null)
    void fetchActivePrizes().then(setPrizes).catch(() => undefined)
  }, [])

  async function handleLeadSubmit(name: string, whatsapp: string) {
    const created = await createLead(name, whatsapp)
    setLead(created)
    setStep('ready')
  }

  async function handleSpin() {
    if (!lead || step === 'spinning') return
    setError(null)
    try {
      const { prize, spin_id } = await spinPrize(lead.id)
      setTargetPrizeId(prize.id)
      setWonPrize(prize)
      setSpinId(spin_id)
      setStep('spinning')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no sorteio.')
    }
  }

  function handleSpinEnd(prize: Prize) {
    setWonPrize(prize)
    setStep('cpf')
  }

  async function handleCpfSubmit(cpf: string) {
    if (!spinId) throw new Error('Giro inválido.')
    const result = await confirmSpinCpf(spinId, cpf)
    if (result.prize) setWonPrize(result.prize)
    setStep('result')
    window.setTimeout(() => {
      reset()
    }, (settings.result_timeout_seconds || 15) * 1000)
  }

  return (
    <div className={styles.page}>
      <div className={styles.stage}>
        {layoutUrl ? (
          <div
            className={styles.layoutBg}
            style={{ backgroundImage: `url(${layoutUrl})` }}
            aria-hidden
          />
        ) : (
          <div className={styles.atmosphere} aria-hidden />
        )}

        {!layoutUrl ? (
          <header className={styles.header}>
            <img
              src={`${import.meta.env.BASE_URL}brand/logo-horizontal.png`}
              alt="Antonov"
              className={styles.logo}
            />
          </header>
        ) : null}

        <main className={styles.main}>
          {loadingPrizes ? (
            <p className={styles.status}>Carregando roleta…</p>
          ) : (
            <>
              {(step === 'idle' || step === 'ready' || step === 'spinning') && prizes.length > 0 && (
                <div className={styles.wheelStage}>
                  <PrizeWheel
                    prizes={prizes}
                    idle={step === 'idle'}
                    spinning={step === 'spinning'}
                    targetPrizeId={targetPrizeId}
                    onSpinEnd={handleSpinEnd}
                  />
                </div>
              )}

              {!loadingPrizes && prizes.length === 0 && (
                <p className={styles.status}>Nenhum prêmio cadastrado no momento.</p>
              )}

              {step === 'idle' && prizes.length > 0 && <IdleScreen onStart={() => setStep('lead')} />}

              {step === 'lead' && (
                <div className={styles.overlay}>
                  <LeadForm onSubmit={handleLeadSubmit} onCancel={() => setStep('idle')} />
                </div>
              )}

              {step === 'ready' && (
                <div className={styles.ctaBar}>
                  <p className={styles.ctaName}>Boa sorte, {lead?.name.split(' ')[0]}!</p>
                  <button type="button" className={styles.spinBtn} onClick={() => void handleSpin()}>
                    Girar
                  </button>
                </div>
              )}

              {step === 'spinning' && <p className={styles.statusSpin}>Girando…</p>}

              {step === 'cpf' && wonPrize && (
                <div className={styles.overlay}>
                  <CpfModal prizeName={wonPrize.name} onSubmit={handleCpfSubmit} />
                </div>
              )}

              {step === 'result' && wonPrize && (
                <div className={styles.overlay}>
                  <ResultScreen prize={wonPrize} onDone={reset} />
                </div>
              )}

              {error ? <p className={styles.error}>{error}</p> : null}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
