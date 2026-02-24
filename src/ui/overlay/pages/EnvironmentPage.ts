import { createLineChart, destroyChart, type ChartLike, updateRollingDataset } from '../charts/ChartFactory'
import type {
  OverlayActionHandler,
  OverlayPage,
  OverlayToggleType,
  SimulationSnapshot,
} from '../types'

type SliderDef = {
  key: string
  label: string
  min: number
  max: number
  step: number
}

const OVERLAY_DEFS: Array<{ type: OverlayToggleType; label: string }> = [
  { type: 'temperature', label: 'Temperature Overlay' },
  { type: 'humidity', label: 'Humidity Overlay' },
  { type: 'fertility', label: 'Fertility Overlay' },
  { type: 'hazard', label: 'Hazard Overlay' },
  { type: 'biomes', label: 'Biomes Overlay' },
]

const TUNING_SLIDERS: SliderDef[] = [
  { key: 'plantBaseGrowth', label: 'Plant Growth', min: 0, max: 6, step: 0.05 },
  { key: 'plantDecay', label: 'Plant Decay', min: 0, max: 5, step: 0.01 },
  { key: 'eventRate', label: 'Event Rate', min: 0, max: 4, step: 0.01 },
  { key: 'baseMetabolism', label: 'Base Metabolism', min: 0.2, max: 3.2, step: 0.01 },
  { key: 'reproductionThreshold', label: 'Repro Threshold', min: 0.5, max: 2.5, step: 0.01 },
  { key: 'reproductionCost', label: 'Repro Cost', min: 0.4, max: 2.5, step: 0.01 },
  { key: 'mutationRate', label: 'Mutation Rate', min: 0, max: 0.25, step: 0.001 },
  { key: 'simulationSpeed', label: 'Simulation Speed', min: 0.25, max: 10, step: 0.01 },
]

/**
 * Tab stato ambiente + controlli overlay/tuning.
 */
export class EnvironmentPage implements OverlayPage {
  readonly id = 'environment' as const
  readonly title = 'Environment'
  readonly root = document.createElement('section')

  private readonly avgTempValue = document.createElement('div')
  private readonly avgHumidityValue = document.createElement('div')
  private readonly avgFertilityValue = document.createElement('div')
  private readonly avgHazardValue = document.createElement('div')

  private readonly chartCanvas = document.createElement('canvas')
  private envChart: ChartLike | null = null

  private readonly toggleInputs = new Map<OverlayToggleType, HTMLInputElement>()
  private readonly sliderInputs = new Map<string, HTMLInputElement>()
  private readonly sliderValues = new Map<string, HTMLSpanElement>()
  private readonly sliderTimers = new Map<string, number>()

  constructor(private readonly emitAction: OverlayActionHandler) {
    this.root.className = 'bi-ov-page bi-ov-grid'

    const kpiGrid = document.createElement('div')
    kpiGrid.className = 'bi-ov-grid bi-ov-grid-cards'
    kpiGrid.append(
      this.createKpiCard('Avg Temperature', this.avgTempValue),
      this.createKpiCard('Avg Humidity', this.avgHumidityValue),
      this.createKpiCard('Avg Fertility', this.avgFertilityValue),
      this.createKpiCard('Avg Hazard', this.avgHazardValue),
    )

    const chartCard = document.createElement('article')
    chartCard.className = 'bi-ov-card'
    chartCard.append(this.createTitle('Climate Trend'))

    const chartWrap = document.createElement('div')
    chartWrap.className = 'bi-ov-chart-wrap'
    this.chartCanvas.className = 'bi-ov-chart'
    chartWrap.appendChild(this.chartCanvas)
    chartCard.appendChild(chartWrap)

    const split = document.createElement('div')
    split.className = 'bi-ov-split'

    const toggleCard = document.createElement('article')
    toggleCard.className = 'bi-ov-card'
    toggleCard.append(this.createTitle('Overlay Toggles'))

    const toggleGrid = document.createElement('div')
    toggleGrid.className = 'bi-ov-toggle-grid'
    for (let i = 0; i < OVERLAY_DEFS.length; i++) {
      const def = OVERLAY_DEFS[i]
      if (!def) continue

      const label = document.createElement('label')
      label.className = 'bi-ov-toggle'

      const input = document.createElement('input')
      input.type = 'checkbox'
      input.addEventListener('change', () => {
        this.emitAction('toggleOverlay', {
          type: def.type,
          enabled: input.checked,
        })
      })

      const text = document.createElement('span')
      text.textContent = def.label

      this.toggleInputs.set(def.type, input)
      label.append(input, text)
      toggleGrid.appendChild(label)
    }

    toggleCard.appendChild(toggleGrid)

    const tuningCard = document.createElement('article')
    tuningCard.className = 'bi-ov-card bi-ov-scroll'
    tuningCard.append(this.createTitle('Sim Tuning'))

    const tuningWrap = document.createElement('div')
    for (let i = 0; i < TUNING_SLIDERS.length; i++) {
      const slider = TUNING_SLIDERS[i]
      if (!slider) continue
      tuningWrap.appendChild(this.createSliderRow(slider))
    }

    tuningCard.appendChild(tuningWrap)

    split.append(toggleCard, tuningCard)

    this.root.append(kpiGrid, chartCard, split)

    this.envChart = createLineChart(this.chartCanvas, {
      title: 'Avg Temp/Humidity/Fertility/Hazard',
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
    const env = snapshot.environment

    this.avgTempValue.textContent = env.avgTemp.toFixed(3)
    this.avgHumidityValue.textContent = env.avgHumidity.toFixed(3)
    this.avgFertilityValue.textContent = env.avgFertility.toFixed(3)
    this.avgHazardValue.textContent = env.avgHazard.toFixed(3)

    updateRollingDataset(
      this.envChart!,
      [
        { label: 'Temp', color: '#ff9a6a', points: env.tempSeries },
        { label: 'Humidity', color: '#72b9ff', points: env.humiditySeries },
        { label: 'Fertility', color: '#66d98d', points: env.fertilitySeries },
        { label: 'Hazard', color: '#ff6d72', points: env.hazardSeries },
      ],
      300,
    )

    for (let i = 0; i < OVERLAY_DEFS.length; i++) {
      const def = OVERLAY_DEFS[i]
      if (!def) continue
      const input = this.toggleInputs.get(def.type)
      if (!input) continue
      input.checked = Boolean(env.overlayToggles[def.type])
    }

    for (let i = 0; i < TUNING_SLIDERS.length; i++) {
      const def = TUNING_SLIDERS[i]
      if (!def) continue
      const value = env.tuning[def.key]
      if (typeof value !== 'number') continue

      const input = this.sliderInputs.get(def.key)
      const valueLabel = this.sliderValues.get(def.key)
      if (!input || !valueLabel) continue

      if (document.activeElement !== input) {
        input.value = String(value)
      }
      valueLabel.textContent = value.toFixed(def.step >= 1 ? 0 : def.step >= 0.01 ? 2 : 3)
    }
  }

  destroy(): void {
    destroyChart(this.envChart)
    this.envChart = null

    for (const timer of this.sliderTimers.values()) {
      window.clearTimeout(timer)
    }
    this.sliderTimers.clear()
    this.root.remove()
  }

  private createSliderRow(def: SliderDef): HTMLElement {
    const label = document.createElement('label')
    label.className = 'bi-ov-slider-label'
    label.textContent = def.label

    const value = document.createElement('span')
    value.className = 'bi-ov-slider-value'
    value.textContent = '--'

    const input = document.createElement('input')
    input.className = 'bi-ov-range'
    input.type = 'range'
    input.min = String(def.min)
    input.max = String(def.max)
    input.step = String(def.step)

    input.addEventListener('input', () => {
      const parsed = Number(input.value)
      value.textContent = parsed.toFixed(def.step >= 1 ? 0 : def.step >= 0.01 ? 2 : 3)

      const existing = this.sliderTimers.get(def.key)
      if (existing) {
        window.clearTimeout(existing)
      }
      const timer = window.setTimeout(() => {
        this.emitAction('setTuningParam', {
          name: def.key,
          value: parsed,
        })
      }, 120)
      this.sliderTimers.set(def.key, timer)
    })

    this.sliderInputs.set(def.key, input)
    this.sliderValues.set(def.key, value)

    const row = document.createElement('div')
    row.className = 'bi-ov-slider-row'
    row.append(label, value)

    const card = document.createElement('div')
    card.className = 'bi-ov-slider-card'
    card.append(row, input)
    return card
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

  private createTitle(text: string): HTMLElement {
    const title = document.createElement('h3')
    title.className = 'bi-ov-card-title'
    title.textContent = text
    return title
  }
}
