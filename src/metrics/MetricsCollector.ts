import type { SpeciesStat } from '../sim/types'
import type { WorldState } from '../world/types'

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

  exportState(): MetricSample[] {
    return this.samples.map((sample) => ({
      tick: sample.tick,
      totalPopulation: sample.totalPopulation,
      biodiversity: sample.biodiversity,
      avgTemperature: sample.avgTemperature,
      avgHumidity: sample.avgHumidity,
      avgFertility: sample.avgFertility,
      populationBySpecies: { ...sample.populationBySpecies },
    }))
  }

  hydrateState(input: unknown): void {
    if (!Array.isArray(input)) {
      return
    }

    this.samples.length = 0
    for (let i = 0; i < input.length; i++) {
      const row = input[i] as Partial<MetricSample> | undefined
      if (!row) continue
      const tick = row.tick
      const totalPopulation = row.totalPopulation
      const biodiversity = row.biodiversity
      const avgTemperature = row.avgTemperature
      const avgHumidity = row.avgHumidity
      const avgFertility = row.avgFertility

      if (
        typeof tick !== 'number' ||
        typeof totalPopulation !== 'number' ||
        typeof biodiversity !== 'number'
      ) {
        continue
      }
      if (!Number.isFinite(tick) || !Number.isFinite(totalPopulation) || !Number.isFinite(biodiversity)) {
        continue
      }
      if (
        typeof avgTemperature !== 'number' ||
        typeof avgHumidity !== 'number' ||
        typeof avgFertility !== 'number' ||
        !Number.isFinite(avgTemperature) ||
        !Number.isFinite(avgHumidity) ||
        !Number.isFinite(avgFertility)
      ) {
        continue
      }

      const populationBySpecies: Record<string, number> = {}
      const entries = Object.entries(row.populationBySpecies ?? {})
      for (let j = 0; j < entries.length; j++) {
        const [speciesId, amount] = entries[j] ?? []
        if (!speciesId || typeof amount !== 'number' || !Number.isFinite(amount)) continue
        populationBySpecies[speciesId] = amount
      }

      this.samples.push({
        tick: Math.max(0, Math.floor(tick)),
        totalPopulation: Math.max(0, Math.floor(totalPopulation)),
        biodiversity: Math.max(0, Math.floor(biodiversity)),
        avgTemperature,
        avgHumidity,
        avgFertility,
        populationBySpecies,
      })
    }

    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples)
    }
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
