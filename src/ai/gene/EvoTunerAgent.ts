import { computeEcoObjectives, weightedObjectiveScore } from './EcoObjectives'
import { HeadlessSimulator } from './HeadlessSimulator'
import { SeededRng } from './SeededRng'
import { buildWorldGenesisReport } from './reports'
import {
  CandidateSchema,
  EvoTunerInputSchema,
  WorldGenesisResultSchema,
  type Candidate,
  type EvoTunerInput,
  type ObjectiveScores,
  type WorldGenesisParamRanges,
  type WorldGenome,
  type WorldGenesisResult,
} from './schemas'

const OBJECTIVE_KEYS: Array<keyof ObjectiveScores> = [
  'survivalScore',
  'biodiversityScore',
  'stabilityScore',
  'resourceBalanceScore',
  'catastropheTolerance',
]

const GENOME_KEYS: Array<keyof WorldGenome> = [
  'plantBaseGrowth',
  'plantDecay',
  'initialBiomass',
  'reproductionThreshold',
  'metabolismScale',
  'eventRate',
  'droughtSeverity',
  'rainSeverity',
  'tempVariance',
  'humidityVariance',
  'predatorEnableTick',
]

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function interpolate(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function hashText(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mixSeed(seed: number, a: number, b: number, c: number): number {
  let h = (seed | 0) >>> 0
  h ^= Math.imul((a | 0) >>> 0, 0x9e3779b1)
  h = Math.imul(h, 0x85ebca6b)
  h ^= Math.imul((b | 0) >>> 0, 0xc2b2ae35)
  h = Math.imul(h, 0x27d4eb2d)
  h ^= Math.imul((c | 0) >>> 0, 0x165667b1)
  h ^= h >>> 15
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 13
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h | 0
}

type RuntimeCandidate = Candidate & {
  dominationCount: number
  dominates: number[]
}

/**
 * Mini NSGA-II agent deterministico per tuning world genesis.
 * Tutte le variazioni sono guidate da SeededRng (nessun Math.random).
 */
export class EvoTunerAgent {
  private readonly simulator = new HeadlessSimulator()

  tune(rawInput: EvoTunerInput): WorldGenesisResult {
    const input = EvoTunerInputSchema.parse(rawInput)
    const rng = new SeededRng(input.seed)

    let population = this.createInitialPopulation(input.populationSize, input.paramRanges, rng)

    for (let generation = 0; generation < input.generations; generation++) {
      this.evaluatePopulation(population, input, generation)
      const fronts = this.fastNonDominatedSort(population)
      this.assignCrowdingDistance(population, fronts)
      population = this.selectElitist(population, fronts, input.populationSize)

      if (generation >= input.generations - 1) {
        break
      }

      const offspring = this.makeOffspring(population, input, rng, generation)
      population = [...population, ...offspring]
    }

    this.evaluatePopulation(population, input, input.generations)
    const fronts = this.fastNonDominatedSort(population)
    this.assignCrowdingDistance(population, fronts)

    const best = this.selectBestCandidate(population, input)
    const paretoFront = (fronts[0] ?? []).map((index) => population[index]!).filter(Boolean)

    const report = buildWorldGenesisReport({
      bestCandidate: {
        ...best,
        weightedScore: weightedObjectiveScore(best.scores, input.objectiveWeights, input.constraints),
      },
      paretoFront: paretoFront.map((candidate) => ({
        ...candidate,
        weightedScore: weightedObjectiveScore(candidate.scores, input.objectiveWeights, input.constraints),
      })),
      weights: input.objectiveWeights,
      constraints: input.constraints,
      sampleSize: 8,
    })

    return WorldGenesisResultSchema.parse({
      bestConfig: { ...best.genome },
      report,
    })
  }

  private createInitialPopulation(
    size: number,
    ranges: WorldGenesisParamRanges,
    rng: SeededRng,
  ): RuntimeCandidate[] {
    const out: RuntimeCandidate[] = []
    for (let i = 0; i < size; i++) {
      const genome = this.randomGenome(ranges, rng)
      out.push(this.createRuntimeCandidate(`g0-c${i}`, genome))
    }
    return out
  }

  private createRuntimeCandidate(id: string, genome: WorldGenome): RuntimeCandidate {
    return {
      id,
      genome,
      scores: {
        survivalScore: 0,
        biodiversityScore: 0,
        stabilityScore: 0,
        resourceBalanceScore: 0,
        catastropheTolerance: 0,
      },
      rank: 0,
      crowdingDistance: 0,
      dominationCount: 0,
      dominates: [],
    }
  }

  private randomGenome(ranges: WorldGenesisParamRanges, rng: SeededRng): WorldGenome {
    return {
      plantBaseGrowth: rng.rangeFloat(ranges.plantBaseGrowth.min, ranges.plantBaseGrowth.max),
      plantDecay: rng.rangeFloat(ranges.plantDecay.min, ranges.plantDecay.max),
      initialBiomass: rng.rangeFloat(ranges.initialBiomass.min, ranges.initialBiomass.max),
      reproductionThreshold: rng.rangeFloat(
        ranges.reproductionThreshold.min,
        ranges.reproductionThreshold.max,
      ),
      metabolismScale: rng.rangeFloat(ranges.metabolismScale.min, ranges.metabolismScale.max),
      eventRate: rng.rangeFloat(ranges.eventRate.min, ranges.eventRate.max),
      droughtSeverity: rng.rangeFloat(ranges.droughtSeverity.min, ranges.droughtSeverity.max),
      rainSeverity: rng.rangeFloat(ranges.rainSeverity.min, ranges.rainSeverity.max),
      tempVariance: rng.rangeFloat(ranges.tempVariance.min, ranges.tempVariance.max),
      humidityVariance: rng.rangeFloat(ranges.humidityVariance.min, ranges.humidityVariance.max),
      predatorEnableTick: Math.round(
        rng.rangeFloat(ranges.predatorEnableTick.min, ranges.predatorEnableTick.max),
      ),
    }
  }

  private evaluatePopulation(
    population: RuntimeCandidate[],
    input: EvoTunerInput,
    generation: number,
  ): void {
    for (let i = 0; i < population.length; i++) {
      const candidate = population[i]
      if (!candidate) continue

      const aggregate: ObjectiveScores = {
        survivalScore: 0,
        biodiversityScore: 0,
        stabilityScore: 0,
        resourceBalanceScore: 0,
        catastropheTolerance: 0,
      }

      const candidateHash = hashText(candidate.id)
      for (let v = 0; v < input.validationSeeds; v++) {
        const validationSeed = mixSeed(input.seed, generation + 1, candidateHash + i, v + 1)
        const sim = this.simulator.run({
          seed: validationSeed,
          genome: candidate.genome,
          ticks: input.simTicks,
        })
        const scores = computeEcoObjectives(sim)

        aggregate.survivalScore += scores.survivalScore
        aggregate.biodiversityScore += scores.biodiversityScore
        aggregate.stabilityScore += scores.stabilityScore
        aggregate.resourceBalanceScore += scores.resourceBalanceScore
        aggregate.catastropheTolerance += scores.catastropheTolerance
      }

      const inv = 1 / input.validationSeeds
      candidate.scores = {
        survivalScore: aggregate.survivalScore * inv,
        biodiversityScore: aggregate.biodiversityScore * inv,
        stabilityScore: aggregate.stabilityScore * inv,
        resourceBalanceScore: aggregate.resourceBalanceScore * inv,
        catastropheTolerance: aggregate.catastropheTolerance * inv,
      }

      candidate.dominationCount = 0
      candidate.dominates.length = 0
      candidate.crowdingDistance = 0
      candidate.rank = 0

      CandidateSchema.parse(candidate)
    }
  }

  private fastNonDominatedSort(population: RuntimeCandidate[]): number[][] {
    const fronts: number[][] = [[]]

    for (let p = 0; p < population.length; p++) {
      const candidateP = population[p]
      if (!candidateP) continue

      candidateP.dominationCount = 0
      candidateP.dominates.length = 0

      for (let q = 0; q < population.length; q++) {
        if (p === q) continue
        const candidateQ = population[q]
        if (!candidateQ) continue

        if (this.dominates(candidateP, candidateQ)) {
          candidateP.dominates.push(q)
        } else if (this.dominates(candidateQ, candidateP)) {
          candidateP.dominationCount += 1
        }
      }

      if (candidateP.dominationCount === 0) {
        candidateP.rank = 0
        fronts[0]!.push(p)
      }
    }

    let current = 0
    while ((fronts[current] ?? []).length > 0) {
      const nextFront: number[] = []
      const currentFront = fronts[current]!

      for (let i = 0; i < currentFront.length; i++) {
        const p = currentFront[i]!
        const candidateP = population[p]
        if (!candidateP) continue

        for (let j = 0; j < candidateP.dominates.length; j++) {
          const q = candidateP.dominates[j]!
          const candidateQ = population[q]
          if (!candidateQ) continue

          candidateQ.dominationCount -= 1
          if (candidateQ.dominationCount === 0) {
            candidateQ.rank = current + 1
            nextFront.push(q)
          }
        }
      }

      current += 1
      fronts[current] = nextFront
    }

    return fronts.filter((front) => front.length > 0)
  }

  private dominates(a: RuntimeCandidate, b: RuntimeCandidate): boolean {
    let hasBetter = false
    for (let i = 0; i < OBJECTIVE_KEYS.length; i++) {
      const key = OBJECTIVE_KEYS[i]!
      const av = a.scores[key]
      const bv = b.scores[key]
      if (av < bv) {
        return false
      }
      if (av > bv) {
        hasBetter = true
      }
    }
    return hasBetter
  }

  private assignCrowdingDistance(population: RuntimeCandidate[], fronts: number[][]): void {
    for (let i = 0; i < fronts.length; i++) {
      const front = fronts[i]
      if (!front || front.length === 0) continue

      for (let j = 0; j < front.length; j++) {
        const candidate = population[front[j]!]!
        candidate.crowdingDistance = 0
      }

      if (front.length <= 2) {
        for (let j = 0; j < front.length; j++) {
          const candidate = population[front[j]!]!
          candidate.crowdingDistance = Number.POSITIVE_INFINITY
        }
        continue
      }

      for (let k = 0; k < OBJECTIVE_KEYS.length; k++) {
        const key = OBJECTIVE_KEYS[k]!
        const sorted = [...front].sort((a, b) => population[a]!.scores[key] - population[b]!.scores[key])
        const first = population[sorted[0]!]!
        const last = population[sorted[sorted.length - 1]!]!
        first.crowdingDistance = Number.POSITIVE_INFINITY
        last.crowdingDistance = Number.POSITIVE_INFINITY

        const minValue = first.scores[key]
        const maxValue = last.scores[key]
        const denominator = maxValue - minValue
        if (denominator <= 1e-9) {
          continue
        }

        for (let s = 1; s < sorted.length - 1; s++) {
          const current = population[sorted[s]!]!
          if (!Number.isFinite(current.crowdingDistance)) continue
          const prev = population[sorted[s - 1]!]!
          const next = population[sorted[s + 1]!]!
          current.crowdingDistance += (next.scores[key] - prev.scores[key]) / denominator
        }
      }
    }
  }

  private selectElitist(
    population: RuntimeCandidate[],
    fronts: number[][],
    populationSize: number,
  ): RuntimeCandidate[] {
    const next: RuntimeCandidate[] = []

    for (let i = 0; i < fronts.length; i++) {
      const front = fronts[i] ?? []
      if (next.length + front.length <= populationSize) {
        for (let j = 0; j < front.length; j++) {
          next.push(population[front[j]!]!)
        }
        continue
      }

      const sortedByCrowding = [...front].sort((a, b) => {
        const da = population[a]!.crowdingDistance
        const db = population[b]!.crowdingDistance
        if (da === db) {
          return a - b
        }
        return db - da
      })

      const slots = populationSize - next.length
      for (let j = 0; j < slots && j < sortedByCrowding.length; j++) {
        next.push(population[sortedByCrowding[j]!]!)
      }
      break
    }

    return next.map((candidate) => ({
      ...candidate,
      genome: { ...candidate.genome },
      scores: { ...candidate.scores },
      dominates: [...candidate.dominates],
    }))
  }

  private makeOffspring(
    parents: RuntimeCandidate[],
    input: EvoTunerInput,
    rng: SeededRng,
    generation: number,
  ): RuntimeCandidate[] {
    const offspring: RuntimeCandidate[] = []
    const targetSize = input.populationSize

    for (let i = 0; i < targetSize; i++) {
      const parentA = this.tournamentSelect(parents, input, rng)
      const parentB = this.tournamentSelect(parents, input, rng)

      const crossed = this.crossoverGenome(parentA.genome, parentB.genome, rng, input.crossoverRate)
      const childGenome = this.mutateGenome(
        crossed,
        input.paramRanges,
        rng,
        generation,
        input.generations,
        input.mutationRate,
      )

      offspring.push(this.createRuntimeCandidate(`g${generation + 1}-c${i}`, childGenome))
    }

    return offspring
  }

  private tournamentSelect(
    population: RuntimeCandidate[],
    input: EvoTunerInput,
    rng: SeededRng,
  ): RuntimeCandidate {
    const a = population[rng.nextInt(population.length)]!
    const b = population[rng.nextInt(population.length)]!

    if (a.rank !== b.rank) {
      return a.rank < b.rank ? a : b
    }
    if (a.crowdingDistance !== b.crowdingDistance) {
      return a.crowdingDistance > b.crowdingDistance ? a : b
    }

    const wa = weightedObjectiveScore(a.scores, input.objectiveWeights, input.constraints)
    const wb = weightedObjectiveScore(b.scores, input.objectiveWeights, input.constraints)
    return wa >= wb ? a : b
  }

  private crossoverGenome(
    a: WorldGenome,
    b: WorldGenome,
    rng: SeededRng,
    crossoverRate: number,
  ): WorldGenome {
    if (!rng.chance(crossoverRate)) {
      return { ...a }
    }

    const alpha = rng.nextFloat()
    return {
      plantBaseGrowth: interpolate(a.plantBaseGrowth, b.plantBaseGrowth, alpha),
      plantDecay: interpolate(a.plantDecay, b.plantDecay, alpha),
      initialBiomass: interpolate(a.initialBiomass, b.initialBiomass, alpha),
      reproductionThreshold: interpolate(a.reproductionThreshold, b.reproductionThreshold, alpha),
      metabolismScale: interpolate(a.metabolismScale, b.metabolismScale, alpha),
      eventRate: interpolate(a.eventRate, b.eventRate, alpha),
      droughtSeverity: interpolate(a.droughtSeverity, b.droughtSeverity, alpha),
      rainSeverity: interpolate(a.rainSeverity, b.rainSeverity, alpha),
      tempVariance: interpolate(a.tempVariance, b.tempVariance, alpha),
      humidityVariance: interpolate(a.humidityVariance, b.humidityVariance, alpha),
      predatorEnableTick: Math.round(interpolate(a.predatorEnableTick, b.predatorEnableTick, alpha)),
    }
  }

  private mutateGenome(
    genome: WorldGenome,
    ranges: WorldGenesisParamRanges,
    rng: SeededRng,
    generation: number,
    maxGenerations: number,
    baseMutationRate: number,
  ): WorldGenome {
    const out: WorldGenome = { ...genome }
    const progress = generation / Math.max(1, maxGenerations - 1)

    const mutationRate = clamp(
      interpolate(baseMutationRate * 1.35, baseMutationRate * 0.65, progress),
      0.01,
      0.95,
    )
    const mutationScale = interpolate(0.24, 0.06, progress)

    for (let i = 0; i < GENOME_KEYS.length; i++) {
      const key = GENOME_KEYS[i]!
      if (!rng.chance(mutationRate)) {
        continue
      }

      const range = ranges[key]
      const span = range.max - range.min
      const noise = (rng.nextFloat() + rng.nextFloat() - 1) * span * mutationScale
      const mutated = Number(out[key]) + noise
      const clamped = clamp(mutated, range.min, range.max)
      out[key] = key === 'predatorEnableTick' ? Math.round(clamped) : clamped
    }

    return out
  }

  private selectBestCandidate(
    population: RuntimeCandidate[],
    input: EvoTunerInput,
  ): RuntimeCandidate {
    let best = population[0]
    let bestScore = Number.NEGATIVE_INFINITY

    for (let i = 0; i < population.length; i++) {
      const candidate = population[i]
      if (!candidate) continue
      const score = weightedObjectiveScore(candidate.scores, input.objectiveWeights, input.constraints)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      } else if (score === bestScore && best && candidate.rank < best.rank) {
        best = candidate
      }
    }

    return best!
  }
}
