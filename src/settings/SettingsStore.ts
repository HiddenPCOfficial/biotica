export type KeybindMap = {
  pause: string
  speedUp: string
  speedDown: string
  toggleOverlays: string
  focusSelection: string
}

export type GameSettings = {
  video: {
    showHUD: boolean
    pixelPerfect: boolean
    renderScale: number
    fpsLimit: number
    lodAggressiveness: number
  }
  audio: {
    masterVolume: number
    sfxVolume: number
    musicVolume: number
  }
  controls: {
    keybinds: KeybindMap
    zoomSensitivity: number
    panSpeed: number
  }
  gameplay: {
    autosaveIntervalSec: number
    enableHints: boolean
    deterministicMode: boolean
  }
  debug: {
    showChunkBorders: boolean
    showTerritoryOverlay: boolean
    showHazardOverlay: boolean
    showPathDebug: boolean
  }
}

const STORAGE_KEY = 'biotica_settings_v1'

const DEFAULT_SETTINGS: GameSettings = {
  video: {
    showHUD: true,
    pixelPerfect: false,
    renderScale: 1,
    fpsLimit: 60,
    lodAggressiveness: 0.5,
  },
  audio: {
    masterVolume: 0.7,
    sfxVolume: 0.8,
    musicVolume: 0.5,
  },
  controls: {
    keybinds: {
      pause: 'Escape',
      speedUp: '+',
      speedDown: '-',
      toggleOverlays: 'Digit1',
      focusSelection: 'KeyF',
    },
    zoomSensitivity: 1,
    panSpeed: 1,
  },
  gameplay: {
    autosaveIntervalSec: 20,
    enableHints: true,
    deterministicMode: true,
  },
  debug: {
    showChunkBorders: false,
    showTerritoryOverlay: true,
    showHazardOverlay: false,
    showPathDebug: false,
  },
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function mergeSettings(input: Partial<GameSettings> | null | undefined): GameSettings {
  const next = input ?? {}
  return {
    video: {
      showHUD: next.video?.showHUD ?? DEFAULT_SETTINGS.video.showHUD,
      pixelPerfect: next.video?.pixelPerfect ?? DEFAULT_SETTINGS.video.pixelPerfect,
      renderScale: clamp(next.video?.renderScale ?? DEFAULT_SETTINGS.video.renderScale, 0.5, 2),
      fpsLimit: clamp(Math.round(next.video?.fpsLimit ?? DEFAULT_SETTINGS.video.fpsLimit), 24, 240),
      lodAggressiveness: clamp(
        next.video?.lodAggressiveness ?? DEFAULT_SETTINGS.video.lodAggressiveness,
        0,
        1,
      ),
    },
    audio: {
      masterVolume: clamp(next.audio?.masterVolume ?? DEFAULT_SETTINGS.audio.masterVolume, 0, 1),
      sfxVolume: clamp(next.audio?.sfxVolume ?? DEFAULT_SETTINGS.audio.sfxVolume, 0, 1),
      musicVolume: clamp(next.audio?.musicVolume ?? DEFAULT_SETTINGS.audio.musicVolume, 0, 1),
    },
    controls: {
      keybinds: {
        pause: next.controls?.keybinds?.pause ?? DEFAULT_SETTINGS.controls.keybinds.pause,
        speedUp: next.controls?.keybinds?.speedUp ?? DEFAULT_SETTINGS.controls.keybinds.speedUp,
        speedDown: next.controls?.keybinds?.speedDown ?? DEFAULT_SETTINGS.controls.keybinds.speedDown,
        toggleOverlays:
          next.controls?.keybinds?.toggleOverlays ?? DEFAULT_SETTINGS.controls.keybinds.toggleOverlays,
        focusSelection:
          next.controls?.keybinds?.focusSelection ?? DEFAULT_SETTINGS.controls.keybinds.focusSelection,
      },
      zoomSensitivity: clamp(next.controls?.zoomSensitivity ?? DEFAULT_SETTINGS.controls.zoomSensitivity, 0.2, 3),
      panSpeed: clamp(next.controls?.panSpeed ?? DEFAULT_SETTINGS.controls.panSpeed, 0.2, 3),
    },
    gameplay: {
      autosaveIntervalSec: clamp(
        Math.round(next.gameplay?.autosaveIntervalSec ?? DEFAULT_SETTINGS.gameplay.autosaveIntervalSec),
        5,
        300,
      ),
      enableHints: next.gameplay?.enableHints ?? DEFAULT_SETTINGS.gameplay.enableHints,
      deterministicMode:
        next.gameplay?.deterministicMode ?? DEFAULT_SETTINGS.gameplay.deterministicMode,
    },
    debug: {
      showChunkBorders: next.debug?.showChunkBorders ?? DEFAULT_SETTINGS.debug.showChunkBorders,
      showTerritoryOverlay: next.debug?.showTerritoryOverlay ?? DEFAULT_SETTINGS.debug.showTerritoryOverlay,
      showHazardOverlay: next.debug?.showHazardOverlay ?? DEFAULT_SETTINGS.debug.showHazardOverlay,
      showPathDebug: next.debug?.showPathDebug ?? DEFAULT_SETTINGS.debug.showPathDebug,
    },
  }
}

function readStored(): GameSettings {
  if (typeof window === 'undefined') {
    return mergeSettings(DEFAULT_SETTINGS)
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return mergeSettings(DEFAULT_SETTINGS)
  }
  try {
    return mergeSettings(JSON.parse(raw) as Partial<GameSettings>)
  } catch {
    return mergeSettings(DEFAULT_SETTINGS)
  }
}

function writeStored(settings: GameSettings): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

type SettingsListener = (settings: GameSettings) => void

export class SettingsStore {
  private settings: GameSettings
  private readonly listeners = new Set<SettingsListener>()

  constructor(initial?: Partial<GameSettings>) {
    const stored = readStored()
    this.settings = mergeSettings({ ...stored, ...initial })
    writeStored(this.settings)
  }

  get(): GameSettings {
    return mergeSettings(this.settings)
  }

  update(patch: Partial<GameSettings>): GameSettings {
    this.settings = mergeSettings({ ...this.settings, ...patch })
    writeStored(this.settings)
    this.emit()
    return this.get()
  }

  replace(next: Partial<GameSettings>): GameSettings {
    this.settings = mergeSettings(next)
    writeStored(this.settings)
    this.emit()
    return this.get()
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener)
    listener(this.get())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const snapshot = this.get()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

export function getDefaultSettings(): GameSettings {
  return mergeSettings(DEFAULT_SETTINGS)
}
