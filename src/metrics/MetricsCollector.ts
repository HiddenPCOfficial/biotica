import type { SpeciesStat } from '../creatures/types'
import type { WorldState } from '../world/WorldState'

export type MetricSample = {
  tick: number
  totalPopulation: number
  biodiversity: number
  avgTemperature: number
  avgHumidity: number
  avgFertility: number
  populationBySpecies: Record<string, number>
}

export type TopSpeciesSeries = {
  speciesIds: string[]
  points: Array<{
    tick: number
    values: number[]
  }>
}

/**
 * Collettore metriche simulazione.
 */
export class MetricsCollector {
  private readonly samples: MetricSample[] = []

  constructor(
    private readonly sampleIntervalTicks = 10,
    private readonly maxSamples = 720,
  ) {}

  clear(): void {
    this.samples.length = 0
  }

  sample(tick: number, world: WorldState, speciesStats: readonly SpeciesStat[]): void {
    if (tick % this.sampleIntervalTicks !== 0) {
      return
    }

    const popBySpecies: Record<string, number> = {}
    let totalPopulation = 0
    for (let i = 0; i < speciesStats.length; i++) {
      const stat = speciesStats[i]
      if (!stat) continue
      popBySpecies[stat.speciesId] = stat.population
      totalPopulation += stat.population
    }

    const stride = Math.max(1, Math.floor((world.width * world.height) / 1024))
    let tempSum = 0
    let humSum = 0
    let fertSum = 0
    let n = 0
    for (let i = 0; i < world.temperature.length; i += stride) {
      tempSum += world.temperature[i] ?? 0
      humSum += world.humidity[i] ?? 0
      fertSum += world.fertility[i] ?? 0
      n++
    }
    const denom = Math.max(1, n)

    const metric: MetricSample = {
      tick,
      totalPopulation,
      biodiversity: speciesStats.filter((s) => s.population > 0).length,
      avgTemperature: tempSum / denom / 255,
      avgHumidity: humSum / denom / 255,
      avgFertility: fertSum / denom / 255,
      populationBySpecies: popBySpecies,
    }

    this.samples.push(metric)
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples)
    }
  }

  getSamples(): readonly MetricSample[] {
    return this.samples
  }

  getTopSpeciesSeries(limit = 5): TopSpeciesSeries {
    const speciesScores = new Map<string, number>()
    for (let i = 0; i < this.samples.length; i++) {
      const sample = this.samples[i]
      if (!sample) continue
      const entries = Object.entries(sample.populationBySpecies)
      for (let j = 0; j < entries.length; j++) {
        const [speciesId, pop] = entries[j] ?? []
        if (!speciesId) continue
        speciesScores.set(speciesId, (speciesScores.get(speciesId) ?? 0) + (pop ?? 0))
      }
    }

    const topSpecies = Array.from(speciesScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, limit))
      .map((entry) => entry[0])

    const points: TopSpeciesSeries['points'] = []
    for (let i = 0; i < this.samples.length; i++) {
      const sample = this.samples[i]
      if (!sample) continue
      const values: number[] = new Array(topSpecies.length)
      for (let s = 0; s < topSpecies.length; s++) {
        const speciesId = topSpecies[s]
        if (!speciesId) {
          values[s] = 0
          continue
        }
        values[s] = sample.populationBySpecies[speciesId] ?? 0
      }
      points.push({ tick: sample.tick, values })
    }

    return { speciesIds: topSpecies, points }
  }
}
