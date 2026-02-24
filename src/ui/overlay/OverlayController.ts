import { ensureChartJsLoaded } from './charts/ChartFactory'
import { OverlayRoot } from './OverlayRoot'
import { CivilizationsPage } from './pages/CivilizationsPage'
import { EnvironmentPage } from './pages/EnvironmentPage'
import { EventsPage } from './pages/EventsPage'
import { AiChatPage } from './pages/AiChatPage'
import { IndividualsPage } from './pages/IndividualsPage'
import { ItemsPage } from './pages/ItemsPage'
import { LogsPage } from './pages/LogsPage'
import { OverviewPage } from './pages/OverviewPage'
import { SpeciesPage } from './pages/SpeciesPage'
import { StructuresPage } from './pages/StructuresPage'
import { WorldGenesisPage } from './pages/WorldGenesisPage'
import type {
  OverlayActionHandler,
  OverlayActionName,
  OverlayActionPayload,
  OverlayPage,
  OverlayTabId,
  SimulationSnapshot,
} from './types'

const TAB_ORDER: OverlayTabId[] = [
  'overview',
  'events',
  'species',
  'environment',
  'worldGenesis',
  'structures',
  'civilizations',
  'individuals',
  'items',
  'aiChat',
  'logs',
]

/**
 * Controller centralizzato della dev dashboard overlay.
 */
export class OverlayController {
  private readonly root = new OverlayRoot()
  private readonly pages = new Map<OverlayTabId, OverlayPage>()
  private readonly actionListeners = new Set<OverlayActionHandler>()

  private activeTab: OverlayTabId = 'overview'
  private snapshot: SimulationSnapshot | null = null
  private deferredSnapshot: SimulationSnapshot | null = null
  private pointerInteracting = false
  private mounted = false

  private readonly onHotkey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      this.emit('playPause')
      return
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      this.emit('speedUp')
      return
    }

    if (event.key === '-') {
      event.preventDefault()
      this.emit('speedDown')
      return
    }

    if (event.key.toLowerCase() === 'r') {
      event.preventDefault()
      const seed = this.root.readSeedValue(this.snapshot?.seed ?? 1)
      this.emit('reset', { seed })
      return
    }

    if (event.key.toLowerCase() === 'v') {
      event.preventDefault()
      this.toggleWorldView()
      return
    }

    if (event.key.toLowerCase() === 'h') {
      event.preventDefault()
      this.toggleHudVisibility()
      return
    }

    const numeric = Number(event.key)
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= TAB_ORDER.length) {
      event.preventDefault()
      const tab = TAB_ORDER[numeric - 1]
      if (!tab) return
      this.setActiveTab(tab)
      this.emit('setTab', { tab })
    }
  }

  mount(container: HTMLElement): void {
    if (this.mounted) {
      return
    }
    this.mounted = true

    this.root.mount(container)
    this.buildPages()
    this.bindControls()

    this.setActiveTab(this.activeTab)
    void ensureChartJsLoaded()

    this.root.root.addEventListener('pointerdown', this.onOverlayPointerDown, true)
    window.addEventListener('pointerup', this.onGlobalPointerRelease, true)
    window.addEventListener('pointercancel', this.onGlobalPointerRelease, true)

    window.addEventListener('keydown', this.onHotkey)
  }

  unmount(): void {
    if (!this.mounted) {
      return
    }
    this.mounted = false

    this.unbindControls()
    this.root.root.removeEventListener('pointerdown', this.onOverlayPointerDown, true)
    window.removeEventListener('pointerup', this.onGlobalPointerRelease, true)
    window.removeEventListener('pointercancel', this.onGlobalPointerRelease, true)
    window.removeEventListener('keydown', this.onHotkey)
    this.pointerInteracting = false
    this.deferredSnapshot = null

    for (const page of this.pages.values()) {
      page.destroy()
    }
    this.pages.clear()
    this.root.unmount()
  }

  setSnapshot(snapshot: SimulationSnapshot): void {
    this.snapshot = snapshot
    if (this.pointerInteracting) {
      this.deferredSnapshot = snapshot
      return
    }
    this.applySnapshot(snapshot)
  }

  openTab(tab: OverlayTabId): void {
    if (!TAB_ORDER.includes(tab)) {
      return
    }
    this.setActiveTab(tab)
    this.emit('setTab', { tab })
  }

  onAction(handler: OverlayActionHandler): () => void {
    this.actionListeners.add(handler)
    return () => {
      this.actionListeners.delete(handler)
    }
  }

  setHudVisible(visible: boolean): void {
    this.root.setVisible(visible)
  }

  isHudVisible(): boolean {
    return this.root.isVisible()
  }

  private emit(actionName: OverlayActionName, payload?: OverlayActionPayload): void {
    for (const listener of this.actionListeners) {
      listener(actionName, payload)
    }
  }

  private buildPages(): void {
    if (this.pages.size > 0) {
      return
    }

    const emit = (actionName: OverlayActionName, payload?: OverlayActionPayload): void => {
      this.emit(actionName, payload)
    }

    const pageInstances: OverlayPage[] = [
      new OverviewPage(),
      new EventsPage(),
      new SpeciesPage(emit),
      new EnvironmentPage(emit),
      new WorldGenesisPage(),
      new StructuresPage(emit),
      new CivilizationsPage(emit),
      new IndividualsPage(emit),
      new ItemsPage(emit),
      new AiChatPage(emit),
      new LogsPage(),
    ]

    for (let i = 0; i < pageInstances.length; i++) {
      const page = pageInstances[i]
      if (!page) continue
      this.pages.set(page.id, page)
      page.mount(this.root.pageHost)
      page.setVisible(page.id === this.activeTab)
    }
  }

  private setActiveTab(tab: OverlayTabId): void {
    this.activeTab = tab
    this.root.setActiveTab(tab)

    for (const page of this.pages.values()) {
      page.setVisible(page.id === tab)
    }

    if (this.snapshot) {
      const activePage = this.pages.get(this.activeTab)
      activePage?.update(this.snapshot)
    }
  }

  private bindControls(): void {
    this.root.playPauseBtn.addEventListener('click', this.onPlayPauseClick)
    this.root.speedDownBtn.addEventListener('click', this.onSpeedDownClick)
    this.root.speedUpBtn.addEventListener('click', this.onSpeedUpClick)
    this.root.saveBtn.addEventListener('click', this.onSaveClick)
    this.root.resetBtn.addEventListener('click', this.onResetClick)
    this.root.worldViewBtn.addEventListener('click', this.onWorldViewClick)
    this.root.hideHudBtn.addEventListener('click', this.onHideHudClick)

    for (const [tab, button] of this.root.tabButtons.entries()) {
      button.addEventListener('click', () => {
        this.setActiveTab(tab)
        this.emit('setTab', { tab })
      })
    }
  }

  private unbindControls(): void {
    this.root.playPauseBtn.removeEventListener('click', this.onPlayPauseClick)
    this.root.speedDownBtn.removeEventListener('click', this.onSpeedDownClick)
    this.root.speedUpBtn.removeEventListener('click', this.onSpeedUpClick)
    this.root.saveBtn.removeEventListener('click', this.onSaveClick)
    this.root.resetBtn.removeEventListener('click', this.onResetClick)
    this.root.worldViewBtn.removeEventListener('click', this.onWorldViewClick)
    this.root.hideHudBtn.removeEventListener('click', this.onHideHudClick)
  }

  private readonly onPlayPauseClick = (): void => {
    this.emit('playPause')
  }

  private readonly onSpeedDownClick = (): void => {
    this.emit('speedDown')
  }

  private readonly onSpeedUpClick = (): void => {
    this.emit('speedUp')
  }

  private readonly onSaveClick = (): void => {
    this.emit('saveWorld')
  }

  private readonly onResetClick = (): void => {
    const seed = this.root.readSeedValue(this.snapshot?.seed ?? 1)
    this.emit('reset', { seed })
  }

  private readonly onWorldViewClick = (): void => {
    this.toggleWorldView()
  }

  private readonly onHideHudClick = (): void => {
    this.toggleHudVisibility()
  }

  private toggleWorldView(): void {
    this.root.setWorldView(!this.root.isWorldView())
  }

  private toggleHudVisibility(): void {
    this.root.setVisible(!this.root.isVisible())
  }

  private applySnapshot(snapshot: SimulationSnapshot): void {
    this.root.setHeaderState({
      tick: snapshot.tick,
      fps: snapshot.fps,
      speed: snapshot.speed,
      paused: snapshot.paused,
      seed: snapshot.seed,
    })

    const activePage = this.pages.get(this.activeTab)
    activePage?.update(snapshot)
  }

  private readonly onOverlayPointerDown = (event: PointerEvent): void => {
    if (!this.root.root.contains(event.target as Node | null)) {
      return
    }
    this.pointerInteracting = true
  }

  private readonly onGlobalPointerRelease = (): void => {
    if (!this.pointerInteracting) {
      return
    }
    this.pointerInteracting = false
    if (!this.deferredSnapshot) {
      return
    }
    const latest = this.deferredSnapshot
    this.deferredSnapshot = null
    this.applySnapshot(latest)
  }
}
