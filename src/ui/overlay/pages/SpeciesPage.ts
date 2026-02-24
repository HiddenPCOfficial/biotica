import { createLineChart, destroyChart, type ChartLike, updateRollingDataset } from '../charts/ChartFactory'
import { TileId } from '../../../game/enums/TileId'
import type { DataPoint, OverlayActionHandler, OverlayPage, SimulationSnapshot, TopSpeciesItem } from '../types'

type SpeciesFilter = 'all' | 'top' | 'endangered' | 'newborn' | 'intelligent'
type ChartKind = 'population' | 'energy'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function dietLabel(value: 0 | 1 | 2): string {
  if (value === 1) return 'predator'
  if (value === 2) return 'omnivore'
  return 'herbivore'
}

function biomeLabel(value: number): string {
  return TileId[value] ?? `Tile-${value}`
}

/**
 * Tab analisi specie con tabella, filtri, cognizione e stream pensieri/dialoghi.
 */
export class SpeciesPage implements OverlayPage {
  readonly id = 'species' as const
  readonly title = 'Species'
  readonly root = document.createElement('section')

  private readonly filterSelect = document.createElement('select')
  private readonly table = document.createElement('table')
  private readonly tableBody = document.createElement('tbody')

  private readonly selectedLabel = document.createElement('div')
  private readonly cognitionBadge = document.createElement('div')
  private readonly chartClickHint = document.createElement('div')
  private readonly traitsBox = document.createElement('div')
  private readonly lineageBox = document.createElement('div')
  private readonly linksBox = document.createElement('div')
  private readonly filterCivBtn = document.createElement('button')
  private readonly thoughtBox = document.createElement('div')
  private readonly dialogueBox = document.createElement('div')
  private readonly popChartCanvas = document.createElement('canvas')
  private readonly energyChartCanvas = document.createElement('canvas')

  private popChart: ChartLike | null = null
  private energyChart: ChartLike | null = null

  private selectedSpeciesId: string | null = null
  private lastSnapshot: SimulationSnapshot | null = null

  constructor(private readonly emitAction: OverlayActionHandler) {
    this.root.className = 'bi-ov-page bi-ov-grid'

    const topCard = document.createElement('article')
    topCard.className = 'bi-ov-card'

    const controls = document.createElement('div')
    controls.className = 'bi-ov-controls-row'

    const filterLabel = document.createElement('span')
    filterLabel.className = 'bi-ov-inline-stat'
    filterLabel.textContent = 'Filter:'

    this.filterSelect.className = 'bi-ov-select'
    this.filterSelect.innerHTML = [
      '<option value="all">All</option>',
      '<option value="top">Top Population</option>',
      '<option value="endangered">Endangered</option>',
      '<option value="newborn">Newborn Species</option>',
      '<option value="intelligent">Intelligent Species</option>',
    ].join('')

    controls.append(filterLabel, this.filterSelect)

    const tableWrap = document.createElement('div')
    tableWrap.className = 'bi-ov-table-wrap bi-ov-scroll'

    this.table.className = 'bi-ov-table'
    const head = document.createElement('thead')
    head.innerHTML = '<tr><th>Species</th><th>Population</th><th>Mind</th><th>Language</th></tr>'
    this.table.append(head, this.tableBody)
    tableWrap.appendChild(this.table)

    topCard.append(this.createTitle('Species Table'), controls, tableWrap)

    const bottomSplit = document.createElement('div')
    bottomSplit.className = 'bi-ov-split'

    const popCard = document.createElement('article')
    popCard.className = 'bi-ov-card bi-ov-species-focus-card'
    popCard.append(this.createTitle('Selected Species Population'))
    this.selectedLabel.className = 'bi-ov-inline-stat'
    this.selectedLabel.innerHTML = '<strong>None</strong>'
    this.cognitionBadge.className = 'bi-ov-chip bi-ov-species-badge'
    this.cognitionBadge.textContent = 'mind: -'
    popCard.append(this.selectedLabel, this.cognitionBadge)

    const popWrap = document.createElement('div')
    popWrap.className = 'bi-ov-chart-wrap'
    this.popChartCanvas.className = 'bi-ov-chart bi-ov-chart-clickable'
    this.popChartCanvas.title = 'Click to inspect a population point'
    popWrap.appendChild(this.popChartCanvas)
    popCard.appendChild(popWrap)

    this.chartClickHint.className = 'bi-ov-inline-stat bi-ov-species-chart-hint'
    this.chartClickHint.textContent = 'Click a chart point to inspect tick/value.'
    popCard.appendChild(this.chartClickHint)

    const energyCard = document.createElement('article')
    energyCard.className = 'bi-ov-card bi-ov-species-detail-card'
    energyCard.append(this.createTitle('Species Details / Mindstream'))

    const energyWrap = document.createElement('div')
    energyWrap.className = 'bi-ov-chart-wrap'
    this.energyChartCanvas.className = 'bi-ov-chart bi-ov-chart-clickable'
    this.energyChartCanvas.title = 'Click to inspect an energy point'
    energyWrap.appendChild(this.energyChartCanvas)

    this.traitsBox.className = 'bi-ov-text-block bi-ov-muted'
    this.traitsBox.textContent = 'Select a species to inspect details.'
    this.lineageBox.className = 'bi-ov-text-block bi-ov-muted'
    this.lineageBox.textContent = 'Lineage: -'
    this.linksBox.className = 'bi-ov-text-block bi-ov-muted'
    this.linksBox.textContent = 'Linked civilizations: -'
    this.filterCivBtn.type = 'button'
    this.filterCivBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
    this.filterCivBtn.textContent = 'Filter Civilizations By Species'
    this.filterCivBtn.disabled = true
    this.filterCivBtn.addEventListener('click', () => {
      if (!this.selectedSpeciesId) {
        return
      }
      this.emitAction('filterCivBySpecies', { speciesId: this.selectedSpeciesId })
      this.emitAction('setTab', { tab: 'civilizations' })
    })
    this.thoughtBox.className = 'bi-ov-text-block bi-ov-species-mind'
    this.thoughtBox.textContent = 'Thoughts: -'
    this.dialogueBox.className = 'bi-ov-text-block bi-ov-species-dialogues'
    this.dialogueBox.textContent = 'Dialogues: -'

    energyCard.append(
      energyWrap,
      this.traitsBox,
      this.lineageBox,
      this.linksBox,
      this.filterCivBtn,
      this.createSubTitle('Thoughts'),
      this.thoughtBox,
      this.createSubTitle('Dialogues'),
      this.dialogueBox,
    )

    bottomSplit.append(popCard, energyCard)

    this.root.append(topCard, bottomSplit)

    this.filterSelect.addEventListener('change', () => {
      this.selectedSpeciesId = null
      this.chartClickHint.textContent = 'Click a chart point to inspect tick/value.'
    })

    this.popChartCanvas.addEventListener('click', (event) => {
      this.handleChartClick('population', this.popChartCanvas, event)
    })
    this.energyChartCanvas.addEventListener('click', (event) => {
      this.handleChartClick('energy', this.energyChartCanvas, event)
    })

    this.popChart = createLineChart(this.popChartCanvas, {
      title: 'Population',
      yMin: 0,
    })
    this.energyChart = createLineChart(this.energyChartCanvas, {
      title: 'Average Energy',
      yMin: 0,
    })
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-active', visible)
  }

  update(snapshot: SimulationSnapshot): void {
    this.lastSnapshot = snapshot
    const rows = this.filterRows(snapshot)

    if (!this.selectedSpeciesId || !rows.some((row) => row.speciesId === this.selectedSpeciesId)) {
      this.selectedSpeciesId = rows[0]?.speciesId ?? null
    }

    this.renderTableRows(rows)

    if (!this.selectedSpeciesId) {
      this.root.classList.remove('bi-ov-species-intelligent')
      this.selectedLabel.innerHTML = '<strong>None</strong>'
      this.cognitionBadge.textContent = 'mind: -'
      this.traitsBox.textContent = 'No species in current filter.'
      this.lineageBox.textContent = 'Lineage: -'
      this.linksBox.textContent = 'Linked civilizations: -'
      this.filterCivBtn.disabled = true
      this.thoughtBox.textContent = 'Thoughts: -'
      this.dialogueBox.textContent = 'Dialogues: -'
      updateRollingDataset(this.popChart!, [], 300)
      updateRollingDataset(this.energyChart!, [], 300)
      return
    }

    const selected = snapshot.population.speciesRows.find((row) => row.speciesId === this.selectedSpeciesId)
    if (!selected) {
      return
    }

    this.root.classList.toggle('bi-ov-species-intelligent', selected.isIntelligent)
    this.selectedLabel.innerHTML = `<strong>${selected.commonName}</strong> · pop ${selected.population} · ${selected.cognitionStage}`
    this.cognitionBadge.textContent = [
      `mind ${selected.intelligence.toFixed(3)}`,
      `lang ${selected.languageLevel.toFixed(3)}`,
      selected.isIntelligent ? 'intelligent' : 'not-intelligent',
    ].join(' · ')

    this.traitsBox.textContent = [
      `commonName: ${selected.commonName}`,
      `speciesId: ${selected.speciesId}`,
      `createdAtTick: ${selected.createdAtTick}`,
      `firstIntelligentTick: ${selected.firstIntelligentTick ?? '-'}`,
      `cognitionStage: ${selected.cognitionStage}`,
      `socialComplexity: ${selected.socialComplexity.toFixed(3)}`,
      `eventPressure: ${selected.eventPressure.toFixed(3)}`,
      `diet: ${dietLabel(selected.dietType)} · size: ${selected.sizeClass} · habitat: ${selected.habitatHint}`,
      `allowedBiomes: ${selected.allowedBiomes.map((biome) => biomeLabel(biome)).join(', ') || '-'}`,
      `traits: ${selected.traits.join(', ') || '-'}`,
      `vitality: ${selected.vitality.toFixed(2)}`,
      `avgHealth: ${selected.avgHealth.toFixed(2)}`,
      `avgHydration: ${selected.avgHydration.toFixed(2)}`,
      `avgWaterNeed: ${selected.avgWaterNeed.toFixed(3)}`,
      `avgAge: ${selected.avgAge.toFixed(2)} · avgGeneration: ${selected.avgGeneration.toFixed(2)}`,
      `avgStress(temp/humidity): ${selected.avgTempStress.toFixed(3)} / ${selected.avgHumidityStress.toFixed(3)}`,
      `avgTraits: ${selected.avgTraits}`,
      `avgEnergy: ${selected.avgEnergy.toFixed(2)}`,
    ].join('\n')
    this.lineageBox.textContent = `Lineage: ${this.formatLineage(selected.lineageNames)}`
    this.linksBox.textContent = [
      `civilizations: ${selected.civilizationNames.join(', ') || '-'}`,
      `ethnicities: ${selected.ethnicityNames.join(', ') || '-'}`,
    ].join('\n')
    this.filterCivBtn.disabled = selected.civilizationIds.length === 0

    this.thoughtBox.textContent = selected.thoughtSamples.length > 0
      ? selected.thoughtSamples.slice(-14).join('\n')
      : selected.isIntelligent
        ? 'No thoughts sampled yet.'
        : 'The species is still in primate cognitive phases.'

    this.dialogueBox.textContent = selected.dialogueSamples.length > 0
      ? selected.dialogueSamples.slice(-14).join('\n')
      : selected.languageLevel >= 0.28
        ? 'No dialogue sampled yet.'
        : 'No articulated language yet.'

    const populationHistory = snapshot.population.speciesPopulationHistory[selected.speciesId] ?? []
    const energyHistory = snapshot.population.speciesEnergyHistory[selected.speciesId] ?? []

    updateRollingDataset(
      this.popChart!,
      [
        {
          label: `${selected.commonName} pop`,
          color: selected.color,
          points: populationHistory,
        },
      ],
      300,
    )

    updateRollingDataset(
      this.energyChart!,
      [
        {
          label: `${selected.commonName} energy`,
          color: selected.color,
          points: energyHistory,
        },
      ],
      300,
    )
  }

  destroy(): void {
    destroyChart(this.popChart)
    destroyChart(this.energyChart)
    this.popChart = null
    this.energyChart = null
    this.root.remove()
  }

  private filterRows(snapshot: SimulationSnapshot): TopSpeciesItem[] {
    const all = [...snapshot.population.speciesRows].sort((a, b) => b.population - a.population)
    const filter = this.filterSelect.value as SpeciesFilter

    if (filter === 'top') {
      return all.slice(0, 16)
    }
    if (filter === 'endangered') {
      return all.filter((row) => row.population > 0 && row.population <= 5)
    }
    if (filter === 'newborn') {
      const cutoff = snapshot.tick - 4500
      return all.filter((row) => row.createdAtTick >= cutoff)
    }
    if (filter === 'intelligent') {
      return all.filter((row) => row.isIntelligent || row.languageLevel >= 0.22)
    }
    return all
  }

  private renderTableRows(rows: TopSpeciesItem[]): void {
    this.tableBody.innerHTML = ''

    if (rows.length === 0) {
      const tr = document.createElement('tr')
      const td = document.createElement('td')
      td.colSpan = 4
      td.textContent = 'No species for current filter.'
      tr.appendChild(td)
      this.tableBody.appendChild(tr)
      return
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue

      const tr = document.createElement('tr')
      tr.classList.add('bi-ov-species-row')
      if (row.speciesId === this.selectedSpeciesId) {
        tr.classList.add('is-selected')
      }
      if (row.isIntelligent) {
        tr.classList.add('is-intelligent')
      }
      tr.innerHTML = [
        `<td>${this.speciesCellHtml(row.commonName, row.color)}</td>`,
        `<td>${row.population}</td>`,
        `<td>${row.isIntelligent ? 'Awake' : row.cognitionStage}</td>`,
        `<td>${Math.round(row.languageLevel * 100)}%</td>`,
      ].join('')

      tr.addEventListener('click', () => {
        this.selectedSpeciesId = row.speciesId
      })

      this.tableBody.appendChild(tr)
    }
  }

  private handleChartClick(kind: ChartKind, canvas: HTMLCanvasElement, event: MouseEvent): void {
    const snapshot = this.lastSnapshot
    if (!snapshot || !this.selectedSpeciesId) {
      return
    }

    const points = this.getSeries(kind, snapshot, this.selectedSpeciesId)
    if (points.length === 0) {
      this.chartClickHint.textContent = 'No points available for selected species.'
      return
    }

    const rect = canvas.getBoundingClientRect()
    const xRatio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1)
    const index = clamp(Math.round(xRatio * (points.length - 1)), 0, points.length - 1)
    const point = points[index]
    if (!point) {
      return
    }

    const metricLabel = kind === 'population' ? 'population' : 'avgEnergy'
    this.chartClickHint.textContent = `Selected ${metricLabel}: tick=${point.tick}, value=${point.value.toFixed(2)}`
  }

  private getSeries(kind: ChartKind, snapshot: SimulationSnapshot, speciesId: string): DataPoint[] {
    if (kind === 'population') {
      return snapshot.population.speciesPopulationHistory[speciesId] ?? []
    }
    return snapshot.population.speciesEnergyHistory[speciesId] ?? []
  }

  private speciesCellHtml(commonName: string, color: string): string {
    const safeName = commonName || 'Unnamed Species'
    const safeColor = color || '#9cb7e4'
    return `<span class="bi-ov-swatch" style="background:${safeColor}"></span><span>${safeName}</span>`
  }

  private formatLineage(names: readonly string[]): string {
    if (!names || names.length === 0) {
      return '-'
    }
    return names.join(' -> ')
  }

  private createTitle(text: string): HTMLElement {
    const title = document.createElement('h3')
    title.className = 'bi-ov-card-title'
    title.textContent = text
    return title
  }

  private createSubTitle(text: string): HTMLElement {
    const title = document.createElement('h4')
    title.className = 'bi-ov-card-title'
    title.textContent = text
    return title
  }
}
