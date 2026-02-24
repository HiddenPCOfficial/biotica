import { clampTuningValue, type SimTuning } from '../../sim/SimTuning'
import { markAllDirty, type WorldState } from '../../world/WorldState'
import { computeEcoObjectives, weightedObjectiveScore } from './EcoObjectives'
import { EvoTunerAgent } from './EvoTunerAgent'
import { readGeneAgentConfig, logResolvedGeneAgentConfig, type GeneAgentConfig } from './GeneAgentConfig'
import { HeadlessSimulator } from './HeadlessSimulator'
import {
  DEFAULT_CONSTRAINTS,
  DEFAULT_PARAM_RANGES,
  WorldGenesisResultSchema,
  type ObjectiveWeights,
  type WorldGenesisConstraints,
  type WorldGenesisParamRanges,
  type WorldGenesisReport,
  type WorldGenome,
  type WorldGenesisResult,
} from './schemas'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function clampByte(value: number): number {
  if (value < 0) return 0
  if (value > 255) return 255
  return value | 0
}

function hash2D(seed: number, x: number, y: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1)
  h ^= Math.imul(x | 0, 0x85ebca6b)
  h ^= Math.imul(y | 0, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

export type WorldGenesisGenerateOptions = {
  paramRanges?: Partial<WorldGenesisParamRanges>
  constraints?: Partial<WorldGenesisConstraints>
  objectiveWeights?: Partial<ObjectiveWeights>
}

export type WorldGenesisApplyResult = {
  tuning: SimTuning
}

const DEFAULT_STATIC_WORLD_CONFIG: WorldGenome = {
  plantBaseGrowth: 1.25,
  plantDecay: 0.24,
  initialBiomass: 0.58,
  reproductionThreshold: 1.0,
  metabolismScale: 0.95,
  eventRate: 0.9,
  droughtSeverity: 0.34,
  rainSeverity: 0.52,
  tempVariance: 0.32,
  humidityVariance: 0.36,
  predatorEnableTick: 420,
}

/**
 * World genesis agent deterministico basato su EvoTunerAgent (NON LLM).
 */
export class WorldGenesisAgent {
  private readonly tuner = new EvoTunerAgent()
  private readonly simulator = new HeadlessSimulator()
  private readonly config: GeneAgentConfig

  constructor(config: GeneAgentConfig = readGeneAgentConfig()) {
    this.config = config
    logResolvedGeneAgentConfig(this.config)
  }

  generate(seed: number, options: WorldGenesisGenerateOptions = {}): WorldGenesisResult {
    const ranges = this.mergeRanges(options.paramRanges)
    const constraints: WorldGenesisConstraints = {
      ...DEFAULT_CONSTRAINTS,
      ...(options.constraints ?? {}),
    }
    const objectiveWeights: ObjectiveWeights = {
      ...this.config.objectiveWeights,
      ...(options.objectiveWeights ?? {}),
    }

    const normalizedSeed = seed | 0

    if (!this.config.enabled) {
      return this.buildStaticResult(normalizedSeed, constraints, objectiveWeights)
    }

    return this.tuner.tune({
      seed: normalizedSeed,
      paramRanges: ranges,
      constraints,
      objectiveWeights,
      simTicks: this.config.simTicks,
      populationSize: this.config.populationSize,
      generations: this.config.generations,
      validationSeeds: this.config.validationSeeds,
      mutationRate: this.config.mutationRate,
      crossoverRate: this.config.crossoverRate,
    })
  }

  applyBestConfig(
    world: WorldState,
    currentTuning: SimTuning,
    bestConfig: WorldGenome,
    seed: number,
  ): WorldGenesisApplyResult {
    const width = world.width
    const height = world.height

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = world.index(x, y)

        const baseBiomass = (world.plantBiomass[index] ?? 0) / 255
        const fertility = (world.fertility[index] ?? 0) / 255
        const temperature = world.temperature[index] ?? 0
        const humidity = world.humidity[index] ?? 0

        const targetBiomass = clamp(
          bestConfig.initialBiomass * (0.35 + fertility * 0.9),
          0,
          1,
        )
        const tunedBiomass = baseBiomass * 0.35 + targetBiomass * 0.65
        world.plantBiomass[index] = clampByte(tunedBiomass * 255)

        const nTemp = hash2D(seed ^ 0x6b2f13a1, x, y) - 0.5
        const nHum = hash2D(seed ^ 0x19db11f7, x, y) - 0.5

        const tempDelta =
          nTemp * 255 * bestConfig.tempVariance * 0.18 +
          bestConfig.droughtSeverity * 13 -
          bestConfig.rainSeverity * 5
        const humDelta =
          nHum * 255 * bestConfig.humidityVariance * 0.2 +
          bestConfig.rainSeverity * 16 -
          bestConfig.droughtSeverity * 19

        world.temperature[index] = clampByte(temperature + tempDelta)
        world.humidity[index] = clampByte(humidity + humDelta)

        const hazardBoost =
          bestConfig.droughtSeverity * 28 + Math.max(0, world.temperature[index] / 255 - 0.72) * 34
        world.hazard[index] = clampByte(Math.max(world.hazard[index] ?? 0, hazardBoost))
      }
    }

    markAllDirty(world)

    const tunedReproductionCost = clampTuningValue(
      'reproductionCost',
      currentTuning.reproductionCost * (0.9 + (bestConfig.reproductionThreshold - 1) * 0.22),
    )

    const tuning: SimTuning = {
      ...currentTuning,
      plantBaseGrowth: clampTuningValue('plantBaseGrowth', bestConfig.plantBaseGrowth),
      plantDecay: clampTuningValue('plantDecay', bestConfig.plantDecay),
      baseMetabolism: clampTuningValue('baseMetabolism', bestConfig.metabolismScale),
      reproductionThreshold: clampTuningValue(
        'reproductionThreshold',
        bestConfig.reproductionThreshold,
      ),
      reproductionCost: tunedReproductionCost,
      eventRate: clampTuningValue('eventRate', bestConfig.eventRate),
    }

    return { tuning }
  }

  toOverlaySummary(result: WorldGenesisResult): {
    bestConfig: Record<string, number>
    bestScores: WorldGenesisReport['bestScores']
    paretoFrontSample: Array<{
      id: string
      rank: number
      weightedScore: number
      scores: WorldGenesisReport['paretoFrontSample'][number]['scores']
    }>
    reasonCodes: string[]
  } {
    return {
      bestConfig: { ...result.bestConfig },
      bestScores: { ...result.report.bestScores },
      paretoFrontSample: result.report.paretoFrontSample.map((row) => ({
        id: row.id,
        rank: row.rank,
        weightedScore: row.weightedScore,
        scores: { ...row.scores },
      })),
      reasonCodes: [...result.report.reasonCodes],
    }
  }

  private buildStaticResult(
    seed: number,
    constraints: WorldGenesisConstraints,
    objectiveWeights: ObjectiveWeights,
  ): WorldGenesisResult {
    const genome = { ...DEFAULT_STATIC_WORLD_CONFIG }
    const scores = this.evaluateGenomeScores(seed, genome, this.config.validationSeeds, this.config.simTicks)
    const weightedScore = weightedObjectiveScore(scores, objectiveWeights, constraints)

    return WorldGenesisResultSchema.parse({
      bestConfig: genome,
      report: {
        bestScores: { ...scores },
        paretoFrontSample: [
          {
            id: 'default-static',
            rank: 0,
            crowdingDistance: 0,
            genome: { ...genome },
            scores: { ...scores },
            weightedScore,
          },
        ],
        chosenCandidateGenome: { ...genome },
        reasonCodes: ['GENE_AGENT_DISABLED', 'DEFAULT_STATIC_CONFIG'],
      },
    })
  }

  private evaluateGenomeScores(
    seed: number,
    genome: WorldGenome,
    validationSeeds: number,
    simTicks: number,
  ): WorldGenesisReport['bestScores'] {
    const aggregate = {
      survivalScore: 0,
      biodiversityScore: 0,
      stabilityScore: 0,
      resourceBalanceScore: 0,
      catastropheTolerance: 0,
    }

    for (let i = 0; i < validationSeeds; i++) {
      const sim = this.simulator.run({
        seed: (seed + (i + 1) * 0x9e3779b9) | 0,
        genome,
        ticks: simTicks,
      })
      const scores = computeEcoObjectives(sim)
      aggregate.survivalScore += scores.survivalScore
      aggregate.biodiversityScore += scores.biodiversityScore
      aggregate.stabilityScore += scores.stabilityScore
      aggregate.resourceBalanceScore += scores.resourceBalanceScore
      aggregate.catastropheTolerance += scores.catastropheTolerance
    }

    const inv = 1 / Math.max(1, validationSeeds)
    return {
      survivalScore: aggregate.survivalScore * inv,
      biodiversityScore: aggregate.biodiversityScore * inv,
      stabilityScore: aggregate.stabilityScore * inv,
      resourceBalanceScore: aggregate.resourceBalanceScore * inv,
      catastropheTolerance: aggregate.catastropheTolerance * inv,
    }
  }

  private mergeRanges(patch?: Partial<WorldGenesisParamRanges>): WorldGenesisParamRanges {
    const safe = patch ?? {}
    return {
      plantBaseGrowth: { ...DEFAULT_PARAM_RANGES.plantBaseGrowth, ...(safe.plantBaseGrowth ?? {}) },
      plantDecay: { ...DEFAULT_PARAM_RANGES.plantDecay, ...(safe.plantDecay ?? {}) },
      initialBiomass: { ...DEFAULT_PARAM_RANGES.initialBiomass, ...(safe.initialBiomass ?? {}) },
      reproductionThreshold: {
        ...DEFAULT_PARAM_RANGES.reproductionThreshold,
        ...(safe.reproductionThreshold ?? {}),
      },
      metabolismScale: { ...DEFAULT_PARAM_RANGES.metabolismScale, ...(safe.metabolismScale ?? {}) },
      eventRate: { ...DEFAULT_PARAM_RANGES.eventRate, ...(safe.eventRate ?? {}) },
      droughtSeverity: { ...DEFAULT_PARAM_RANGES.droughtSeverity, ...(safe.droughtSeverity ?? {}) },
      rainSeverity: { ...DEFAULT_PARAM_RANGES.rainSeverity, ...(safe.rainSeverity ?? {}) },
      tempVariance: { ...DEFAULT_PARAM_RANGES.tempVariance, ...(safe.tempVariance ?? {}) },
      humidityVariance: {
        ...DEFAULT_PARAM_RANGES.humidityVariance,
        ...(safe.humidityVariance ?? {}),
      },
      predatorEnableTick: {
        ...DEFAULT_PARAM_RANGES.predatorEnableTick,
        ...(safe.predatorEnableTick ?? {}),
      },
    }
  }
}
