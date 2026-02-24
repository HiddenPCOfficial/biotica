import { createLineChart, destroyChart, type ChartLike, updateRollingDataset } from '../charts/ChartFactory'
import type { OverlayPage, SimulationSnapshot } from '../types'

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(Math.round(value))
}

function ensureListText(list: HTMLElement, text: string): void {
  if (list.childElementCount > 0) {
    return
  }
  const item = document.createElement('li')
  item.className = 'bi-ov-list-item'
  item.textContent = text
  list.appendChild(item)
}

/**
 * Tab panoramica globale del mondo.
 */
export class OverviewPage implements OverlayPage {
  readonly id = 'overview' as const
  readonly title = 'Overview'
  readonly root = document.createElement('section')

  private readonly totalCreaturesValue = document.createElement('div')
  private readonly biodiversityValue = document.createElement('div')
  private readonly biomassValue = document.createElement('div')
  private readonly birthsValue = document.createElement('div')
  private readonly deathsValue = document.createElement('div')
  private readonly eventsValue = document.createElement('div')

  private readonly totalChartCanvas = document.createElement('canvas')
  private readonly topSpeciesChartCanvas = document.createElement('canvas')
  private readonly alertsList = document.createElement('ul')

  private totalChart: ChartLike | null = null
  private topSpeciesChart: ChartLike | null = null

  constructor() {
    this.root.className = 'bi-ov-page bi-ov-grid'

    const cardsGrid = document.createElement('div')
    cardsGrid.className = 'bi-ov-grid bi-ov-grid-cards'
    cardsGrid.append(
      this.createKpiCard('Total Creatures', this.totalCreaturesValue),
      this.createKpiCard('Biodiversity', this.biodiversityValue),
      this.createKpiCard('Total Biomass', this.biomassValue),
      this.createKpiCard('Births / min', this.birthsValue),
      this.createKpiCard('Deaths / min', this.deathsValue),
      this.createKpiCard('Active Events', this.eventsValue),
    )

    const chartsGrid = document.createElement('div')
    chartsGrid.className = 'bi-ov-split'
    chartsGrid.append(
      this.createChartCard('Total Population Trend', this.totalChartCanvas),
      this.createChartCard('Top Species Trend', this.topSpeciesChartCanvas),
    )

    const alertsCard = document.createElement('article')
    alertsCard.className = 'bi-ov-card'
    const alertsTitle = document.createElement('h3')
    alertsTitle.className = 'bi-ov-card-title'
    alertsTitle.textContent = 'Alerts'

    this.alertsList.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll'
    alertsCard.append(alertsTitle, this.alertsList)

    this.root.append(cardsGrid, chartsGrid, alertsCard)

    this.totalChart = createLineChart(this.totalChartCanvas, {
      title: 'Total Population',
      stacked: false,
      yMin: 0,
    })
    this.topSpeciesChart = createLineChart(this.topSpeciesChartCanvas, {
      title: 'Top Species',
      stacked: false,
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
    const population = snapshot.population

    this.totalCreaturesValue.textContent = formatCompact(population.totalCreatures)
    this.biodiversityValue.textContent = `${population.biodiversity} · H=${population.shannonIndex.toFixed(2)}`
    this.biomassValue.textContent = formatCompact(population.totalBiomass)
    this.birthsValue.textContent = population.birthsPerMin.toFixed(1)
    this.deathsValue.textContent = population.deathsPerMin.toFixed(1)
    this.eventsValue.textContent = String(snapshot.events.activeEvents.length)

    updateRollingDataset(
      this.totalChart!,
      [
        {
          label: 'Population',
          color: '#7ec9ff',
          points: population.populationSeries,
        },
      ],
      300,
    )

    const topSpecies = population.topSpecies.slice(0, 5)
    const topSeries = topSpecies.map((species) => ({
      label: species.name,
      color: species.color,
      points: population.topSpeciesSeries.map((point) => ({
        tick: point.tick,
        value: point.values[species.speciesId] ?? 0,
      })),
    }))

    updateRollingDataset(this.topSpeciesChart!, topSeries, 300)

    this.alertsList.innerHTML = ''
    const alerts = population.alerts.slice(-12)
    for (let i = 0; i < alerts.length; i++) {
      const alert = alerts[i]
      if (!alert) continue
      const item = document.createElement('li')
      item.className = `bi-ov-list-item ${alert.severity}`
      item.textContent = `[t${alert.tick}] ${alert.message}`
      this.alertsList.appendChild(item)
    }
    ensureListText(this.alertsList, 'No alerts in current window.')
  }

  destroy(): void {
    destroyChart(this.totalChart)
    destroyChart(this.topSpeciesChart)
    this.totalChart = null
    this.topSpeciesChart = null
    this.root.remove()
  }

  private createKpiCard(title: string, valueEl: HTMLElement): HTMLElement {
    const card = document.createElement('article')
    card.className = 'bi-ov-card'

    const label = document.createElement('div')
    label.className = 'bi-ov-kpi-label'
    label.textContent = title

    valueEl.className = 'bi-ov-kpi-value'
    valueEl.textContent = '--'

    card.append(label, valueEl)
    return card
  }

  private createChartCard(title: string, canvas: HTMLCanvasElement): HTMLElement {
    const card = document.createElement('article')
    card.className = 'bi-ov-card'

    const cardTitle = document.createElement('h3')
    cardTitle.className = 'bi-ov-card-title'
    cardTitle.textContent = title

    const wrap = document.createElement('div')
    wrap.className = 'bi-ov-chart-wrap'

    canvas.className = 'bi-ov-chart'
    wrap.appendChild(canvas)

    card.append(cardTitle, wrap)
    return card
  }
}
