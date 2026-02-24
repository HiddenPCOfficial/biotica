import type { HeadlessSimulationResult } from './HeadlessSimulator'
import type {
  ObjectiveScores,
  ObjectiveWeights,
  WorldGenesisConstraints,
} from './schemas'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  let total = 0
  for (let i = 0; i < values.length; i++) {
    total += values[i] ?? 0
  }
  return total / values.length
}

function variance(values: readonly number[], avg: number): number {
  if (values.length === 0) return 0
  let total = 0
  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0
    const delta = value - avg
    total += delta * delta
  }
  return total / values.length
}

function normalizeVariance(varianceValue: number, avg: number): number {
  if (avg <= 1e-6) {
    return 1
  }
  return clamp(varianceValue / (avg * avg + 1e-6), 0, 3)
}

export function computeEcoObjectives(result: HeadlessSimulationResult): ObjectiveScores {
  const avgFauna = mean(result.series.fauna)
  const avgFlora = mean(result.series.flora)
  const avgBiomass = mean(result.series.biomass)
  const avgBiodiversity = mean(result.series.biodiversity)

  const faunaVar = normalizeVariance(variance(result.series.fauna, avgFauna), avgFauna)
  const floraVar = normalizeVariance(variance(result.series.flora, avgFlora), avgFlora)

  const survivalBase =
    result.initial.fauna <= 1e-6
      ? 1
      : clamp(result.final.fauna / Math.max(0.08, result.initial.fauna), 0, 1.5)
  const survivalPenalty = clamp(result.zeroPopulationTicks / Math.max(1, result.ticks), 0, 1)
  const survivalScore = clamp(survivalBase * 0.8 + (1 - survivalPenalty) * 0.2, 0, 1)

  const biodiversityScore = clamp(
    avgBiodiversity * 0.65 + result.final.biodiversity * 0.35,
    0,
    1,
  )

  const stabilityScore = clamp(1 - (faunaVar * 0.6 + floraVar * 0.4) / 3, 0, 1)

  const biomassCollapsePenalty = avgBiomass < 0.16 ? (0.16 - avgBiomass) / 0.16 : 0
  const biomassOvergrowthPenalty = avgBiomass > 1.45 ? (avgBiomass - 1.45) / 1.45 : 0
  const resourceBalanceScore = clamp(
    1 - biomassCollapsePenalty * 0.75 - biomassOvergrowthPenalty * 0.55,
    0,
    1,
  )

  const catastropheTolerance =
    result.catastropheRecoveries.length > 0
      ? clamp(mean(result.catastropheRecoveries), 0, 1)
      : clamp(0.5 + stabilityScore * 0.5, 0, 1)

  return {
    survivalScore,
    biodiversityScore,
    stabilityScore,
    resourceBalanceScore,
    catastropheTolerance,
  }
}

export function weightedObjectiveScore(
  scores: ObjectiveScores,
  weights: ObjectiveWeights,
  constraints: WorldGenesisConstraints,
): number {
  const weighted =
    scores.survivalScore * weights.survivalScore +
    scores.biodiversityScore * weights.biodiversityScore +
    scores.stabilityScore * weights.stabilityScore +
    scores.resourceBalanceScore * weights.resourceBalanceScore +
    scores.catastropheTolerance * weights.catastropheTolerance

  let penalty = 0
  if (scores.survivalScore < constraints.minSurvivalScore) {
    penalty += (constraints.minSurvivalScore - scores.survivalScore) * 2.4
  }
  if (scores.biodiversityScore < constraints.minBiodiversityScore) {
    penalty += (constraints.minBiodiversityScore - scores.biodiversityScore) * 1.7
  }
  if (scores.resourceBalanceScore < constraints.minResourceBalanceScore) {
    penalty += (constraints.minResourceBalanceScore - scores.resourceBalanceScore) * 1.9
  }

  return weighted - penalty
}
