import type { ActiveEvent, VolcanoEruptionEvent } from '../events/EventTypes'
import {
  createVolcanoEruptionEvent,
  stepVolcanoEruption,
} from '../events/events/VolcanoEruption'
import { clampInt, hash2D } from '../shared/math'
import { DEFAULT_WORLD_RUNTIME_CONFIG, type VolcanoRuntimeConfig } from './WorldConfig'
import type { RecentEventEntry, WorldState } from './types'
import { markDirtyTile, pushRecentEvent, worldIndex } from './WorldState'

export type VolcanoSystemState = {
  config: VolcanoRuntimeConfig
  activeEvent: VolcanoEruptionEvent | null
  recentEvents: RecentEventEntry[]
  eruptionCounter: number
  cycle: number
  nextEruptionTick: number
}

const DEFAULT_CONFIG: VolcanoRuntimeConfig = {
  minIntervalTicks: DEFAULT_WORLD_RUNTIME_CONFIG.volcano.minIntervalTicks,
  maxIntervalTicks: DEFAULT_WORLD_RUNTIME_CONFIG.volcano.maxIntervalTicks,
  maxLavaTiles: DEFAULT_WORLD_RUNTIME_CONFIG.volcano.maxLavaTiles,
}

/**
 * Sistema vulcano:
 * - un solo vulcano fisso per mondo
 * - eruzioni rare e deterministiche
 * - utilizza lo stesso step lavico dell'evento volcano
 */
export class VolcanoSystem {
  private config: VolcanoRuntimeConfig = { ...DEFAULT_CONFIG }
  private activeEvent: VolcanoEruptionEvent | null = null
  private readonly recentEvents: RecentEventEntry[] = []
  private eruptionCounter = 0
  private cycle = 0
  private nextEruptionTick = Number.POSITIVE_INFINITY

  constructor(private readonly seed: number) {}

  configure(config: Partial<VolcanoRuntimeConfig>): void {
    const minIntervalTicks = clampInt(
      config.minIntervalTicks ?? this.config.minIntervalTicks,
      5000,
      20000,
    )
    const maxIntervalTicks = clampInt(
      config.maxIntervalTicks ?? this.config.maxIntervalTicks,
      minIntervalTicks,
      26000,
    )

    this.config = {
      minIntervalTicks,
      maxIntervalTicks,
      maxLavaTiles: clampInt(config.maxLavaTiles ?? this.config.maxLavaTiles, 80, 450),
    }
  }

  reset(world: WorldState, tick: number): void {
    this.activeEvent = null
    this.recentEvents.length = 0
    this.eruptionCounter = 0
    this.cycle = 0
    this.nextEruptionTick = tick + this.nextInterval()

    world.volcano.minIntervalTicks = this.config.minIntervalTicks
    world.volcano.maxIntervalTicks = this.config.maxIntervalTicks
    world.volcano.maxLavaTiles = this.config.maxLavaTiles
    world.volcano.nextEruptionTick = this.nextEruptionTick
    world.volcano.activeEruptionId = null
  }

  step(world: WorldState, tick: number): { changed: boolean; overlay: number } {
    let changed = false
    let overlay = 0

    if (!this.activeEvent && tick >= this.nextEruptionTick) {
      const id = `VolcanoEruption-${this.seed}-${++this.eruptionCounter}`
      const eruptionTicks = 65 + Math.floor(hash2D(this.seed ^ 0xabcd9911, this.eruptionCounter, tick) * 65)
      const coolingTicks = 140 + Math.floor(hash2D(this.seed ^ 0x22ff3197, this.eruptionCounter, tick) * 110)

      this.activeEvent = createVolcanoEruptionEvent({
        id,
        seed: this.seed,
        tick,
        x: world.volcano.anchor.x,
        y: world.volcano.anchor.y,
        eruptionTicks,
        coolingTicks,
        maxLavaTiles: this.config.maxLavaTiles,
      })

      const entry: RecentEventEntry = {
        id,
        type: 'VolcanoEruption',
        tick,
        x: world.volcano.anchor.x,
        y: world.volcano.anchor.y,
        summary: `Volcano eruption @ (${world.volcano.anchor.x}, ${world.volcano.anchor.y})`,
      }
      this.recentEvents.push(entry)
      if (this.recentEvents.length > 48) {
        this.recentEvents.splice(0, this.recentEvents.length - 48)
      }
      pushRecentEvent(world, entry)
      world.volcano.activeEruptionId = id
    }

    if (!this.activeEvent) {
      return { changed: false, overlay: 0 }
    }

    const anchor = world.volcano.anchor
    this.applyCraterHazard(world, anchor.x, anchor.y)

    const step = stepVolcanoEruption(this.activeEvent, world)
    changed = step.changed
    overlay = step.overlay

    if (step.done) {
      this.activeEvent = null
      this.cycle += 1
      this.nextEruptionTick = tick + this.nextInterval()
      world.volcano.nextEruptionTick = this.nextEruptionTick
      world.volcano.activeEruptionId = null
    }

    return {
      changed,
      overlay,
    }
  }

  getActiveEvent(): ActiveEvent | null {
    return this.activeEvent
  }

  getRecentEvents(): readonly RecentEventEntry[] {
    return this.recentEvents
  }

  exportState(): VolcanoSystemState {
    return {
      config: { ...this.config },
      activeEvent: this.activeEvent ? { ...this.activeEvent } : null,
      recentEvents: this.recentEvents.map((row) => ({ ...row })),
      eruptionCounter: this.eruptionCounter,
      cycle: this.cycle,
      nextEruptionTick: this.nextEruptionTick,
    }
  }

  hydrateState(state: VolcanoSystemState, world: WorldState): void {
    this.config = {
      minIntervalTicks: clampInt(state.config.minIntervalTicks, 5000, 20000),
      maxIntervalTicks: clampInt(state.config.maxIntervalTicks, 5000, 26000),
      maxLavaTiles: clampInt(state.config.maxLavaTiles, 80, 450),
    }
    if (this.config.maxIntervalTicks < this.config.minIntervalTicks) {
      this.config.maxIntervalTicks = this.config.minIntervalTicks
    }

    this.activeEvent = state.activeEvent ? { ...state.activeEvent } : null
    this.recentEvents.length = 0
    const rows = Array.isArray(state.recentEvents) ? state.recentEvents : []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      this.recentEvents.push({ ...row })
    }

    this.eruptionCounter = Math.max(0, state.eruptionCounter | 0)
    this.cycle = Math.max(0, state.cycle | 0)
    this.nextEruptionTick = Number.isFinite(state.nextEruptionTick) ? state.nextEruptionTick : world.tick + this.nextInterval()

    world.volcano.minIntervalTicks = this.config.minIntervalTicks
    world.volcano.maxIntervalTicks = this.config.maxIntervalTicks
    world.volcano.maxLavaTiles = this.config.maxLavaTiles
    world.volcano.nextEruptionTick = this.nextEruptionTick
    world.volcano.activeEruptionId = this.activeEvent?.id ?? null
  }

  private nextInterval(): number {
    const span = this.config.maxIntervalTicks - this.config.minIntervalTicks
    if (span <= 0) {
      return this.config.minIntervalTicks
    }
    const roll = hash2D(this.seed ^ 0x9182ab11, this.cycle + 1, this.eruptionCounter + 3)
    return this.config.minIntervalTicks + Math.floor(roll * (span + 1))
  }

  private applyCraterHazard(world: WorldState, cx: number, cy: number): void {
    const radius = 4
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const x = cx + ox
        const y = cy + oy
        if (!world.inBounds(x, y)) {
          continue
        }
        const dist2 = ox * ox + oy * oy
        if (dist2 > radius * radius) {
          continue
        }
        const idx = worldIndex(world, x, y)
        const before = world.hazard[idx] ?? 0
        const push = Math.max(8, 95 - dist2 * 8)
        const next = Math.max(before, push)
        if (next !== before) {
          world.hazard[idx] = next
          markDirtyTile(world, x, y)
        }
      }
    }
  }
}

export type { VolcanoRuntimeConfig }
