import { createLineChart, destroyChart, type ChartLike, updateRollingDataset } from '../charts/ChartFactory'
import type { OverlayPage, SimulationSnapshot } from '../types'

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4)
}

function scoreColor(score: number): string {
  if (score >= 0.75) return '#6adf9d'
  if (score >= 0.5) return '#8fc9ff'
  if (score >= 0.3) return '#ffd27a'
  return '#ff8f8f'
}

/**
 * Tab Genesis/Tuning: mostra risultato tuning NSGA-II.
 */
export class WorldGenesisPage implements OverlayPage {
  readonly id = 'worldGenesis' as const
  readonly title = 'Genesis/Tuning'
  readonly root = document.createElement('section')

  private readonly configList = document.createElement('ul')
  private readonly reasonList = document.createElement('div')
  private readonly scoreWrap = document.createElement('div')
  private readonly paretoTableBody = document.createElement('tbody')
  private readonly chartCanvas = document.createElement('canvas')
  private paretoChart: ChartLike | null = null

  constructor() {
    this.root.className = 'bi-ov-page bi-ov-genesis'

    const split = document.createElement('div')
    split.className = 'bi-ov-split'

    const leftCard = document.createElement('article')
    leftCard.className = 'bi-ov-card bi-ov-genesis-config'
    leftCard.append(this.createTitle('Best Config'))

    this.configList.className = 'bi-ov-list bi-ov-scroll bi-ov-genesis-list'
    leftCard.appendChild(this.configList)

    const rightCard = document.createElement('article')
    rightCard.className = 'bi-ov-card bi-ov-genesis-scores'
    rightCard.append(this.createTitle('Score Breakdown'))

    this.scoreWrap.className = 'bi-ov-grid bi-ov-grid-cards'
    rightCard.appendChild(this.scoreWrap)

    split.append(leftCard, rightCard)

    const reasonCard = document.createElement('article')
    reasonCard.className = 'bi-ov-card'
    reasonCard.append(this.createTitle('Reason Codes'))

    this.reasonList.className = 'bi-ov-ai-chat-prompts'
    reasonCard.appendChild(this.reasonList)

    const chartCard = document.createElement('article')
    chartCard.className = 'bi-ov-card'
    chartCard.append(this.createTitle('Pareto Front Sample'))

    const chartWrap = document.createElement('div')
    chartWrap.className = 'bi-ov-chart-wrap'
    this.chartCanvas.className = 'bi-ov-chart'
    chartWrap.appendChild(this.chartCanvas)
    chartCard.appendChild(chartWrap)

    const tableCard = document.createElement('article')
    tableCard.className = 'bi-ov-card'
    tableCard.append(this.createTitle('Pareto Candidates'))

    const tableWrap = document.createElement('div')
    tableWrap.className = 'bi-ov-table-wrap bi-ov-scroll'

    const table = document.createElement('table')
    table.className = 'bi-ov-table'
    table.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Rank</th>
          <th>Weighted</th>
          <th>Survival</th>
          <th>Biodiv</th>
          <th>Stability</th>
          <th>Resources</th>
          <th>Catastrophe</th>
        </tr>
      </thead>
    `
    table.appendChild(this.paretoTableBody)
    tableWrap.appendChild(table)
    tableCard.appendChild(tableWrap)

    this.root.append(split, reasonCard, chartCard, tableCard)

    this.paretoChart = createLineChart(this.chartCanvas, {
      title: 'Weighted score + objectives over Pareto sample',
      yMin: 0,
      yMax: 1,
    })
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-active', visible)
  }

  update(snapshot: SimulationSnapshot): void {
    const data = snapshot.worldGenesis
    if (!data) {
      this.renderEmptyState('World genesis report non disponibile. Esegui reset mondo per generare tuning.')
      return
    }

    this.renderConfig(data.bestConfig)
    this.renderScores(data.bestScores)
    this.renderReasonCodes(data.reasonCodes)
    this.renderParetoTable(data.paretoFrontSample)
    this.renderParetoChart(data.paretoFrontSample)
  }

  destroy(): void {
    destroyChart(this.paretoChart)
    this.paretoChart = null
    this.root.remove()
  }

  private renderEmptyState(message: string): void {
    this.configList.innerHTML = `<li class="bi-ov-list-item">${message}</li>`
    this.scoreWrap.innerHTML = `<article class="bi-ov-card"><div class="bi-ov-inline-stat">No scores</div></article>`
    this.reasonList.innerHTML = '<span class="bi-ov-chip">n/a</span>'
    this.paretoTableBody.innerHTML = '<tr><td colspan="8">No pareto samples</td></tr>'

    updateRollingDataset(this.paretoChart!, [], 50)
  }

  private renderConfig(config: Record<string, number>): void {
    this.configList.innerHTML = ''
    const entries = Object.entries(config).sort((a, b) => a[0].localeCompare(b[0]))
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i]!
      const li = document.createElement('li')
      li.className = 'bi-ov-list-item bi-ov-genesis-item'
      li.innerHTML = `<strong>${key}</strong><span>${formatValue(value)}</span>`
      this.configList.appendChild(li)
    }
  }

  private renderScores(scores: NonNullable<SimulationSnapshot['worldGenesis']>['bestScores']): void {
    this.scoreWrap.innerHTML = ''
    const entries = Object.entries(scores)
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i]!
      const card = document.createElement('article')
      card.className = 'bi-ov-card'
      card.innerHTML = `
        <div class="bi-ov-kpi-label">${key}</div>
        <div class="bi-ov-kpi-value" style="color:${scoreColor(value)}">${value.toFixed(3)}</div>
      `
      this.scoreWrap.appendChild(card)
    }
  }

  private renderReasonCodes(reasonCodes: readonly string[]): void {
    this.reasonList.innerHTML = ''
    if (reasonCodes.length === 0) {
      this.reasonList.innerHTML = '<span class="bi-ov-chip">NO_REASON_CODES</span>'
      return
    }

    for (let i = 0; i < reasonCodes.length; i++) {
      const code = reasonCodes[i]
      if (!code) continue
      const chip = document.createElement('span')
      chip.className = 'bi-ov-chip'
      chip.textContent = code
      this.reasonList.appendChild(chip)
    }
  }

  private renderParetoTable(rows: NonNullable<SimulationSnapshot['worldGenesis']>['paretoFrontSample']): void {
    this.paretoTableBody.innerHTML = ''
    if (rows.length === 0) {
      this.paretoTableBody.innerHTML = '<tr><td colspan="8">No pareto samples</td></tr>'
      return
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${row.id}</td>
        <td>${row.rank}</td>
        <td>${row.weightedScore.toFixed(3)}</td>
        <td>${row.scores.survivalScore.toFixed(3)}</td>
        <td>${row.scores.biodiversityScore.toFixed(3)}</td>
        <td>${row.scores.stabilityScore.toFixed(3)}</td>
        <td>${row.scores.resourceBalanceScore.toFixed(3)}</td>
        <td>${row.scores.catastropheTolerance.toFixed(3)}</td>
      `
      this.paretoTableBody.appendChild(tr)
    }
  }

  private renderParetoChart(rows: NonNullable<SimulationSnapshot['worldGenesis']>['paretoFrontSample']): void {
    if (!this.paretoChart) {
      return
    }

    const weightedPoints = rows.map((row, index) => ({ tick: index + 1, value: row.weightedScore }))
    const survivalPoints = rows.map((row, index) => ({ tick: index + 1, value: row.scores.survivalScore }))
    const stabilityPoints = rows.map((row, index) => ({ tick: index + 1, value: row.scores.stabilityScore }))

    updateRollingDataset(
      this.paretoChart,
      [
        { label: 'Weighted', color: '#7ec9ff', points: weightedPoints },
        { label: 'Survival', color: '#77e6ab', points: survivalPoints },
        { label: 'Stability', color: '#ffd27a', points: stabilityPoints },
      ],
      30,
    )
  }

  private createTitle(text: string): HTMLElement {
    const title = document.createElement('h3')
    title.className = 'bi-ov-card-title'
    title.textContent = text
    return title
  }
}
