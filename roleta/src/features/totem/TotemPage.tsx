import { useCallback, useEffect, useRef, useState } from 'react'
import {
  confirmSpinCpf,
  createLead,
  fetchLayout,
  fetchTotemConfig,
  spinPrize,
} from '@/lib/api'
import type { AdminSettings, Lead, Prize } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/types'
import { CpfModal } from './CpfModal'
import { IdleHint, IdleScreen } from './IdleScreen'
import { LeadForm } from './LeadForm'
import { PrizeWheel } from './PrizeWheel'
import { ResultScreen } from './ResultScreen'
import styles from './TotemPage.module.css'

type Step = 'idle' | 'lead' | 'ready' | 'spinning' | 'cpf' | 'result'

/** The totem runs for days, so admin edits have to land without a reload. */
const CONFIG_REFRESH_MS = 30_000

/** Avoids re-rendering the wheel when the poll brings back identical data. */
function keepIfEqual<T>(prev: T, next: T): T {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
}

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

  const layoutSignature = useRef<string | null>(null)

  const loadConfig = useCallback(async ({ withLayout = false } = {}) => {
    const config = await fetchTotemConfig()
    setPrizes((prev) => keepIfEqual(prev, config.prizes))
    setSettings((prev) => keepIfEqual(prev, config.settings))

    /* A null signature means the API cannot tell, so leave the art alone. */
    const changed =
      config.layoutSignature !== null && config.layoutSignature !== layoutSignature.current
    if (withLayout || changed) {
      layoutSignature.current = config.layoutSignature
      setLayoutUrl(await fetchLayout())
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await loadConfig({ withLayout: true })
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
  }, [loadConfig])

  /* Only while idle: a running session must never see the wheel change. */
  useEffect(() => {
    if (step !== 'idle') return
    const refresh = () => void loadConfig().catch(() => undefined)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(refresh, CONFIG_REFRESH_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [step, loadConfig])

  const reset = useCallback(() => {
    setStep('idle')
    setLead(null)
    setTargetPrizeId(null)
    setWonPrize(null)
    setSpinId(null)
    setError(null)
    void loadConfig().catch(() => undefined)
  }, [loadConfig])

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

  const hasPrizes = !loadingPrizes && prizes.length > 0
  const showsWheel = step === 'idle' || step === 'ready' || step === 'spinning'

  return (
    <div className={styles.page}>
      <div className={`${styles.stage} ${layoutUrl ? styles.stageArt : ''}`}>
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
          ) : prizes.length === 0 ? (
            <p className={styles.status}>Nenhum prêmio cadastrado no momento.</p>
          ) : (
            showsWheel && (
              <div className={styles.wheelStage}>
                <PrizeWheel
                  prizes={prizes}
                  idle={step === 'idle'}
                  spinning={step === 'spinning'}
                  targetPrizeId={targetPrizeId}
                  onSpinEnd={handleSpinEnd}
                />
              </div>
            )
          )}
        </main>

        <div className={styles.ctaArea}>
          {hasPrizes && step === 'idle' && <IdleHint />}

          {step === 'ready' && (
            <>
              <p className={styles.ctaName}>Boa sorte, {lead?.name.split(' ')[0]}!</p>
              <button type="button" className={styles.spinBtn} onClick={() => void handleSpin()}>
                Girar
              </button>
            </>
          )}

          {step === 'spinning' && <p className={styles.statusSpin}>Girando…</p>}
        </div>

        {hasPrizes && step === 'idle' && <IdleScreen onStart={() => setStep('lead')} />}

        {step === 'lead' && (
          <div className={styles.overlay}>
            <LeadForm onSubmit={handleLeadSubmit} onCancel={() => setStep('idle')} />
          </div>
        )}

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
      </div>
    </div>
  )
}
