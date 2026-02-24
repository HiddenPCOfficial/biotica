import type { GameSettings } from '../../../settings/SettingsStore'

export type SettingsPageActions = {
  onBack: () => void
  onChange: (settings: GameSettings) => void
}

function cloneSettings(settings: GameSettings): GameSettings {
  return JSON.parse(JSON.stringify(settings)) as GameSettings
}

export class SettingsPage {
  readonly root = document.createElement('section')

  private settings: GameSettings

  private readonly refs = new Map<string, HTMLInputElement>()

  constructor(initial: GameSettings, private readonly actions: SettingsPageActions) {
    this.settings = cloneSettings(initial)

    this.root.className = 'bi-menu-page bi-menu-settings-page'

    const title = document.createElement('h1')
    title.className = 'bi-menu-title'
    title.textContent = 'Settings'

    const subtitle = document.createElement('p')
    subtitle.className = 'bi-menu-subtitle'
    subtitle.textContent = 'Video, audio, controls, gameplay and debug options.'

    const body = document.createElement('div')
    body.className = 'bi-menu-settings-grid'

    body.append(
      this.buildVideoSection(),
      this.buildAudioSection(),
      this.buildControlsSection(),
      this.buildGameplaySection(),
      this.buildDebugSection(),
    )

    const actionsRow = document.createElement('div')
    actionsRow.className = 'bi-menu-actions bi-menu-actions-inline'

    const backButton = document.createElement('button')
    backButton.type = 'button'
    backButton.className = 'bi-menu-btn is-ghost'
    backButton.textContent = 'Back'
    backButton.addEventListener('click', () => this.actions.onBack())

    actionsRow.append(backButton)

    this.root.append(title, subtitle, body, actionsRow)
    this.writeToForm(this.settings)
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  destroy(): void {
    this.root.remove()
  }

  setSettings(next: GameSettings): void {
    this.settings = cloneSettings(next)
    this.writeToForm(this.settings)
  }

  private emitChange(): void {
    const next = this.readFromForm()
    this.settings = next
    this.actions.onChange(cloneSettings(next))
  }

  private buildVideoSection(): HTMLElement {
    const section = this.createSection('Video')
    section.append(
      this.createCheckbox('video.showHUD', 'Show HUD'),
      this.createCheckbox('video.pixelPerfect', 'Pixel Perfect'),
      this.createRange('video.renderScale', 'Render Scale', 0.5, 2, 0.05),
      this.createRange('video.fpsLimit', 'FPS Limit', 24, 240, 1),
      this.createRange('video.lodAggressiveness', 'LOD Aggressiveness', 0, 1, 0.05),
    )
    return section
  }

  private buildAudioSection(): HTMLElement {
    const section = this.createSection('Audio')
    section.append(
      this.createRange('audio.masterVolume', 'Master Volume', 0, 1, 0.01),
      this.createRange('audio.sfxVolume', 'SFX Volume', 0, 1, 0.01),
      this.createRange('audio.musicVolume', 'Music Volume', 0, 1, 0.01),
    )
    return section
  }

  private buildControlsSection(): HTMLElement {
    const section = this.createSection('Controls')
    section.append(
      this.createText('controls.keybinds.pause', 'Pause Key'),
      this.createText('controls.keybinds.speedUp', 'Speed Up Key'),
      this.createText('controls.keybinds.speedDown', 'Speed Down Key'),
      this.createText('controls.keybinds.toggleOverlays', 'Toggle Overlays Key'),
      this.createText('controls.keybinds.focusSelection', 'Focus Selection Key'),
      this.createRange('controls.zoomSensitivity', 'Zoom Sensitivity', 0.2, 3, 0.05),
      this.createRange('controls.panSpeed', 'Pan Speed', 0.2, 3, 0.05),
    )
    return section
  }

  private buildGameplaySection(): HTMLElement {
    const section = this.createSection('Gameplay')
    section.append(
      this.createRange('gameplay.autosaveIntervalSec', 'Autosave Interval (sec)', 5, 300, 1),
      this.createCheckbox('gameplay.enableHints', 'Enable Hints'),
      this.createCheckbox('gameplay.deterministicMode', 'Deterministic Mode'),
    )
    return section
  }

  private buildDebugSection(): HTMLElement {
    const section = this.createSection('Debug')
    section.append(
      this.createCheckbox('debug.showChunkBorders', 'Show Chunk Borders'),
      this.createCheckbox('debug.showTerritoryOverlay', 'Show Territory Overlay'),
      this.createCheckbox('debug.showHazardOverlay', 'Show Hazard Overlay'),
      this.createCheckbox('debug.showPathDebug', 'Show Path Debug'),
    )
    return section
  }

  private createSection(title: string): HTMLElement {
    const section = document.createElement('section')
    section.className = 'bi-menu-settings-section'
    const heading = document.createElement('h2')
    heading.className = 'bi-menu-section-title'
    heading.textContent = title
    section.appendChild(heading)
    return section
  }

  private createCheckbox(key: string, label: string): HTMLElement {
    const row = document.createElement('label')
    row.className = 'bi-menu-toggle'

    const text = document.createElement('span')
    text.className = 'bi-menu-label'
    text.textContent = label

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.addEventListener('change', () => this.emitChange())
    this.refs.set(key, input)

    row.append(text, input)
    return row
  }

  private createRange(key: string, label: string, min: number, max: number, step: number): HTMLElement {
    const row = document.createElement('label')
    row.className = 'bi-menu-field'

    const text = document.createElement('span')
    text.className = 'bi-menu-label'
    text.textContent = label

    const input = document.createElement('input')
    input.className = 'bi-menu-range'
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)

    const value = document.createElement('span')
    value.className = 'bi-menu-range-value'

    const onInput = (): void => {
      value.textContent = input.value
      this.emitChange()
    }

    input.addEventListener('input', onInput)
    input.addEventListener('change', onInput)

    this.refs.set(key, input)
    row.append(text, input, value)
    return row
  }

  private createText(key: string, label: string): HTMLElement {
    const row = document.createElement('label')
    row.className = 'bi-menu-field'

    const text = document.createElement('span')
    text.className = 'bi-menu-label'
    text.textContent = label

    const input = document.createElement('input')
    input.className = 'bi-menu-input'
    input.type = 'text'
    input.addEventListener('change', () => this.emitChange())

    this.refs.set(key, input)
    row.append(text, input)
    return row
  }

  private writeToForm(settings: GameSettings): void {
    this.setInputValue('video.showHUD', settings.video.showHUD)
    this.setInputValue('video.pixelPerfect', settings.video.pixelPerfect)
    this.setInputValue('video.renderScale', settings.video.renderScale)
    this.setInputValue('video.fpsLimit', settings.video.fpsLimit)
    this.setInputValue('video.lodAggressiveness', settings.video.lodAggressiveness)

    this.setInputValue('audio.masterVolume', settings.audio.masterVolume)
    this.setInputValue('audio.sfxVolume', settings.audio.sfxVolume)
    this.setInputValue('audio.musicVolume', settings.audio.musicVolume)

    this.setInputValue('controls.keybinds.pause', settings.controls.keybinds.pause)
    this.setInputValue('controls.keybinds.speedUp', settings.controls.keybinds.speedUp)
    this.setInputValue('controls.keybinds.speedDown', settings.controls.keybinds.speedDown)
    this.setInputValue('controls.keybinds.toggleOverlays', settings.controls.keybinds.toggleOverlays)
    this.setInputValue('controls.keybinds.focusSelection', settings.controls.keybinds.focusSelection)
    this.setInputValue('controls.zoomSensitivity', settings.controls.zoomSensitivity)
    this.setInputValue('controls.panSpeed', settings.controls.panSpeed)

    this.setInputValue('gameplay.autosaveIntervalSec', settings.gameplay.autosaveIntervalSec)
    this.setInputValue('gameplay.enableHints', settings.gameplay.enableHints)
    this.setInputValue('gameplay.deterministicMode', settings.gameplay.deterministicMode)

    this.setInputValue('debug.showChunkBorders', settings.debug.showChunkBorders)
    this.setInputValue('debug.showTerritoryOverlay', settings.debug.showTerritoryOverlay)
    this.setInputValue('debug.showHazardOverlay', settings.debug.showHazardOverlay)
    this.setInputValue('debug.showPathDebug', settings.debug.showPathDebug)

    this.refreshRangeLabels()
  }

  private readFromForm(): GameSettings {
    const readNum = (key: string, fallback: number): number => {
      const ref = this.refs.get(key)
      if (!ref) return fallback
      const value = Number(ref.value)
      return Number.isFinite(value) ? value : fallback
    }
    const readBool = (key: string, fallback: boolean): boolean => {
      const ref = this.refs.get(key)
      if (!ref) return fallback
      return ref.checked
    }
    const readText = (key: string, fallback: string): string => {
      const ref = this.refs.get(key)
      if (!ref) return fallback
      const value = ref.value.trim()
      return value || fallback
    }

    return {
      video: {
        showHUD: readBool('video.showHUD', this.settings.video.showHUD),
        pixelPerfect: readBool('video.pixelPerfect', this.settings.video.pixelPerfect),
        renderScale: readNum('video.renderScale', this.settings.video.renderScale),
        fpsLimit: Math.round(readNum('video.fpsLimit', this.settings.video.fpsLimit)),
        lodAggressiveness: readNum('video.lodAggressiveness', this.settings.video.lodAggressiveness),
      },
      audio: {
        masterVolume: readNum('audio.masterVolume', this.settings.audio.masterVolume),
        sfxVolume: readNum('audio.sfxVolume', this.settings.audio.sfxVolume),
        musicVolume: readNum('audio.musicVolume', this.settings.audio.musicVolume),
      },
      controls: {
        keybinds: {
          pause: readText('controls.keybinds.pause', this.settings.controls.keybinds.pause),
          speedUp: readText('controls.keybinds.speedUp', this.settings.controls.keybinds.speedUp),
          speedDown: readText('controls.keybinds.speedDown', this.settings.controls.keybinds.speedDown),
          toggleOverlays: readText(
            'controls.keybinds.toggleOverlays',
            this.settings.controls.keybinds.toggleOverlays,
          ),
          focusSelection: readText(
            'controls.keybinds.focusSelection',
            this.settings.controls.keybinds.focusSelection,
          ),
        },
        zoomSensitivity: readNum('controls.zoomSensitivity', this.settings.controls.zoomSensitivity),
        panSpeed: readNum('controls.panSpeed', this.settings.controls.panSpeed),
      },
      gameplay: {
        autosaveIntervalSec: Math.round(
          readNum('gameplay.autosaveIntervalSec', this.settings.gameplay.autosaveIntervalSec),
        ),
        enableHints: readBool('gameplay.enableHints', this.settings.gameplay.enableHints),
        deterministicMode: readBool('gameplay.deterministicMode', this.settings.gameplay.deterministicMode),
      },
      debug: {
        showChunkBorders: readBool('debug.showChunkBorders', this.settings.debug.showChunkBorders),
        showTerritoryOverlay: readBool('debug.showTerritoryOverlay', this.settings.debug.showTerritoryOverlay),
        showHazardOverlay: readBool('debug.showHazardOverlay', this.settings.debug.showHazardOverlay),
        showPathDebug: readBool('debug.showPathDebug', this.settings.debug.showPathDebug),
      },
    }
  }

  private setInputValue(key: string, value: string | number | boolean): void {
    const input = this.refs.get(key)
    if (!input) {
      return
    }
    if (typeof value === 'boolean') {
      input.checked = value
      return
    }
    input.value = String(value)
  }

  private refreshRangeLabels(): void {
    const labels = this.root.querySelectorAll<HTMLElement>('.bi-menu-range-value')
    const ranges = this.root.querySelectorAll<HTMLInputElement>('input.bi-menu-range')
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i]
      const label = labels[i]
      if (!range || !label) continue
      label.textContent = range.value
    }
  }
}
