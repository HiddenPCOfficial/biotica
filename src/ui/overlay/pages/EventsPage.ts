import { createLineChart, destroyChart, type ChartLike, updateRollingDataset } from '../charts/ChartFactory'
import type { EventCard, OverlayPage, SimulationSnapshot } from '../types'

function renderEventLine(event: EventCard): string {
  const intensity = Number.isFinite(event.intensity) ? `i=${event.intensity.toFixed(2)} ` : ''
  return `${event.type} ${intensity}rem=${event.remainingTicks} @(${event.x}, ${event.y})`
}

/**
 * Tab eventi attivi/recenti con timeline.
 */
export class EventsPage implements OverlayPage {
  readonly id = 'events' as const
  readonly title = 'Events'
  readonly root = document.createElement('section')

  private readonly activeList = document.createElement('ul')
  private readonly recentList = document.createElement('ul')
  private readonly chartCanvas = document.createElement('canvas')
  private eventsChart: ChartLike | null = null

  constructor() {
    this.root.className = 'bi-ov-page bi-ov-grid'

    const split = document.createElement('div')
    split.className = 'bi-ov-split'

    const activeCard = document.createElement('article')
    activeCard.className = 'bi-ov-card'
    activeCard.append(this.createTitle('Active Events'))
    this.activeList.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll'
    activeCard.appendChild(this.activeList)

    const recentCard = document.createElement('article')
    recentCard.className = 'bi-ov-card'
    recentCard.append(this.createTitle('Recent Timeline'))
    this.recentList.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll'
    recentCard.appendChild(this.recentList)

    split.append(activeCard, recentCard)

    const chartCard = document.createElement('article')
    chartCard.className = 'bi-ov-card'
    chartCard.append(this.createTitle('Events / minute'))

    const chartWrap = document.createElement('div')
    chartWrap.className = 'bi-ov-chart-wrap'
    this.chartCanvas.className = 'bi-ov-chart'
    chartWrap.appendChild(this.chartCanvas)
    chartCard.appendChild(chartWrap)

    this.root.append(split, chartCard)

    this.eventsChart = createLineChart(this.chartCanvas, {
      title: 'Event Frequency',
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
    this.activeList.innerHTML = ''
    this.recentList.innerHTML = ''

    const active = snapshot.events.activeEvents
    const recent = snapshot.events.recentEvents

    if (active.length === 0) {
      const item = document.createElement('li')
      item.className = 'bi-ov-list-item'
      item.textContent = 'No active events.'
      this.activeList.appendChild(item)
    } else {
      for (let i = 0; i < active.length; i++) {
        const event = active[i]
        if (!event) continue
        const item = document.createElement('li')
        item.className = 'bi-ov-list-item'
        item.textContent = renderEventLine(event)
        this.activeList.appendChild(item)
      }
    }

    const recentStart = Math.max(0, recent.length - 80)
    if (recent.length === 0) {
      const item = document.createElement('li')
      item.className = 'bi-ov-list-item'
      item.textContent = 'No recent events.'
      this.recentList.appendChild(item)
    } else {
      for (let i = recentStart; i < recent.length; i++) {
        const event = recent[i]
        if (!event) continue
        const item = document.createElement('li')
        item.className = 'bi-ov-list-item'
        item.textContent = `[t${event.tick}] ${renderEventLine(event)}`
        this.recentList.appendChild(item)
      }
    }

    updateRollingDataset(
      this.eventsChart!,
      [
        {
          label: 'Events/min',
          color: '#ff9d66',
          points: snapshot.events.eventsPerMinuteSeries,
        },
      ],
      300,
    )
  }

  destroy(): void {
    destroyChart(this.eventsChart)
    this.eventsChart = null
    this.root.remove()
  }

  private createTitle(text: string): HTMLElement {
    const title = document.createElement('h3')
    title.className = 'bi-ov-card-title'
    title.textContent = text
    return title
  }
}
