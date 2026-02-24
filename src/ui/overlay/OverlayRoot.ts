import type { OverlayTabId } from './types'
import './styles/overlay.css'

type TabDef = {
  id: OverlayTabId
  label: string
  short: string
}

const TAB_DEFS: TabDef[] = [
  { id: 'overview', label: 'Overview', short: 'OV' },
  { id: 'events', label: 'Events', short: 'EV' },
  { id: 'species', label: 'Species', short: 'SP' },
  { id: 'environment', label: 'Environment', short: 'EN' },
  { id: 'worldGenesis', label: 'Genesis', short: 'GN' },
  { id: 'structures', label: 'Structures', short: 'ST' },
  { id: 'civilizations', label: 'Civilizations', short: 'CV' },
  { id: 'individuals', label: 'Individuals', short: 'IN' },
  { id: 'items', label: 'Items', short: 'IT' },
  { id: 'aiChat', label: 'AI Chat', short: 'AI' },
  { id: 'logs', label: 'Logs', short: 'LG' },
]

/**
 * Root layout HTML della dashboard overlay.
 */
export class OverlayRoot {
  readonly root = document.createElement('div')
  readonly shell = document.createElement('div')

  readonly topBar = document.createElement('header')
  readonly layout = document.createElement('div')
  readonly sidebar = document.createElement('aside')
  readonly pageHost = document.createElement('main')

  readonly playPauseBtn = document.createElement('button')
  readonly speedDownBtn = document.createElement('button')
  readonly speedUpBtn = document.createElement('button')
  readonly saveBtn = document.createElement('button')
  readonly resetBtn = document.createElement('button')
  readonly worldViewBtn = document.createElement('button')
  readonly hideHudBtn = document.createElement('button')
  readonly seedInput = document.createElement('input')

  readonly tickValue = document.createElement('span')
  readonly fpsValue = document.createElement('span')
  readonly speedValue = document.createElement('span')
  readonly pausedValue = document.createElement('span')

  readonly tabButtons = new Map<OverlayTabId, HTMLButtonElement>()

  private mounted = false
  private worldView = false
  private visible = true

  constructor() {
    this.root.className = 'bi-ov-root'
    this.shell.className = 'bi-ov-shell'

    this.topBar.className = 'bi-ov-topbar bi-ov-glass'
    this.layout.className = 'bi-ov-layout'
    this.sidebar.className = 'bi-ov-sidebar bi-ov-glass bi-ov-scroll'
    this.pageHost.className = 'bi-ov-main bi-ov-glass bi-ov-scroll'

    this.buildTopBar()
    this.buildSidebar()

    this.layout.append(this.sidebar, this.pageHost)
    this.shell.append(this.topBar, this.layout)
    this.root.append(this.shell)
  }

  mount(container: HTMLElement): void {
    if (this.mounted) {
      return
    }
    this.mounted = true
    container.appendChild(this.root)
  }

  unmount(): void {
    if (!this.mounted) {
      return
    }
    this.mounted = false
    this.root.remove()
  }

  setVisible(value: boolean): void {
    this.visible = value
    this.root.classList.toggle('is-hidden', !value)
    this.hideHudBtn.textContent = value ? 'Hide HUD' : 'Show HUD'
  }

  isVisible(): boolean {
    return this.visible
  }

  setWorldView(value: boolean): void {
    this.worldView = value
    this.root.classList.toggle('is-world-view', value)
    this.worldViewBtn.textContent = value ? 'Dashboard View' : 'World View'
  }

  isWorldView(): boolean {
    return this.worldView
  }

  setActiveTab(tab: OverlayTabId): void {
    for (const [id, button] of this.tabButtons.entries()) {
      if (id === tab) {
        button.classList.add('is-active')
      } else {
        button.classList.remove('is-active')
      }
    }
  }

  setHeaderState(params: {
    tick: number
    fps: number | null
    speed: number
    paused: boolean
    seed: number
  }): void {
    this.tickValue.textContent = String(params.tick)
    this.fpsValue.textContent = params.fps ? params.fps.toFixed(1) : '--'
    this.speedValue.textContent = `${params.speed.toFixed(2)}x`
    this.pausedValue.textContent = params.paused ? 'PAUSED' : 'RUNNING'
    this.playPauseBtn.textContent = params.paused ? 'Play' : 'Pause'

    if (document.activeElement !== this.seedInput) {
      this.seedInput.value = String(params.seed)
    }
  }

  readSeedValue(defaultSeed: number): number {
    const value = Number(this.seedInput.value)
    if (!Number.isFinite(value)) {
      return defaultSeed
    }
    return Math.floor(value)
  }

  private buildTopBar(): void {
    const brand = document.createElement('div')
    brand.className = 'bi-ov-brand'
    const dot = document.createElement('span')
    dot.className = 'bi-ov-brand-dot'
    const label = document.createElement('span')
    label.textContent = 'BIOTICA'
    brand.append(dot, label)

    const indicators = document.createElement('div')
    indicators.className = 'bi-ov-indicators'
    indicators.append(
      this.createIndicator('Tick', this.tickValue),
      this.createIndicator('FPS', this.fpsValue),
      this.createIndicator('Speed', this.speedValue),
      this.createIndicator('State', this.pausedValue),
    )

    this.playPauseBtn.className = 'bi-ov-btn'
    this.playPauseBtn.textContent = 'Pause'

    this.speedDownBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
    this.speedDownBtn.textContent = 'Speed -'

    this.speedUpBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
    this.speedUpBtn.textContent = 'Speed +'

    this.saveBtn.className = 'bi-ov-btn'
    this.saveBtn.textContent = 'Save'

    this.seedInput.className = 'bi-ov-input'
    this.seedInput.type = 'number'
    this.seedInput.placeholder = 'Seed'

    this.resetBtn.className = 'bi-ov-btn'
    this.resetBtn.textContent = 'Reset'

    this.worldViewBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
    this.worldViewBtn.textContent = 'World View'

    this.hideHudBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
    this.hideHudBtn.textContent = 'Hide HUD'

    const controls = document.createElement('div')
    controls.className = 'bi-ov-controls'
    controls.append(
      this.playPauseBtn,
      this.speedDownBtn,
      this.speedUpBtn,
      this.saveBtn,
      this.seedInput,
      this.resetBtn,
      this.worldViewBtn,
      this.hideHudBtn,
    )

    this.topBar.append(brand, indicators, controls)
  }

  private buildSidebar(): void {
    for (let i = 0; i < TAB_DEFS.length; i++) {
      const tab = TAB_DEFS[i]
      if (!tab) continue

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'bi-ov-tab'
      button.dataset.tab = tab.id
      button.dataset.short = tab.short
      button.textContent = tab.label
      this.sidebar.appendChild(button)
      this.tabButtons.set(tab.id, button)
    }
  }

  private createIndicator(label: string, valueEl: HTMLElement): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'bi-ov-indicator'

    const labelEl = document.createElement('span')
    labelEl.className = 'bi-ov-indicator-label'
    labelEl.textContent = label

    valueEl.className = 'bi-ov-indicator-value'
    valueEl.textContent = '--'

    wrap.append(labelEl, valueEl)
    return wrap
  }
}
