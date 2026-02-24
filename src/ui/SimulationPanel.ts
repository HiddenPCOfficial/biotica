import type { CivMetricsPoint, CivTimelineEntry, DialogueRecord, FactionSummary, AgentInspectorData } from '../civ/types'
import type { ActiveEvent } from '../events/EventTypes'
import type { LogCategory, LogEntry } from '../log/SimulationLog'
import type { TopSpeciesSeries } from '../metrics/MetricsCollector'
import type { SpeciesStat } from '../creatures/types'
import type { RecentEventEntry } from '../world/WorldState'

type OverlayMode = 'none' | 'humidity' | 'temperature' | 'hazard'

export type SimulationPanelCallbacks = {
  onTogglePause: () => void
  onSetSpeed: (speed: number) => void
  onReset: (seed: number) => void
  onSetOverlayMode: (mode: OverlayMode) => void
  onToggleEventsOverlay: () => void
  onToggleTerritoryOverlay: () => void
}

export type SimulationPanelData = {
  paused: boolean
  speed: number
  tick: number
  seed: number
  activeEvents: readonly ActiveEvent[]
  recentEvents: readonly RecentEventEntry[]
  speciesStats: readonly SpeciesStat[]
  logs: readonly LogEntry[]
  series: TopSpeciesSeries
  overlayMode: OverlayMode
  eventsOverlayEnabled: boolean

  civFactions: readonly FactionSummary[]
  civTimeline: readonly CivTimelineEntry[]
  civDialogues: readonly DialogueRecord[]
  civMetrics: readonly CivMetricsPoint[]
  selectedCivAgent: AgentInspectorData | null
  territoryOverlayEnabled: boolean
}

const SPEEDS = [0.5, 1, 2, 5]

function asLabel(event: ActiveEvent): string {
  const remaining = Math.max(0, event.durationTicks - event.elapsedTicks)
  const pos = `(${event.x}, ${event.y})`
  const intensity = 'intensity' in event ? ` i=${event.intensity.toFixed(2)}` : ''
  return `${event.type}${intensity} rem=${remaining} @${pos}`
}

function hashColor(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hue = h % 360
  return `hsl(${hue} 70% 62%)`
}

export class SimulationPanel {
  readonly root = document.createElement('aside')

  private readonly statusEl = document.createElement('div')
  private readonly playPauseBtn = document.createElement('button')
  private readonly speedSelect = document.createElement('select')
  private readonly seedInput = document.createElement('input')
  private readonly resetBtn = document.createElement('button')
  private readonly overlaySelect = document.createElement('select')
  private readonly eventsOverlayBtn = document.createElement('button')
  private readonly territoryOverlayBtn = document.createElement('button')

  private readonly tabsWrap = document.createElement('div')
  private readonly worldTabBtn = document.createElement('button')
  private readonly civTabBtn = document.createElement('button')
  private readonly worldTab = document.createElement('div')
  private readonly civTab = document.createElement('div')

  private readonly activeEventsList = document.createElement('ul')
  private readonly recentEventsList = document.createElement('ul')
  private readonly speciesTable = document.createElement('table')
  private readonly logList = document.createElement('div')
  private readonly chartCanvas = document.createElement('canvas')

  private readonly factionsTable = document.createElement('table')
  private readonly civTimelineList = document.createElement('div')
  private readonly civDialoguesList = document.createElement('div')
  private readonly civChartCanvas = document.createElement('canvas')
  private readonly civStatsLine = document.createElement('div')
  private readonly agentInspectorPre = document.createElement('pre')
  private readonly dialogueFactionFilter = document.createElement('select')

  private readonly filterEvents = document.createElement('input')
  private readonly filterEnv = document.createElement('input')
  private readonly filterCreatures = document.createElement('input')
  private readonly filterBirths = document.createElement('input')
  private readonly filterDeaths = document.createElement('input')
  private readonly filterSpeciation = document.createElement('input')
  private readonly filterInfo = document.createElement('input')
  private readonly filterCiv = document.createElement('input')

  private visible = true
  private activeTab: 'world' | 'civ' = 'world'

  constructor(
    private readonly callbacks: SimulationPanelCallbacks,
    parent: HTMLElement = document.body,
  ) {
    this.root.className = 'simulation-panel'
    this.root.style.position = 'fixed'
    this.root.style.right = '12px'
    this.root.style.top = '12px'
    this.root.style.width = '470px'
    this.root.style.maxHeight = 'calc(100vh - 24px)'
    this.root.style.overflow = 'auto'
    this.root.style.padding = '10px'
    this.root.style.borderRadius = '10px'
    this.root.style.border = '1px solid rgba(255,255,255,0.18)'
    this.root.style.background = 'rgba(12, 16, 22, 0.92)'
    this.root.style.color = '#e7f0ff'
    this.root.style.zIndex = '60'
    this.root.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace'
    this.root.style.fontSize = '12px'

    const title = document.createElement('h2')
    title.textContent = 'Biotica Simulation'
    title.style.margin = '0 0 8px 0'
    title.style.fontSize = '15px'

    this.statusEl.style.marginBottom = '8px'
    this.statusEl.style.opacity = '0.9'

    const controls = this.createControls()
    this.createTabs()
    this.buildWorldTab()
    this.buildCivTab()

    this.root.appendChild(title)
    this.root.appendChild(this.statusEl)
    this.root.appendChild(controls)
    this.root.appendChild(this.tabsWrap)
    this.root.appendChild(this.worldTab)
    this.root.appendChild(this.civTab)
    parent.appendChild(this.root)

    this.setActiveTab('world')
  }

  destroy(): void {
    this.root.remove()
  }

  setVisible(value: boolean): void {
    this.visible = value
    this.root.style.display = value ? 'block' : 'none'
  }

  isVisible(): boolean {
    return this.visible
  }

  update(data: SimulationPanelData): void {
    this.playPauseBtn.textContent = data.paused ? 'Play' : 'Pause'
    this.eventsOverlayBtn.textContent = data.eventsOverlayEnabled ? 'Events Overlay: ON' : 'Events Overlay: OFF'
    this.territoryOverlayBtn.textContent = data.territoryOverlayEnabled
      ? 'Territory Overlay: ON'
      : 'Territory Overlay: OFF'

    this.statusEl.textContent = `tick=${data.tick} seed=${data.seed} speed=${data.speed.toFixed(1)}x`
    this.seedInput.value = String(data.seed)

    const speedValue = data.speed.toFixed(1)
    if (this.speedSelect.value !== speedValue) {
      this.speedSelect.value = speedValue
    }
    if (this.overlaySelect.value !== data.overlayMode) {
      this.overlaySelect.value = data.overlayMode
    }

    this.renderActiveEvents(data.activeEvents)
    this.renderRecentEvents(data.recentEvents)
    this.renderSpeciesTable(data.speciesStats)
    this.renderLogs(data.logs)
    this.renderWorldChart(data.series, data.speciesStats)

    this.renderFactionsTable(data.civFactions)
    this.renderCivTimeline(data.civTimeline)
    this.renderDialogues(data.civDialogues)
    this.renderCivChart(data.civMetrics, data.civFactions)
    this.renderAgentInspector(data.selectedCivAgent)
  }

  getEnabledLogCategories(): ReadonlySet<LogCategory> {
    const categories = new Set<LogCategory>()

    if (this.filterEvents.checked) categories.add('events')
    if (this.filterEnv.checked) categories.add('env')
    if (this.filterCreatures.checked) categories.add('creatures')
    if (this.filterBirths.checked) categories.add('births')
    if (this.filterDeaths.checked) categories.add('deaths')
    if (this.filterSpeciation.checked) categories.add('speciation')
    if (this.filterInfo.checked) {
      categories.add('info')
      categories.add('population')
    }
    if (this.filterCiv.checked) {
      categories.add('civ_foundation')
      categories.add('civ_split')
      categories.add('civ_build')
      categories.add('civ_trade')
      categories.add('civ_war')
      categories.add('civ_talk')
      categories.add('civ_religion')
      categories.add('civ_law')
    }

    return categories
  }

  private createControls(): HTMLElement {
    const wrap = document.createElement('section')
    wrap.style.marginBottom = '10px'
    wrap.style.padding = '8px'
    wrap.style.border = '1px solid rgba(255,255,255,0.12)'
    wrap.style.borderRadius = '8px'

    const title = document.createElement('h3')
    title.textContent = 'Controls'
    title.style.margin = '0 0 6px 0'
    title.style.fontSize = '13px'

    const row1 = document.createElement('div')
    row1.style.display = 'flex'
    row1.style.gap = '6px'
    row1.style.marginBottom = '6px'

    this.playPauseBtn.textContent = 'Pause'
    this.playPauseBtn.onclick = () => this.callbacks.onTogglePause()

    for (let i = 0; i < SPEEDS.length; i++) {
      const speed = SPEEDS[i]!
      const option = document.createElement('option')
      option.value = speed.toFixed(1)
      option.textContent = `${speed.toFixed(1)}x`
      this.speedSelect.appendChild(option)
    }
    this.speedSelect.value = '1.0'
    this.speedSelect.onchange = () => {
      this.callbacks.onSetSpeed(Number(this.speedSelect.value))
    }

    row1.appendChild(this.playPauseBtn)
    row1.appendChild(this.speedSelect)

    const row2 = document.createElement('div')
    row2.style.display = 'flex'
    row2.style.gap = '6px'
    row2.style.marginBottom = '6px'

    this.seedInput.type = 'number'
    this.seedInput.placeholder = 'seed'
    this.seedInput.style.width = '120px'
    this.resetBtn.textContent = 'Reset'
    this.resetBtn.onclick = () => {
      const seed = Number(this.seedInput.value)
      if (Number.isFinite(seed)) {
        this.callbacks.onReset(Math.floor(seed))
      }
    }

    row2.appendChild(this.seedInput)
    row2.appendChild(this.resetBtn)

    const row3 = document.createElement('div')
    row3.style.display = 'flex'
    row3.style.gap = '6px'
    row3.style.marginBottom = '6px'

    const overlayModes: OverlayMode[] = ['none', 'humidity', 'temperature', 'hazard']
    for (let i = 0; i < overlayModes.length; i++) {
      const mode = overlayModes[i]!
      const option = document.createElement('option')
      option.value = mode
      option.textContent = `Overlay: ${mode}`
      this.overlaySelect.appendChild(option)
    }
    this.overlaySelect.onchange = () => {
      this.callbacks.onSetOverlayMode(this.overlaySelect.value as OverlayMode)
    }

    row3.appendChild(this.overlaySelect)

    const row4 = document.createElement('div')
    row4.style.display = 'flex'
    row4.style.gap = '6px'

    this.eventsOverlayBtn.textContent = 'Events Overlay: ON'
    this.eventsOverlayBtn.onclick = () => this.callbacks.onToggleEventsOverlay()

    this.territoryOverlayBtn.textContent = 'Territory Overlay: ON'
    this.territoryOverlayBtn.onclick = () => this.callbacks.onToggleTerritoryOverlay()

    row4.appendChild(this.eventsOverlayBtn)
    row4.appendChild(this.territoryOverlayBtn)

    wrap.appendChild(title)
    wrap.appendChild(row1)
    wrap.appendChild(row2)
    wrap.appendChild(row3)
    wrap.appendChild(row4)
    return wrap
  }

  private createTabs(): void {
    this.tabsWrap.style.display = 'flex'
    this.tabsWrap.style.gap = '6px'
    this.tabsWrap.style.marginBottom = '8px'

    this.worldTabBtn.textContent = 'World'
    this.worldTabBtn.onclick = () => this.setActiveTab('world')

    this.civTabBtn.textContent = 'Civilizations'
    this.civTabBtn.onclick = () => this.setActiveTab('civ')

    this.tabsWrap.appendChild(this.worldTabBtn)
    this.tabsWrap.appendChild(this.civTabBtn)
  }

  private setActiveTab(tab: 'world' | 'civ'): void {
    this.activeTab = tab
    this.worldTab.style.display = tab === 'world' ? 'block' : 'none'
    this.civTab.style.display = tab === 'civ' ? 'block' : 'none'

    this.worldTabBtn.style.opacity = tab === 'world' ? '1' : '0.6'
    this.civTabBtn.style.opacity = tab === 'civ' ? '1' : '0.6'
  }

  private buildWorldTab(): void {
    this.worldTab.appendChild(this.createEventsSection())
    this.worldTab.appendChild(this.createSpeciesSection())
    this.worldTab.appendChild(this.createMetricsSection())
    this.worldTab.appendChild(this.createLogSection())
  }

  private buildCivTab(): void {
    this.civTab.appendChild(this.createCivFactionsSection())
    this.civTab.appendChild(this.createCivMetricsSection())
    this.civTab.appendChild(this.createCivTimelineSection())
    this.civTab.appendChild(this.createCivDialoguesSection())
    this.civTab.appendChild(this.createAgentInspectorSection())
  }

  private createEventsSection(): HTMLElement {
    const wrap = this.createSection('Events')

    const activeLabel = document.createElement('div')
    activeLabel.textContent = 'Active'
    activeLabel.style.fontWeight = '600'
    activeLabel.style.marginBottom = '4px'
    this.activeEventsList.style.maxHeight = '90px'
    this.activeEventsList.style.overflow = 'auto'
    this.activeEventsList.style.paddingLeft = '16px'

    const recentLabel = document.createElement('div')
    recentLabel.textContent = 'Recent'
    recentLabel.style.fontWeight = '600'
    recentLabel.style.margin = '6px 0 4px 0'
    this.recentEventsList.style.maxHeight = '90px'
    this.recentEventsList.style.overflow = 'auto'
    this.recentEventsList.style.paddingLeft = '16px'

    wrap.appendChild(activeLabel)
    wrap.appendChild(this.activeEventsList)
    wrap.appendChild(recentLabel)
    wrap.appendChild(this.recentEventsList)
    return wrap
  }

  private createSpeciesSection(): HTMLElement {
    const wrap = this.createSection('Species Stats')
    this.speciesTable.style.width = '100%'
    this.speciesTable.style.borderCollapse = 'collapse'
    wrap.appendChild(this.speciesTable)
    return wrap
  }

  private createMetricsSection(): HTMLElement {
    const wrap = this.createSection('Population Chart')

    this.chartCanvas.width = 420
    this.chartCanvas.height = 130
    this.chartCanvas.style.width = '100%'
    this.chartCanvas.style.height = '130px'
    this.chartCanvas.style.background = 'rgba(255,255,255,0.03)'
    this.chartCanvas.style.borderRadius = '6px'

    wrap.appendChild(this.chartCanvas)
    return wrap
  }

  private createLogSection(): HTMLElement {
    const wrap = this.createSection('Log')

    const filters = document.createElement('div')
    filters.style.display = 'flex'
    filters.style.flexWrap = 'wrap'
    filters.style.gap = '8px'
    filters.style.marginBottom = '6px'

    const addFilter = (input: HTMLInputElement, labelText: string, checked = true): void => {
      const label = document.createElement('label')
      label.style.display = 'inline-flex'
      label.style.alignItems = 'center'
      label.style.gap = '3px'
      input.type = 'checkbox'
      input.checked = checked
      label.appendChild(input)
      label.appendChild(document.createTextNode(labelText))
      filters.appendChild(label)
    }

    addFilter(this.filterEvents, 'events')
    addFilter(this.filterEnv, 'env', false)
    addFilter(this.filterCreatures, 'creatures', false)
    addFilter(this.filterBirths, 'births')
    addFilter(this.filterDeaths, 'deaths')
    addFilter(this.filterSpeciation, 'speciation')
    addFilter(this.filterInfo, 'info')
    addFilter(this.filterCiv, 'civ')

    this.logList.style.maxHeight = '170px'
    this.logList.style.overflow = 'auto'
    this.logList.style.whiteSpace = 'pre-wrap'
    this.logList.style.lineHeight = '1.3'
    this.logList.style.padding = '6px'
    this.logList.style.borderRadius = '6px'
    this.logList.style.background = 'rgba(255,255,255,0.04)'

    wrap.appendChild(filters)
    wrap.appendChild(this.logList)
    return wrap
  }

  private createCivFactionsSection(): HTMLElement {
    const wrap = this.createSection('Civilizations')

    this.factionsTable.style.width = '100%'
    this.factionsTable.style.borderCollapse = 'collapse'

    wrap.appendChild(this.factionsTable)
    return wrap
  }

  private createCivMetricsSection(): HTMLElement {
    const wrap = this.createSection('Civ Metrics')

    this.civStatsLine.style.marginBottom = '6px'
    this.civStatsLine.style.opacity = '0.9'

    this.civChartCanvas.width = 420
    this.civChartCanvas.height = 120
    this.civChartCanvas.style.width = '100%'
    this.civChartCanvas.style.height = '120px'
    this.civChartCanvas.style.background = 'rgba(255,255,255,0.03)'
    this.civChartCanvas.style.borderRadius = '6px'

    wrap.appendChild(this.civStatsLine)
    wrap.appendChild(this.civChartCanvas)
    return wrap
  }

  private createCivTimelineSection(): HTMLElement {
    const wrap = this.createSection('Civ Timeline')
    this.civTimelineList.style.maxHeight = '150px'
    this.civTimelineList.style.overflow = 'auto'
    this.civTimelineList.style.whiteSpace = 'pre-wrap'
    this.civTimelineList.style.padding = '6px'
    this.civTimelineList.style.borderRadius = '6px'
    this.civTimelineList.style.background = 'rgba(255,255,255,0.04)'

    wrap.appendChild(this.civTimelineList)
    return wrap
  }

  private createCivDialoguesSection(): HTMLElement {
    const wrap = this.createSection('Dialogues')

    this.dialogueFactionFilter.innerHTML = ''
    const allOption = document.createElement('option')
    allOption.value = '*'
    allOption.textContent = 'All factions'
    this.dialogueFactionFilter.appendChild(allOption)

    this.civDialoguesList.style.maxHeight = '150px'
    this.civDialoguesList.style.overflow = 'auto'
    this.civDialoguesList.style.whiteSpace = 'pre-wrap'
    this.civDialoguesList.style.padding = '6px'
    this.civDialoguesList.style.borderRadius = '6px'
    this.civDialoguesList.style.background = 'rgba(255,255,255,0.04)'

    wrap.appendChild(this.dialogueFactionFilter)
    wrap.appendChild(this.civDialoguesList)
    return wrap
  }

  private createAgentInspectorSection(): HTMLElement {
    const wrap = this.createSection('Agent Inspector')

    this.agentInspectorPre.style.margin = '0'
    this.agentInspectorPre.style.whiteSpace = 'pre-wrap'
    this.agentInspectorPre.style.padding = '6px'
    this.agentInspectorPre.style.borderRadius = '6px'
    this.agentInspectorPre.style.background = 'rgba(255,255,255,0.04)'
    this.agentInspectorPre.textContent = 'Clicca un agente nella scena per vedere i dettagli.'

    wrap.appendChild(this.agentInspectorPre)
    return wrap
  }

  private createSection(titleText: string): HTMLElement {
    const wrap = document.createElement('section')
    wrap.style.marginBottom = '10px'
    wrap.style.padding = '8px'
    wrap.style.border = '1px solid rgba(255,255,255,0.12)'
    wrap.style.borderRadius = '8px'

    const title = document.createElement('h3')
    title.textContent = titleText
    title.style.margin = '0 0 6px 0'
    title.style.fontSize = '13px'

    wrap.appendChild(title)
    return wrap
  }

  private renderActiveEvents(activeEvents: readonly ActiveEvent[]): void {
    this.activeEventsList.innerHTML = ''
    if (activeEvents.length === 0) {
      const li = document.createElement('li')
      li.textContent = 'none'
      this.activeEventsList.appendChild(li)
      return
    }

    for (let i = 0; i < activeEvents.length; i++) {
      const event = activeEvents[i]
      if (!event) continue
      const li = document.createElement('li')
      li.textContent = asLabel(event)
      this.activeEventsList.appendChild(li)
    }
  }

  private renderRecentEvents(recentEvents: readonly RecentEventEntry[]): void {
    this.recentEventsList.innerHTML = ''
    const start = Math.max(0, recentEvents.length - 50)
    for (let i = start; i < recentEvents.length; i++) {
      const event = recentEvents[i]
      if (!event) continue
      const li = document.createElement('li')
      li.textContent = `[t${event.tick}] ${event.type} (${event.x}, ${event.y})`
      this.recentEventsList.appendChild(li)
    }
    if (recentEvents.length === 0) {
      const li = document.createElement('li')
      li.textContent = 'none'
      this.recentEventsList.appendChild(li)
    }
  }

  private renderSpeciesTable(speciesStats: readonly SpeciesStat[]): void {
    this.speciesTable.innerHTML = ''
    const head = document.createElement('thead')
    const row = document.createElement('tr')
    const headers = ['id', 'tick', 'pop', 'avgE', 'genome']
    for (let i = 0; i < headers.length; i++) {
      const th = document.createElement('th')
      th.textContent = headers[i]!
      th.style.textAlign = 'left'
      th.style.padding = '2px 4px'
      th.style.borderBottom = '1px solid rgba(255,255,255,0.15)'
      row.appendChild(th)
    }
    head.appendChild(row)

    const body = document.createElement('tbody')
    const maxRows = Math.min(10, speciesStats.length)
    for (let i = 0; i < maxRows; i++) {
      const stat = speciesStats[i]
      if (!stat) continue
      const tr = document.createElement('tr')
      tr.style.color = stat.color

      tr.innerHTML = `<td style="padding:2px 4px">${stat.speciesId}</td><td style="padding:2px 4px">${stat.createdAtTick}</td><td style="padding:2px 4px">${stat.population}</td><td style="padding:2px 4px">${stat.avgEnergy.toFixed(1)}</td><td style="padding:2px 4px">m${stat.avgGenome.metabolismRate.toFixed(2)} r${stat.avgGenome.reproductionThreshold.toFixed(2)}</td>`
      body.appendChild(tr)
    }

    this.speciesTable.appendChild(head)
    this.speciesTable.appendChild(body)
  }

  private renderLogs(logs: readonly LogEntry[]): void {
    const allowed = this.getEnabledLogCategories()
    const lines: string[] = []
    const start = Math.max(0, logs.length - 500)

    for (let i = start; i < logs.length; i++) {
      const entry = logs[i]
      if (!entry) continue
      if (!allowed.has(entry.category)) continue
      lines.push(`[t${entry.tick}] [${entry.category}] ${entry.message}`)
    }

    this.logList.textContent = lines.length > 0 ? lines.join('\n') : 'no log entries'
  }

  private renderWorldChart(series: TopSpeciesSeries, speciesStats: readonly SpeciesStat[]): void {
    const ctx = this.chartCanvas.getContext('2d')
    if (!ctx) return

    const w = this.chartCanvas.width
    const h = this.chartCanvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(0, 0, w, h)

    const points = series.points
    if (points.length < 2 || series.speciesIds.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText('not enough samples', 8, 16)
      return
    }

    let maxPop = 1
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      if (!p) continue
      for (let j = 0; j < p.values.length; j++) {
        maxPop = Math.max(maxPop, p.values[j] ?? 0)
      }
    }

    const left = 24
    const right = w - 8
    const top = 8
    const bottom = h - 18
    const plotW = Math.max(1, right - left)
    const plotH = Math.max(1, bottom - top)

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.beginPath()
    ctx.moveTo(left, top)
    ctx.lineTo(left, bottom)
    ctx.lineTo(right, bottom)
    ctx.stroke()

    const colorBySpecies = new Map<string, string>()
    for (let i = 0; i < speciesStats.length; i++) {
      const s = speciesStats[i]
      if (!s) continue
      colorBySpecies.set(s.speciesId, s.color)
    }

    for (let s = 0; s < series.speciesIds.length; s++) {
      const speciesId = series.speciesIds[s]!
      ctx.strokeStyle = colorBySpecies.get(speciesId) ?? '#ffffff'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      for (let i = 0; i < points.length; i++) {
        const p = points[i]
        if (!p) continue
        const x = left + (i / (points.length - 1)) * plotW
        const y = bottom - ((p.values[s] ?? 0) / maxPop) * plotH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.fillText(String(maxPop), 2, top + 8)
    ctx.fillText('0', 10, bottom)
  }

  private renderFactionsTable(factions: readonly FactionSummary[]): void {
    this.factionsTable.innerHTML = ''

    const head = document.createElement('thead')
    const row = document.createElement('tr')
    const headers = ['name', 'pop', 'tech', 'religion', 'spirit', 'aggro', 'gram']
    for (let i = 0; i < headers.length; i++) {
      const th = document.createElement('th')
      th.textContent = headers[i]!
      th.style.textAlign = 'left'
      th.style.padding = '2px 4px'
      th.style.borderBottom = '1px solid rgba(255,255,255,0.15)'
      row.appendChild(th)
    }
    head.appendChild(row)

    const body = document.createElement('tbody')
    const limit = Math.min(12, factions.length)
    for (let i = 0; i < limit; i++) {
      const faction = factions[i]
      if (!faction) continue
      const tr = document.createElement('tr')
      tr.style.color = hashColor(faction.id)
      tr.innerHTML = `<td style="padding:2px 4px">${faction.name}</td><td style="padding:2px 4px">${faction.population}</td><td style="padding:2px 4px">${faction.techLevel.toFixed(1)}</td><td style="padding:2px 4px">${faction.religion}</td><td style="padding:2px 4px">${faction.spirituality.toFixed(2)}</td><td style="padding:2px 4px">${faction.aggression.toFixed(2)}</td><td style="padding:2px 4px">${faction.grammarLevel}</td>`
      body.appendChild(tr)
    }

    this.factionsTable.appendChild(head)
    this.factionsTable.appendChild(body)
  }

  private renderCivTimeline(entries: readonly CivTimelineEntry[]): void {
    const start = Math.max(0, entries.length - 120)
    const lines: string[] = []
    for (let i = start; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry) continue
      lines.push(`[t${entry.tick}] [${entry.category}] ${entry.message}`)
    }
    this.civTimelineList.textContent = lines.length > 0 ? lines.join('\n') : 'no timeline entries'
  }

  private renderDialogues(dialogues: readonly DialogueRecord[]): void {
    const knownFactions = new Set<string>()
    for (let i = 0; i < dialogues.length; i++) {
      const d = dialogues[i]
      if (!d) continue
      knownFactions.add(d.factionId)
    }

    const selected = this.dialogueFactionFilter.value || '*'
    const existing = new Set<string>()
    for (let i = 0; i < this.dialogueFactionFilter.options.length; i++) {
      const opt = this.dialogueFactionFilter.options[i]
      if (!opt) continue
      existing.add(opt.value)
    }

    for (const factionId of knownFactions) {
      if (existing.has(factionId)) continue
      const option = document.createElement('option')
      option.value = factionId
      option.textContent = factionId
      this.dialogueFactionFilter.appendChild(option)
    }

    const lines: string[] = []
    const start = Math.max(0, dialogues.length - 100)
    for (let i = start; i < dialogues.length; i++) {
      const item = dialogues[i]
      if (!item) continue
      if (selected !== '*' && item.factionId !== selected) {
        continue
      }

      const lineA = item.lines[0]?.text ?? item.utteranceA.join(' ')
      const lineB = item.lines[1]?.text ?? item.utteranceB.join(' ')
      lines.push(`[t${item.tick}] ${item.factionId} / ${item.topic}`)
      lines.push(`  ${lineA}`)
      lines.push(`  ${lineB}`)
      if (item.glossIt) {
        lines.push(`  gloss: ${item.glossIt}`)
      }
      if (item.tone) {
        lines.push(`  tone: ${item.tone}`)
      }
      if (item.newTerms.length > 0) {
        lines.push(`  termini: ${item.newTerms.join(', ')}`)
      }
    }

    this.civDialoguesList.textContent = lines.length > 0 ? lines.join('\n') : 'no dialogues'
  }

  private renderCivChart(metrics: readonly CivMetricsPoint[], factions: readonly FactionSummary[]): void {
    const ctx = this.civChartCanvas.getContext('2d')
    if (!ctx) return

    const w = this.civChartCanvas.width
    const h = this.civChartCanvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(0, 0, w, h)

    if (metrics.length < 2) {
      this.civStatsLine.textContent = 'conflict=0 spirituality=0'
      return
    }

    const last = metrics[metrics.length - 1]
    if (!last) return

    this.civStatsLine.textContent = `conflict=${last.conflictIndex.toFixed(2)} spirituality=${last.spiritualityAverage.toFixed(2)}`

    const topFactionIds = factions
      .slice(0, 5)
      .map((f) => f.id)

    let maxPop = 1
    for (let i = 0; i < metrics.length; i++) {
      const point = metrics[i]
      if (!point) continue
      for (let j = 0; j < topFactionIds.length; j++) {
        maxPop = Math.max(maxPop, point.populations[topFactionIds[j]!] ?? 0)
      }
    }

    const left = 24
    const right = w - 8
    const top = 8
    const bottom = h - 18
    const plotW = Math.max(1, right - left)
    const plotH = Math.max(1, bottom - top)

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.beginPath()
    ctx.moveTo(left, top)
    ctx.lineTo(left, bottom)
    ctx.lineTo(right, bottom)
    ctx.stroke()

    for (let f = 0; f < topFactionIds.length; f++) {
      const factionId = topFactionIds[f]!
      ctx.strokeStyle = hashColor(factionId)
      ctx.lineWidth = 1.5
      ctx.beginPath()

      for (let i = 0; i < metrics.length; i++) {
        const point = metrics[i]
        if (!point) continue
        const x = left + (i / (metrics.length - 1)) * plotW
        const y = bottom - ((point.populations[factionId] ?? 0) / maxPop) * plotH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.fillText(String(maxPop), 2, top + 8)
    ctx.fillText('0', 10, bottom)
  }

  private renderAgentInspector(agent: AgentInspectorData | null): void {
    if (!agent) {
      this.agentInspectorPre.textContent = 'Clicca un agente nella scena per vedere i dettagli.'
      return
    }

    this.agentInspectorPre.textContent = [
      `id: ${agent.agentId}`,
      `nome: ${agent.name}`,
      `fazione: ${agent.factionName} (${agent.factionId})`,
      `ruolo: ${agent.role}`,
      `goal: ${agent.goal}`,
      `eta: ${agent.age.toFixed(1)}`,
      `energia: ${agent.energy.toFixed(1)}`,
      `posizione: (${agent.x}, ${agent.y})`,
      `inventario: food=${agent.inventory.food.toFixed(1)} wood=${agent.inventory.wood.toFixed(1)} stone=${agent.inventory.stone.toFixed(1)} ore=${agent.inventory.ore.toFixed(1)}`,
      `relazioni note: ${agent.relationsCount}`,
      `utterance tokens: ${agent.lastUtteranceTokens.join(' ') || '-'}`,
      `utterance gloss: ${agent.lastUtteranceGloss ?? '-'}`,
      '',
      `bio narrativa: ${agent.narrativeBio ?? 'on-demand non ancora generata'}`,
    ].join('\n')
  }
}

export type { OverlayMode }
