import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './auth/AuthGate'
import { DetailView } from './components/DetailView'
import { MosaicView } from './components/MosaicView'
import { PanelView } from './components/PanelView'
import { PublishView } from './components/PublishView'
import { Sidebar } from './components/Sidebar'
import { useValidationStore } from './hooks/useValidationStore'
import { isPendingModel } from './utils/record'
import type { MosaicUiState, ValidationView } from './types'

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
    if (!auth?.session || !store.remoteSessionEnabled) return
    void store.loadRemoteSession()
  }, [auth?.session, store.loadRemoteSession, store.remoteSessionEnabled])

  useEffect(() => {
    if (!store.sessionDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [store.sessionDirty])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, select, textarea')) return
      if (view !== 'detail') return
      const record = store.records[store.detailIndex]
      if (!record) return
      const key = event.key.toLowerCase()
      const pendingModel = isPendingModel(record, store.displayCatalog)
      if (key === 'a' && !pendingModel) { store.approveRecords([record.personId], 'individual'); store.setDetailIndex((store.detailIndex + 1) % store.records.length) }
      if (key === 'd' || key === 'r') { store.discardRecords([record.personId], 'individual'); store.setDetailIndex((store.detailIndex + 1) % store.records.length) }
      if (event.key === 'ArrowRight') store.setDetailIndex((store.detailIndex + 1) % store.records.length)
      if (event.key === 'ArrowLeft') store.setDetailIndex((store.detailIndex - 1 + store.records.length) % store.records.length)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store, view])

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
      <Sidebar activeView={view} pending={store.summary.pending} onNavigate={handleSidebarNavigate} />
      <main className="main">
        {view === 'panel' && (
          <PanelView
            summary={store.summary}
            records={store.records}
            displayCatalog={store.displayCatalog}
            darkMode={darkMode}
            onDarkModeChange={setDarkMode}
            onStartValidation={() => navigate('mosaic')}
            onResetSession={store.resetSession}
          />
        )}
        {(view === 'mosaic' || mosaicReady) && (
          <div hidden={view !== 'mosaic'}>
            <MosaicView
              records={store.records}
              displayCatalog={store.displayCatalog}
              persistedUi={store.loadedMosaicUi ?? mosaicUiRef.current}
              bootstrapUi={store.loadedMosaicUi}
              onPersistUi={persistMosaicUi}
              active={view === 'mosaic'}
              canUndo={store.canUndo}
              onUndo={store.undoLastAction}
              onApprove={(ids) => store.approveRecords(ids)}
              onDiscard={(ids) => store.discardRecords(ids)}
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
        {view === 'detail' && (
          <DetailView
            records={store.records}
            index={store.detailIndex}
            displayCatalog={store.displayCatalog}
            onIndexChange={store.setDetailIndex}
            onBackToMosaic={goToMosaic}
            onApprove={(id) => store.approveRecords([id], 'individual')}
            onDiscard={(id) => store.discardRecords([id], 'individual')}
            onCorrectBrand={(id, brand) => store.correctBrand([id], brand, 'individual')}
            onCorrectModel={(id, brand, model) => store.correctModel([id], brand, model, 'individual')}
          />
        )}
        {view === 'publish' && (
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
      </main>
    </div>
  )
}

export default App
