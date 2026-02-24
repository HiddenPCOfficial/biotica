import type { SeededRng } from '../core/SeededRng'
import type { RecentEventEntry, WorldState } from '../world/WorldState'
import { pushRecentEvent } from '../world/WorldState'
import type { ActiveEvent, AtmosphereOverlay, EventKind, EventStepResult } from './EventTypes'
import { createDroughtEvent, stepDrought } from './events/Drought'
import { createEarthquakeEvent, stepEarthquake } from './events/Earthquake'
import {
  createColdSnapEvent,
  createHeatWaveEvent,
  stepColdSnap,
  stepHeatWave,
} from './events/HeatWave'
import { createRainStormEvent, stepRainStorm } from './events/RainStorm'
import { stepVolcanoEruption } from './events/VolcanoEruption'

type EventSystemOptions = {
  spawnCooldownTicks?: number
  maxActiveEvents?: number
}

export type EventSystemState = {
  activeEvents: ActiveEvent[]
  recentEvents: RecentEventEntry[]
  eventCounter: number
  lastSpawnTick: number
  eventRateMultiplier: number
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Scheduler eventi ambientali:
 * - spawn deterministico per tick
 * - update eventi attivi in batch leggeri
 * - telemetria eventi recenti
 */
export class EventSystem {
  private readonly seed: number
  private readonly activeEvents: ActiveEvent[] = []
  private readonly recentEvents: RecentEventEntry[] = []

  private readonly spawnCooldownTicks: number
  private readonly maxActiveEvents: number

  private eventCounter = 0
  private lastSpawnTick = -99999
  private eventRateMultiplier = 1

  constructor(seed: number, options: EventSystemOptions = {}) {
    this.seed = seed | 0
    this.spawnCooldownTicks = options.spawnCooldownTicks ?? 90
    this.maxActiveEvents = options.maxActiveEvents ?? 4
  }

  step(world: WorldState, rng: SeededRng, tick: number): EventStepResult {
    this.trySpawn(world, rng, tick)

    let changed = false
    let stormAlpha = 0
    let heatAlpha = 0
    let coldAlpha = 0

    for (let i = this.activeEvents.length - 1; i >= 0; i--) {
      const event = this.activeEvents[i]
      if (!event) {
        continue
      }

      switch (event.type) {
        case 'RainStorm': {
          const res = stepRainStorm(event, world)
          changed = changed || res.changed
          stormAlpha = Math.max(stormAlpha, res.overlay)
          if (res.done) this.activeEvents.splice(i, 1)
          break
        }
        case 'Drought': {
          const res = stepDrought(event, world)
          changed = changed || res.changed
          heatAlpha = Math.max(heatAlpha, res.overlay * 0.8)
          if (res.done) this.activeEvents.splice(i, 1)
          break
        }
        case 'HeatWave': {
          const res = stepHeatWave(event, world)
          changed = changed || res.changed
          heatAlpha = Math.max(heatAlpha, res.overlay)
          if (res.done) this.activeEvents.splice(i, 1)
          break
        }
        case 'ColdSnap': {
          const res = stepColdSnap(event, world)
          changed = changed || res.changed
          coldAlpha = Math.max(coldAlpha, res.overlay)
          if (res.done) this.activeEvents.splice(i, 1)
          break
        }
        case 'Earthquake': {
          const res = stepEarthquake(event, world)
          changed = changed || res.changed
          stormAlpha = Math.max(stormAlpha, res.overlay * 0.45)
          if (res.done) this.activeEvents.splice(i, 1)
          break
        }
        case 'VolcanoEruption': {
          const res = stepVolcanoEruption(event, world)
          changed = changed || res.changed
          heatAlpha = Math.max(heatAlpha, res.overlay)
          if (res.done) this.activeEvents.splice(i, 1)
          break
        }
      }
    }

    return {
      changed,
      overlay: { stormAlpha, heatAlpha, coldAlpha },
    }
  }

  getActiveEvents(): readonly ActiveEvent[] {
    return this.activeEvents
  }

  getRecentEvents(): readonly RecentEventEntry[] {
    return this.recentEvents
  }

  setEventRateMultiplier(value: number): void {
    if (!Number.isFinite(value)) {
      return
    }
    this.eventRateMultiplier = Math.max(0, Math.min(5, value))
  }

  exportState(): EventSystemState {
    return {
      activeEvents: this.activeEvents.map((event) => ({ ...event })),
      recentEvents: this.recentEvents.map((event) => ({ ...event })),
      eventCounter: this.eventCounter,
      lastSpawnTick: this.lastSpawnTick,
      eventRateMultiplier: this.eventRateMultiplier,
    }
  }

  hydrateState(state: EventSystemState): void {
    this.activeEvents.length = 0
    this.recentEvents.length = 0

    const active = Array.isArray(state.activeEvents) ? state.activeEvents : []
    for (let i = 0; i < active.length; i++) {
      const event = active[i]
      if (!event) continue
      this.activeEvents.push({ ...event })
    }

    const recent = Array.isArray(state.recentEvents) ? state.recentEvents : []
    for (let i = 0; i < recent.length; i++) {
      const row = recent[i]
      if (!row) continue
      this.recentEvents.push({ ...row })
    }

    this.eventCounter = Math.max(0, state.eventCounter | 0)
    this.lastSpawnTick = state.lastSpawnTick | 0
    this.eventRateMultiplier = Math.max(0, Math.min(5, Number(state.eventRateMultiplier) || 0))
  }

  private trySpawn(world: WorldState, rng: SeededRng, tick: number): void {
    if (this.activeEvents.length >= this.maxActiveEvents) {
      return
    }

    if (tick - this.lastSpawnTick < this.spawnCooldownTicks) {
      return
    }

    const seasonPhase = (tick % 2400) / 2400 // 20 tick/s -> 120s ciclo
    const wetBias = 0.5 + Math.sin(seasonPhase * Math.PI * 2) * 0.5
    const spawnChance = (0.028 + wetBias * 0.012) * this.eventRateMultiplier

    if (!rng.chance(spawnChance)) {
      return
    }

    const kind = this.pickEventKind(wetBias, rng)
    const spawn = this.createEvent(kind, world, rng, tick)
    if (!spawn) {
      return
    }

    this.activeEvents.push(spawn)
    this.lastSpawnTick = tick

    const entry: RecentEventEntry = {
      id: spawn.id,
      type: spawn.type,
      tick,
      x: spawn.x,
      y: spawn.y,
      summary: `${spawn.type} @ (${spawn.x}, ${spawn.y})`,
    }
    this.recentEvents.push(entry)
    if (this.recentEvents.length > 64) {
      this.recentEvents.splice(0, this.recentEvents.length - 64)
    }
    pushRecentEvent(world, entry)
  }

  private pickEventKind(wetBias: number, rng: SeededRng): EventKind {
    const roll = rng.nextFloat()
    const rainWeight = 0.22 + wetBias * 0.23
    const droughtWeight = 0.17 + (1 - wetBias) * 0.22
    const heatWeight = 0.16
    const coldWeight = 0.14
    const quakeWeight = 0.16
    const total =
      rainWeight + droughtWeight + heatWeight + coldWeight + quakeWeight

    let cursor = (roll * total) / Math.max(1e-6, total)
    if ((cursor -= rainWeight) <= 0) return 'RainStorm'
    if ((cursor -= droughtWeight) <= 0) return 'Drought'
    if ((cursor -= heatWeight) <= 0) return 'HeatWave'
    if ((cursor -= coldWeight) <= 0) return 'ColdSnap'
    if ((cursor -= quakeWeight) <= 0) return 'Earthquake'
    return 'Earthquake'
  }

  private createEvent(kind: EventKind, world: WorldState, rng: SeededRng, tick: number): ActiveEvent | null {
    const seed = (this.seed ^ Math.imul(tick + 1, 0x85ebca6b) ^ (this.eventCounter + 17)) >>> 0
    this.eventCounter++
    const id = `${kind}-${seed}-${this.eventCounter}`

    const randomX = rng.nextInt(world.width)
    const randomY = rng.nextInt(world.height)

    if (kind === 'RainStorm') {
      return createRainStormEvent({
        id,
        seed,
        tick,
        x: randomX,
        y: randomY,
        radiusX: rng.rangeInt(9, 22),
        radiusY: rng.rangeInt(7, 18),
        intensity: 0.9 + rng.nextFloat() * 0.9,
        durationTicks: rng.rangeInt(90, 230),
      })
    }

    if (kind === 'Drought') {
      return createDroughtEvent({
        id,
        seed,
        tick,
        x: randomX,
        y: randomY,
        radiusX: rng.rangeInt(10, 24),
        radiusY: rng.rangeInt(8, 20),
        intensity: 0.8 + rng.nextFloat() * 1.1,
        durationTicks: rng.rangeInt(110, 250),
      })
    }

    if (kind === 'HeatWave') {
      return createHeatWaveEvent({
        id,
        seed,
        tick,
        x: randomX,
        y: randomY,
        radiusX: rng.rangeInt(8, 22),
        radiusY: rng.rangeInt(8, 20),
        intensity: 0.7 + rng.nextFloat() * 1.2,
        durationTicks: rng.rangeInt(80, 180),
      })
    }

    if (kind === 'ColdSnap') {
      return createColdSnapEvent({
        id,
        seed,
        tick,
        x: randomX,
        y: randomY,
        radiusX: rng.rangeInt(8, 20),
        radiusY: rng.rangeInt(8, 18),
        intensity: 0.7 + rng.nextFloat() * 1.1,
        durationTicks: rng.rangeInt(80, 180),
      })
    }

    if (kind === 'Earthquake') {
      const x2 = rng.nextInt(world.width)
      const y2 = rng.nextInt(world.height)
      return createEarthquakeEvent({
        id,
        seed,
        tick,
        x: randomX,
        y: randomY,
        x2,
        y2,
        width: rng.rangeInt(1, 2),
        durationTicks: rng.rangeInt(35, 95),
        upliftBias: clamp01(0.4 + rng.nextFloat() * 0.35),
      })
    }

    return null
  }
}
