import { DEMO_TOTAL, EVENT_ID, EVENT_TITLE } from '../data/demoData'
import { ThemeToggle } from './ThemeToggle'
import type { ValidationRecord, ValidationSummary } from '../types'
import { brandColor, UNKNOWN_BRAND_LABEL } from '../utils/catalog'
import { isPanelPending } from '../utils/record'

interface PanelViewProps {
  summary: ValidationSummary
  records: ValidationRecord[]
  displayCatalog: Record<string, string[]>
  darkMode: boolean
  onDarkModeChange: (value: boolean) => void
  onStartValidation: () => void
  onResetSession: () => void
}

export function PanelView({ summary, records, displayCatalog, darkMode, onDarkModeChange, onStartValidation, onResetSession }: PanelViewProps) {
  const resolved = summary.total - summary.pending
  const pct = summary.total ? Math.round((resolved / summary.total) * 100) : 0

  const brandProgress = (() => {
    const progress: Record<string, { total: number; resolved: number }> = {}
    for (const brand of Object.keys(displayCatalog)) {
      progress[brand] = { total: 0, resolved: 0 }
    }
    for (const record of records) {
      const key = record.detected.brand
      progress[key] = progress[key] ?? { total: 0, resolved: 0 }
      progress[key].total += 1
      if (!isPanelPending(record, displayCatalog)) progress[key].resolved += 1
    }
    return progress
  })()

  const kpis = [
    {
      label: 'Aprobado',
      value: summary.approved,
      tone: 'up',
      hint: 'Fue aprobado antes o después de ser corregido.',
    },
    {
      label: 'Pendiente',
      value: summary.pending,
      tone: '',
      hint: 'Pendiente o pendiente de elegir un modelo válido.',
    },
    {
      label: 'Descartado',
      value: summary.discarded,
      tone: '',
      hint: 'Falso positivo o recorte inválido.',
    },
    {
      label: 'Corregido',
      value: summary.corrected,
      tone: '',
      hint: 'Se corrigió la marca o el modelo.',
    },
  ] as const

  return (
    <section className="view active">
      <div className="topbar">
        <h2>Panel de corrida <span className="admin-tag">ADMIN</span></h2>
        <div className="top-actions">
          <ThemeToggle darkMode={darkMode} onChange={onDarkModeChange} />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (window.confirm('¿Reiniciar toda la validación? Se perderán aprobaciones, correcciones y descartes guardados en este navegador.')) {
                onResetSession()
              }
            }}
          >
            Reiniciar validación
          </button>
          <button className="btn-dark" onClick={onStartValidation}>COMENZAR VALIDACIÓN →</button>
        </div>
      </div>

      <div className="mvp-banner">
        <span className="admin-tag">INTERNO</span>
        <span>Fase de curaduría previa a la entrega. Ninguna sección viaja al cliente hasta que la corrida se publique desde aquí.</span>
      </div>

      <div className="evhero">
        <div className="ov" />
        <div className="txt">
          <small>CORRIDA DE VALIDACIÓN · {EVENT_ID}</small>
          <h3>{EVENT_TITLE}</h3>
          <div className="tags">
            <span>Demo · {summary.total} de {DEMO_TOTAL.toLocaleString('es-PE')} recortes</span>
            <span>2 cámaras · callejón de llegada</span>
            <span>Motor marca v1</span>
          </div>
        </div>
      </div>

      <div className="vprog">
        <span className="pct">{pct}%</span>
        <div className="progress"><i style={{ width: `${pct}%` }} /></div>
        <span>{resolved} de {summary.total} resueltos · {summary.pending} pendientes</span>
      </div>

      <div className="kpis">
        {kpis.map((kpi) => (
          <div className="kpi" key={kpi.label} title={kpi.hint}>
            <div className="row1">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg></div>
              <span className={`badge ${kpi.tone}`}>{kpi.tone === 'up' ? 'ok' : '—'}</span>
            </div>
            <div className="num">{kpi.value}</div>
            <div className="cap">{kpi.label}</div>
            <div className="kpi-hint">{kpi.hint}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3><svg viewBox="0 0 24 24"><path d="M20 7h-9M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>Avance por marca</h3>
          <span className="tag">clasificación del motor</span>
        </div>
        {Object.entries(brandProgress)
          .sort(([brandA, a], [brandB, b]) => {
            if (b.total !== a.total) return b.total - a.total
            return brandA.localeCompare(brandB, 'es')
          })
          .map(([brand, stats]) => {
            const label = brand || UNKNOWN_BRAND_LABEL
            const progress = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0
            const color = brandColor(label)
            return (
              <div className="brand-row" key={brand || '__unknown__'}>
                <div className="nm"><span className="bdot" style={{ background: color }} />{label}</div>
                <div className="track"><div className="fill" style={{ width: `${progress}%`, background: color }} /></div>
                <div className="val">{stats.resolved}<small>/{stats.total}</small></div>
              </div>
            )
          })}
      </div>
    </section>
  )
}
