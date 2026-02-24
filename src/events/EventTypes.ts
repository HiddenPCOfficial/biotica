export type EventKind =
  | 'RainStorm'
  | 'Drought'
  | 'HeatWave'
  | 'ColdSnap'
  | 'Earthquake'
  | 'VolcanoEruption'

export type EventSpawnRequest = {
  type: EventKind
  x: number
  y: number
}

export type BaseEvent = {
  id: string
  type: EventKind
  startTick: number
  durationTicks: number
  elapsedTicks: number
  seed: number
  x: number
  y: number
}

export type AreaEvent = BaseEvent & {
  radiusX: number
  radiusY: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  cursor: number
  batchCells: number
  intensity: number
}

export type RainStormEvent = AreaEvent & {
  type: 'RainStorm'
}

export type DroughtEvent = AreaEvent & {
  type: 'Drought'
}

export type HeatWaveEvent = AreaEvent & {
  type: 'HeatWave'
  deltaTemp: number
}

export type ColdSnapEvent = AreaEvent & {
  type: 'ColdSnap'
  deltaTemp: number
}

export type EarthquakeEvent = BaseEvent & {
  type: 'Earthquake'
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  cursor: number
  totalSteps: number
  upliftBias: number
}

export type VolcanoEruptionEvent = BaseEvent & {
  type: 'VolcanoEruption'
  craterX: number
  craterY: number
  phase: 'eruption' | 'cooling'
  eruptionTicks: number
  coolingTicks: number
  maxLavaTiles: number
  frontier: number[]
  lavaSet: Set<number>
  coolCursor: number
}

export type ActiveEvent =
  | RainStormEvent
  | DroughtEvent
  | HeatWaveEvent
  | ColdSnapEvent
  | EarthquakeEvent
  | VolcanoEruptionEvent

export type AtmosphereOverlay = {
  stormAlpha: number
  heatAlpha: number
  coldAlpha: number
}

export type EventStepResult = {
  changed: boolean
  overlay: AtmosphereOverlay
}
