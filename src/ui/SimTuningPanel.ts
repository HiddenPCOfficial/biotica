import type { SimTuning, SimTuningKey } from '../sim/SimTuning'
import { clampTuningValue } from '../sim/SimTuning'

type SliderDef = {
  key: SimTuningKey
  label: string
  min: number
  max: number
  step: number
}

const SLIDERS: SliderDef[] = [
  { key: 'plantBaseGrowth', label: 'Plant Growth', min: 0, max: 6, step: 0.05 },
  { key: 'plantMaxBiomass', label: 'Plant Max', min: 20, max: 255, step: 1 },
  { key: 'plantDecay', label: 'Plant Decay', min: 0, max: 5, step: 0.01 },
  { key: 'baseMetabolism', label: 'Metabolism', min: 0.2, max: 3.2, step: 0.01 },
  { key: 'reproductionThreshold', label: 'Repro Threshold', min: 0.5, max: 2.5, step: 0.01 },
  { key: 'reproductionCost', label: 'Repro Cost', min: 0.4, max: 2.5, step: 0.01 },
  { key: 'mutationRate', label: 'Mutation Rate', min: 0, max: 0.25, step: 0.001 },
  { key: 'eventRate', label: 'Event Rate', min: 0, max: 4, step: 0.01 },
  { key: 'simulationSpeed', label: 'Sim Speed', min: 0.1, max: 8, step: 0.01 },
]

/**
 * Overlay UI per tuning live della simulazione.
 */
export class SimTuningPanel {
  readonly root = document.createElement('aside')

  private readonly valueElByKey = new Map<SimTuningKey, HTMLSpanElement>()
  private readonly inputByKey = new Map<SimTuningKey, HTMLInputElement>()
  private model: SimTuning

  constructor(
    initial: SimTuning,
    private readonly onChange: (patch: Partial<SimTuning>, next: SimTuning) => void,
    parent: HTMLElement = document.body,
  ) {
    this.model = { ...initial }

    this.root.className = 'sim-tuning-panel'
    this.root.style.position = 'fixed'
    this.root.style.left = '12px'
    this.root.style.bottom = '12px'
    this.root.style.width = '320px'
    this.root.style.maxHeight = 'calc(100vh - 24px)'
    this.root.style.overflow = 'auto'
    this.root.style.padding = '10px'
    this.root.style.borderRadius = '10px'
    this.root.style.border = '1px solid rgba(255,255,255,0.18)'
    this.root.style.background = 'rgba(9, 13, 19, 0.9)'
    this.root.style.color = '#e7f0ff'
    this.root.style.zIndex = '55'
    this.root.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace'
    this.root.style.fontSize = '12px'

    const title = document.createElement('h3')
    title.textContent = 'Simulation Tuning'
    title.style.margin = '0 0 8px 0'
    title.style.fontSize = '13px'
    this.root.appendChild(title)

    for (let i = 0; i < SLIDERS.length; i++) {
      const slider = SLIDERS[i]
      if (!slider) continue
      this.root.appendChild(this.createSliderRow(slider))
    }

    parent.appendChild(this.root)
  }

  destroy(): void {
    this.root.remove()
  }

  setModel(next: SimTuning): void {
    this.model = { ...next }
    for (let i = 0; i < SLIDERS.length; i++) {
      const slider = SLIDERS[i]
      if (!slider) continue
      const input = this.inputByKey.get(slider.key)
      const valueEl = this.valueElByKey.get(slider.key)
      if (!input || !valueEl) continue
      input.value = String(this.model[slider.key])
      valueEl.textContent = this.formatValue(slider.key, this.model[slider.key])
    }
  }

  private createSliderRow(def: SliderDef): HTMLElement {
    const row = document.createElement('div')
    row.style.marginBottom = '8px'

    const top = document.createElement('div')
    top.style.display = 'flex'
    top.style.justifyContent = 'space-between'
    top.style.marginBottom = '2px'

    const label = document.createElement('label')
    label.textContent = def.label

    const value = document.createElement('span')
    value.textContent = this.formatValue(def.key, this.model[def.key])

    top.appendChild(label)
    top.appendChild(value)

    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(def.min)
    input.max = String(def.max)
    input.step = String(def.step)
    input.value = String(this.model[def.key])
    input.style.width = '100%'

    input.oninput = () => {
      const raw = Number(input.value)
      const v = clampTuningValue(def.key, raw)
      const patch = { [def.key]: v } as Partial<SimTuning>
      const next = { ...this.model, ...patch }
      this.model = next
      value.textContent = this.formatValue(def.key, v)
      this.onChange(patch, next)
    }

    this.inputByKey.set(def.key, input)
    this.valueElByKey.set(def.key, value)

    row.appendChild(top)
    row.appendChild(input)
    return row
  }

  private formatValue(key: SimTuningKey, value: number): string {
    if (key === 'plantMaxBiomass') {
      return String(Math.round(value))
    }
    if (key === 'mutationRate') {
      return value.toFixed(3)
    }
    return value.toFixed(2)
  }
}
