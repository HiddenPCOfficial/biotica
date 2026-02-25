export type EraKey = 'genesis' | 'ecologicRise' | 'civicDawn' | 'industrialShift'

export type EraState = {
  current: EraKey
  changedAtTick: number
}

const ERA_THRESHOLDS: ReadonlyArray<{ era: EraKey; minTick: number }> = [
  { era: 'genesis', minTick: 0 },
  { era: 'ecologicRise', minTick: 800 },
  { era: 'civicDawn', minTick: 2800 },
  { era: 'industrialShift', minTick: 6000 },
]

export class EraSystem {
  private state: EraState = {
    current: 'genesis',
    changedAtTick: 0,
  }

  reset(tick = 0): void {
    this.state = {
      current: 'genesis',
      changedAtTick: tick,
    }
  }

  step(tick: number): EraState {
    let nextEra: EraKey = 'genesis'
    for (let i = 0; i < ERA_THRESHOLDS.length; i++) {
      const item = ERA_THRESHOLDS[i]
      if (!item) continue
      if (tick >= item.minTick) {
        nextEra = item.era
      }
    }

    if (nextEra !== this.state.current) {
      this.state = {
        current: nextEra,
        changedAtTick: tick,
      }
    }

    return this.getState()
  }

  getState(): EraState {
    return { ...this.state }
  }
}
