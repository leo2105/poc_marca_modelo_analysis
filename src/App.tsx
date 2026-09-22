import { Component, useCallback, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useAuth } from './auth/AuthGate'
import { DetailView } from './components/DetailView'
import { MosaicView } from './components/MosaicView'
import { PanelView } from './components/PanelView'
import { PublishView } from './components/PublishView'
import { Sidebar } from './components/Sidebar'
import { useValidationStore } from './hooks/useValidationStore'
import type { MosaicUiState, ValidationView } from './types'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="race-loading">
          No se pudo mostrar esta carrera. Recargá la página o volvé a Homenaje.
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const store = useValidationStore()
  const auth = useAuth()
  const [view, setView] = useState<ValidationView>('panel')
  const [mosaicReady, setMosaicReady] = useState(false)
  const mosaicUiRef = useRef<MosaicUiState | null>(null)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('len-dashboard-theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('len-dashboard-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    mosaicUiRef.current = null
    setMosaicReady(false)
  }, [store.eventId])

  useEffect(() => {
    if (!auth?.session || !store.remoteSessionEnabled || store.raceLoading) return
    void store.loadRemoteSession()
  }, [auth?.session, store.eventId, store.raceLoading, store.loadRemoteSession, store.remoteSessionEnabled])

  useEffect(() => {
    if (!store.sessionDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [store.sessionDirty])

  const saveSessionRef = useRef(store.saveRemoteSession)
  saveSessionRef.current = store.saveRemoteSession
  const sessionDirtyRef = useRef(store.sessionDirty)
  sessionDirtyRef.current = store.sessionDirty
  const raceLoadingRef = useRef(store.raceLoading)
  raceLoadingRef.current = store.raceLoading
  const sessionSaveStateRef = useRef(store.sessionSaveState)
  sessionSaveStateRef.current = store.sessionSaveState

  useEffect(() => {
    if (!auth?.session || !store.remoteSessionEnabled) return
    const id = window.setInterval(() => {
      if (!sessionDirtyRef.current) return
      if (raceLoadingRef.current) return
      if (sessionSaveStateRef.current === 'saving') return
      void saveSessionRef.current(mosaicUiRef.current).catch(() => undefined)
    }, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [auth?.session, store.remoteSessionEnabled])

  const navigate = (next: ValidationView, options?: { preserveScroll?: boolean }) => {
    setView(next)
    if (!options?.preserveScroll) {
      window.scrollTo(0, 0)
    }
  }

  useEffect(() => {
    if (view === 'mosaic') setMosaicReady(true)
  }, [view])

  const persistMosaicUi = useCallback((ui: MosaicUiState) => {
    mosaicUiRef.current = ui
  }, [])

  const goToMosaic = () => {
    navigate('mosaic', { preserveScroll: true })
    const scrollY = mosaicUiRef.current?.scrollY ?? 0
    if (scrollY > 0) {
      requestAnimationFrame(() => window.scrollTo(0, scrollY))
    }
  }

  const handleSidebarNavigate = (next: ValidationView) => {
    if (next === 'mosaic') {
      goToMosaic()
      return
    }
    navigate(next)
  }

  return (
    <div className="app">
      <Sidebar
        activeView={view}
        pending={store.summary.pending}
        race={store.race}
        races={store.races}
        raceLoading={store.raceLoading}
        onSelectEvent={(eventId) => { void store.selectEvent(eventId) }}
        onNavigate={handleSidebarNavigate}
      />
      <main className="main">
        {store.raceError && (
          <div className="mvp-banner">
            <span className="admin-tag">ERROR</span>
            <span>{store.raceError}</span>
          </div>
        )}
        {store.raceLoading && (
          <div className="race-loading">Cargando carrera…</div>
        )}
        <AppErrorBoundary key={store.eventId}>
        {view === 'panel' && !store.raceLoading && (
          <PanelView
            summary={store.summary}
            records={store.records}
            displayCatalog={store.displayCatalog}
            race={store.race}
            spriteCount={store.spriteCount}
            darkMode={darkMode}
            onDarkModeChange={setDarkMode}
            onStartValidation={() => navigate('mosaic')}
            onResetSession={store.resetSession}
          />
        )}
        {(view === 'mosaic' || mosaicReady) && !store.raceLoading && (
          <div hidden={view !== 'mosaic'}>
            <MosaicView
              key={store.eventId}
              records={store.records}
              displayCatalog={store.displayCatalog}
              persistedUi={store.loadedMosaicUi ?? mosaicUiRef.current}
              bootstrapUi={store.loadedMosaicUi}
              onPersistUi={persistMosaicUi}
              active={view === 'mosaic'}
              canUndo={store.canUndo}
              onUndo={store.undoLastAction}
              onApprove={(ids) => store.approveRecords(ids)}
              onHideCrops={(ids) => store.hideCrops(ids)}
              onCorrectBrand={(ids, brand) => store.correctBrand(ids, brand)}
              onCorrectModel={(ids, brand, model) => store.correctModel(ids, brand, model)}
              onOpenDetail={(index) => {
                store.setDetailIndex(index)
                navigate('detail', { preserveScroll: true })
              }}
              remoteSaveEnabled={store.remoteSessionEnabled}
              sessionDirty={store.sessionDirty}
              sessionSaveState={store.sessionSaveState}
              sessionSaveError={store.sessionSaveError}
              onSaveSession={(ui) => store.saveRemoteSession(ui)}
              onMarkSessionDirty={store.markSessionDirty}
            />
          </div>
        )}
        {view === 'detail' && !store.raceLoading && store.records.length > 0 && (
          <DetailView
            key={store.eventId}
            records={store.records}
            index={store.detailIndex}
            displayCatalog={store.displayCatalog}
            onIndexChange={store.setDetailIndex}
            onBackToMosaic={goToMosaic}
            onApprove={(id) => store.approveRecords([id], 'individual')}
            onRemovePerspective={(id, slotIndex, remaining) =>
              store.removePerspective(id, slotIndex, remaining, 'individual')
            }
            onUndo={store.undoLastAction}
            canUndo={store.canUndo}
            onCorrectBrand={(id, brand) => store.correctBrand([id], brand, 'individual')}
            onCorrectModel={(id, brand, model) => store.correctModel([id], brand, model, 'individual')}
          />
        )}
        {view === 'publish' && !store.raceLoading && (
          <PublishView
            summary={store.summary}
            published={store.published}
            onExportJson={store.exportValidationJson}
            onPublish={() => {
              store.setPublished(true)
              window.alert('Corrida publicada. La reportería aprobada ya está disponible en el dashboard del cliente.')
            }}
          />
        )}
        </AppErrorBoundary>
      </main>
    </div>
  )
}

export default App
