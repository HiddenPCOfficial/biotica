import type { WorldPreset, WorldSize } from '../../../save/SaveTypes'

export type WorldCreateFormValue = {
  name: string
  seed: string
  preset: WorldPreset
  worldSize: WorldSize
  eventRate: number
  treeDensity: number
  volcanoCount: 0 | 1
  simulationSpeed: number
  enableGeneAgent: boolean
  enableCivs: boolean
  enablePredators: boolean
}

export type WorldCreateActions = {
  onCreate: (value: WorldCreateFormValue) => void
  onBack: () => void
}

const PRESET_DEFAULTS: Record<WorldPreset, Pick<WorldCreateFormValue, 'eventRate' | 'treeDensity' | 'simulationSpeed'>> = {
  Balanced: { eventRate: 1, treeDensity: 1.2, simulationSpeed: 1 },
  'Lush Forest': { eventRate: 0.9, treeDensity: 1.8, simulationSpeed: 1 },
  'Harsh Desert': { eventRate: 1.2, treeDensity: 0.45, simulationSpeed: 1 },
  Volcanic: { eventRate: 1.15, treeDensity: 0.8, simulationSpeed: 1 },
  'Ice Age': { eventRate: 1.05, treeDensity: 0.9, simulationSpeed: 1 },
}

function clamp01(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.max(min, Math.min(max, value))
}

export class WorldCreatePage {
  readonly root = document.createElement('section')

  private readonly nameInput = document.createElement('input')
  private readonly seedInput = document.createElement('input')
  private readonly presetSelect = document.createElement('select')
  private readonly sizeSelect = document.createElement('select')
  private readonly eventRateInput = document.createElement('input')
  private readonly treeDensityInput = document.createElement('input')
  private readonly volcanoInput = document.createElement('input')
  private readonly speedInput = document.createElement('input')

  private readonly eventRateValue = document.createElement('span')
  private readonly treeDensityValue = document.createElement('span')
  private readonly volcanoValue = document.createElement('span')
  private readonly speedValue = document.createElement('span')

  private readonly geneToggle = document.createElement('input')
  private readonly civToggle = document.createElement('input')
  private readonly predatorsToggle = document.createElement('input')

  private readonly createButton = document.createElement('button')

  constructor(private readonly actions: WorldCreateActions) {
    this.root.className = 'bi-menu-page bi-menu-create-page'

    const title = document.createElement('h1')
    title.className = 'bi-menu-title'
    title.textContent = 'Create New World'

    const subtitle = document.createElement('p')
    subtitle.className = 'bi-menu-subtitle'
    subtitle.textContent = 'Define seed, preset and simulation profile before genesis.'

    const grid = document.createElement('div')
    grid.className = 'bi-menu-form-grid'

    this.nameInput.className = 'bi-menu-input'
    this.nameInput.type = 'text'
    this.nameInput.maxLength = 48
    this.nameInput.value = `World-${new Date().toISOString().slice(0, 10)}`

    this.seedInput.className = 'bi-menu-input'
    this.seedInput.type = 'text'
    this.seedInput.value = `${Math.floor(Date.now() % 100000000)}`

    this.presetSelect.className = 'bi-menu-input'
    ;(['Balanced', 'Lush Forest', 'Harsh Desert', 'Volcanic', 'Ice Age'] as WorldPreset[]).forEach((preset) => {
      const option = document.createElement('option')
      option.value = preset
      option.textContent = preset
      this.presetSelect.appendChild(option)
    })
    this.presetSelect.value = 'Balanced'

    this.sizeSelect.className = 'bi-menu-input'
    ;(['S', 'M', 'L'] as WorldSize[]).forEach((size) => {
      const option = document.createElement('option')
      option.value = size
      option.textContent = size
      this.sizeSelect.appendChild(option)
    })
    this.sizeSelect.value = 'M'

    this.eventRateInput.type = 'range'
    this.eventRateInput.className = 'bi-menu-range'
    this.eventRateInput.min = '0.2'
    this.eventRateInput.max = '2.5'
    this.eventRateInput.step = '0.05'

    this.treeDensityInput.type = 'range'
    this.treeDensityInput.className = 'bi-menu-range'
    this.treeDensityInput.min = '0.25'
    this.treeDensityInput.max = '2.5'
    this.treeDensityInput.step = '0.05'

    this.volcanoInput.type = 'range'
    this.volcanoInput.className = 'bi-menu-range'
    this.volcanoInput.min = '0'
    this.volcanoInput.max = '1'
    this.volcanoInput.step = '1'

    this.speedInput.type = 'range'
    this.speedInput.className = 'bi-menu-range'
    this.speedInput.min = '0.25'
    this.speedInput.max = '4'
    this.speedInput.step = '0.25'

    this.geneToggle.type = 'checkbox'
    this.geneToggle.checked = true
    this.civToggle.type = 'checkbox'
    this.civToggle.checked = true
    this.predatorsToggle.type = 'checkbox'
    this.predatorsToggle.checked = true

    grid.append(
      this.createField('World Name', this.nameInput),
      this.createField('Seed', this.seedInput),
      this.createField('Preset', this.presetSelect),
      this.createField('World Size', this.sizeSelect),
      this.createRangeField('Event Rate', this.eventRateInput, this.eventRateValue),
      this.createRangeField('Tree Density', this.treeDensityInput, this.treeDensityValue),
      this.createRangeField('Volcano Count (max 1)', this.volcanoInput, this.volcanoValue),
      this.createRangeField('Simulation Speed', this.speedInput, this.speedValue),
      this.createToggleField('Enable Gene Agent (NSGA-II)', this.geneToggle),
      this.createToggleField('Enable Civilizations', this.civToggle),
      this.createToggleField('Enable Predators', this.predatorsToggle),
    )

    const actionsRow = document.createElement('div')
    actionsRow.className = 'bi-menu-actions bi-menu-actions-inline'

    const backButton = document.createElement('button')
    backButton.type = 'button'
    backButton.className = 'bi-menu-btn is-ghost'
    backButton.textContent = 'Back'
    backButton.addEventListener('click', () => this.actions.onBack())

    this.createButton.type = 'button'
    this.createButton.className = 'bi-menu-btn'
    this.createButton.textContent = 'Create World'
    this.createButton.addEventListener('click', () => {
      this.actions.onCreate(this.readValue())
    })

    actionsRow.append(backButton, this.createButton)

    this.presetSelect.addEventListener('change', () => {
      this.applyPreset(this.presetSelect.value as WorldPreset)
    })

    this.eventRateInput.addEventListener('input', () => this.refreshLabels())
    this.treeDensityInput.addEventListener('input', () => this.refreshLabels())
    this.volcanoInput.addEventListener('input', () => this.refreshLabels())
    this.speedInput.addEventListener('input', () => this.refreshLabels())

    this.applyPreset('Balanced')

    this.root.append(title, subtitle, grid, actionsRow)
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  destroy(): void {
    this.root.remove()
  }

  setBusy(busy: boolean): void {
    this.createButton.disabled = busy
    this.createButton.textContent = busy ? 'Creating...' : 'Create World'
  }

  readValue(): WorldCreateFormValue {
    const preset = (this.presetSelect.value as WorldPreset) || 'Balanced'
    return {
      name: this.nameInput.value.trim() || 'Untitled World',
      seed: this.seedInput.value.trim() || `${Date.now()}`,
      preset,
      worldSize: (this.sizeSelect.value as WorldSize) || 'M',
      eventRate: clamp01(Number(this.eventRateInput.value), 0.2, 2.5),
      treeDensity: clamp01(Number(this.treeDensityInput.value), 0.25, 2.5),
      volcanoCount: (Number(this.volcanoInput.value) >= 1 ? 1 : 0) as 0 | 1,
      simulationSpeed: clamp01(Number(this.speedInput.value), 0.25, 4),
      enableGeneAgent: this.geneToggle.checked,
      enableCivs: this.civToggle.checked,
      enablePredators: this.predatorsToggle.checked,
    }
  }

  private applyPreset(preset: WorldPreset): void {
    const row = PRESET_DEFAULTS[preset] ?? PRESET_DEFAULTS.Balanced
    this.eventRateInput.value = row.eventRate.toFixed(2)
    this.treeDensityInput.value = row.treeDensity.toFixed(2)
    this.speedInput.value = row.simulationSpeed.toFixed(2)
    this.volcanoInput.value = '1'
    this.refreshLabels()
  }

  private refreshLabels(): void {
    this.eventRateValue.textContent = Number(this.eventRateInput.value).toFixed(2)
    this.treeDensityValue.textContent = Number(this.treeDensityInput.value).toFixed(2)
    this.volcanoValue.textContent = this.volcanoInput.value
    this.speedValue.textContent = `${Number(this.speedInput.value).toFixed(2)}x`
  }

  private createField(label: string, input: HTMLElement): HTMLElement {
    const wrap = document.createElement('label')
    wrap.className = 'bi-menu-field'
    const span = document.createElement('span')
    span.className = 'bi-menu-label'
    span.textContent = label
    wrap.append(span, input)
    return wrap
  }

  private createRangeField(label: string, input: HTMLInputElement, valueEl: HTMLElement): HTMLElement {
    const wrap = this.createField(label, input)
    valueEl.className = 'bi-menu-range-value'
    wrap.appendChild(valueEl)
    return wrap
  }

  private createToggleField(label: string, input: HTMLInputElement): HTMLElement {
    const wrap = document.createElement('label')
    wrap.className = 'bi-menu-toggle'
    const span = document.createElement('span')
    span.className = 'bi-menu-label'
    span.textContent = label
    wrap.append(span, input)
    return wrap
  }
}
