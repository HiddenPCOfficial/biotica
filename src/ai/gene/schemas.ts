import { z } from 'zod'

export const NumericRangeSchema = z
  .object({
    min: z.number().finite(),
    max: z.number().finite(),
  })
  .refine((value) => value.max >= value.min, 'range max must be >= min')

export const WorldGenomeSchema = z.object({
  plantBaseGrowth: z.number().finite(),
  plantDecay: z.number().finite(),
  initialBiomass: z.number().finite(),
  reproductionThreshold: z.number().finite(),
  metabolismScale: z.number().finite(),
  eventRate: z.number().finite(),
  droughtSeverity: z.number().finite(),
  rainSeverity: z.number().finite(),
  tempVariance: z.number().finite(),
  humidityVariance: z.number().finite(),
  predatorEnableTick: z.number().int().nonnegative(),
})

export const WorldGenesisParamRangesSchema = z.object({
  plantBaseGrowth: NumericRangeSchema,
  plantDecay: NumericRangeSchema,
  initialBiomass: NumericRangeSchema,
  reproductionThreshold: NumericRangeSchema,
  metabolismScale: NumericRangeSchema,
  eventRate: NumericRangeSchema,
  droughtSeverity: NumericRangeSchema,
  rainSeverity: NumericRangeSchema,
  tempVariance: NumericRangeSchema,
  humidityVariance: NumericRangeSchema,
  predatorEnableTick: NumericRangeSchema,
})

export const WorldGenesisConstraintsSchema = z.object({
  minSurvivalScore: z.number().min(0).max(1),
  minBiodiversityScore: z.number().min(0).max(1),
  minResourceBalanceScore: z.number().min(0).max(1),
})

export const ObjectiveWeightsSchema = z.object({
  survivalScore: z.number().nonnegative(),
  biodiversityScore: z.number().nonnegative(),
  stabilityScore: z.number().nonnegative(),
  resourceBalanceScore: z.number().nonnegative(),
  catastropheTolerance: z.number().nonnegative(),
})

export const ObjectiveScoresSchema = z.object({
  survivalScore: z.number().min(0).max(1),
  biodiversityScore: z.number().min(0).max(1),
  stabilityScore: z.number().min(0).max(1),
  resourceBalanceScore: z.number().min(0).max(1),
  catastropheTolerance: z.number().min(0).max(1),
})

export const CandidateSchema = z.object({
  id: z.string(),
  genome: WorldGenomeSchema,
  scores: ObjectiveScoresSchema,
  rank: z.number().int().nonnegative(),
  crowdingDistance: z.number().finite(),
})

export const EvoTunerInputSchema = z.object({
  seed: z.number().int(),
  paramRanges: WorldGenesisParamRangesSchema,
  constraints: WorldGenesisConstraintsSchema,
  objectiveWeights: ObjectiveWeightsSchema,
  simTicks: z.number().int().min(120).max(20000).default(420),
  populationSize: z.number().int().min(8).max(64).default(18),
  generations: z.number().int().min(2).max(12).default(4),
  validationSeeds: z.number().int().min(1).max(8).default(2),
  mutationRate: z.number().min(0).max(1).default(0.15),
  crossoverRate: z.number().min(0).max(1).default(0.7),
})

export const ParetoSampleSchema = z.object({
  id: z.string(),
  rank: z.number().int().nonnegative(),
  crowdingDistance: z.number().finite(),
  genome: WorldGenomeSchema,
  scores: ObjectiveScoresSchema,
  weightedScore: z.number().finite(),
})

export const WorldGenesisReportSchema = z.object({
  bestScores: ObjectiveScoresSchema,
  paretoFrontSample: z.array(ParetoSampleSchema),
  chosenCandidateGenome: WorldGenomeSchema,
  reasonCodes: z.array(z.string()),
})

export const WorldGenesisResultSchema = z.object({
  bestConfig: WorldGenomeSchema,
  report: WorldGenesisReportSchema,
})

export type NumericRange = z.infer<typeof NumericRangeSchema>
export type WorldGenome = z.infer<typeof WorldGenomeSchema>
export type WorldGenesisParamRanges = z.infer<typeof WorldGenesisParamRangesSchema>
export type WorldGenesisConstraints = z.infer<typeof WorldGenesisConstraintsSchema>
export type ObjectiveWeights = z.infer<typeof ObjectiveWeightsSchema>
export type ObjectiveScores = z.infer<typeof ObjectiveScoresSchema>
export type Candidate = z.infer<typeof CandidateSchema>
export type EvoTunerInput = z.infer<typeof EvoTunerInputSchema>
export type ParetoSample = z.infer<typeof ParetoSampleSchema>
export type WorldGenesisReport = z.infer<typeof WorldGenesisReportSchema>
export type WorldGenesisResult = z.infer<typeof WorldGenesisResultSchema>

export const DEFAULT_PARAM_RANGES: WorldGenesisParamRanges = {
  plantBaseGrowth: { min: 0.4, max: 2.8 },
  plantDecay: { min: 0.05, max: 0.8 },
  initialBiomass: { min: 0.2, max: 0.88 },
  reproductionThreshold: { min: 0.65, max: 1.5 },
  metabolismScale: { min: 0.55, max: 1.8 },
  eventRate: { min: 0.15, max: 2.2 },
  droughtSeverity: { min: 0, max: 1 },
  rainSeverity: { min: 0, max: 1 },
  tempVariance: { min: 0.05, max: 0.95 },
  humidityVariance: { min: 0.05, max: 0.95 },
  predatorEnableTick: { min: 40, max: 1400 },
}

export const DEFAULT_CONSTRAINTS: WorldGenesisConstraints = {
  minSurvivalScore: 0.42,
  minBiodiversityScore: 0.35,
  minResourceBalanceScore: 0.32,
}

export const DEFAULT_OBJECTIVE_WEIGHTS: ObjectiveWeights = {
  survivalScore: 1.0,
  biodiversityScore: 0.8,
  stabilityScore: 1.2,
  resourceBalanceScore: 1.0,
  catastropheTolerance: 0.6,
}
