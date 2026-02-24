import { weightedObjectiveScore } from './EcoObjectives'
import {
  WorldGenesisReportSchema,
  type Candidate,
  type ObjectiveWeights,
  type WorldGenesisConstraints,
  type WorldGenesisReport,
} from './schemas'

export type RankedCandidate = Candidate & {
  weightedScore: number
}

function cloneCandidate(candidate: RankedCandidate): RankedCandidate {
  return {
    id: candidate.id,
    rank: candidate.rank,
    crowdingDistance: candidate.crowdingDistance,
    weightedScore: candidate.weightedScore,
    genome: { ...candidate.genome },
    scores: { ...candidate.scores },
  }
}

export function buildReasonCodes(
  candidate: RankedCandidate,
  constraints: WorldGenesisConstraints,
): string[] {
  const scores = candidate.scores
  const out: string[] = []

  if (scores.survivalScore >= constraints.minSurvivalScore) {
    out.push('SURVIVAL_OK')
  } else {
    out.push('SURVIVAL_LOW')
  }

  if (scores.biodiversityScore >= constraints.minBiodiversityScore) {
    out.push('BIODIVERSITY_OK')
  } else {
    out.push('BIODIVERSITY_LOW')
  }

  if (scores.resourceBalanceScore >= constraints.minResourceBalanceScore) {
    out.push('RESOURCE_BALANCE_OK')
  } else {
    out.push('RESOURCE_BALANCE_LOW')
  }

  if (scores.stabilityScore >= 0.7) {
    out.push('STABILITY_HIGH')
  } else if (scores.stabilityScore >= 0.45) {
    out.push('STABILITY_MEDIUM')
  } else {
    out.push('STABILITY_LOW')
  }

  if (scores.catastropheTolerance >= 0.68) {
    out.push('CATASTROPHE_RESILIENT')
  } else if (scores.catastropheTolerance >= 0.45) {
    out.push('CATASTROPHE_PARTIAL')
  } else {
    out.push('CATASTROPHE_FRAGILE')
  }

  if (candidate.genome.eventRate < 0.35) {
    out.push('LOW_EVENT_PRESSURE')
  } else if (candidate.genome.eventRate > 1.6) {
    out.push('HIGH_EVENT_PRESSURE')
  }

  if (candidate.genome.metabolismScale > 1.3 && scores.resourceBalanceScore < 0.55) {
    out.push('METABOLISM_HEAVY_COST')
  }

  return out
}

export function buildWorldGenesisReport(params: {
  bestCandidate: RankedCandidate
  paretoFront: RankedCandidate[]
  weights: ObjectiveWeights
  constraints: WorldGenesisConstraints
  sampleSize?: number
}): WorldGenesisReport {
  const sampleSize = Math.max(3, Math.min(12, Math.floor(params.sampleSize ?? 8)))
  const frontSorted = [...params.paretoFront]
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      if (a.weightedScore !== b.weightedScore) return b.weightedScore - a.weightedScore
      return b.crowdingDistance - a.crowdingDistance
    })
    .slice(0, sampleSize)
    .map((candidate) => {
      const weightedScore = weightedObjectiveScore(candidate.scores, params.weights, params.constraints)
      return {
        id: candidate.id,
        rank: candidate.rank,
        crowdingDistance: candidate.crowdingDistance,
        genome: { ...candidate.genome },
        scores: { ...candidate.scores },
        weightedScore,
      }
    })

  const report = {
    bestScores: { ...params.bestCandidate.scores },
    paretoFrontSample: frontSorted,
    chosenCandidateGenome: { ...params.bestCandidate.genome },
    reasonCodes: buildReasonCodes(params.bestCandidate, params.constraints),
  }

  return WorldGenesisReportSchema.parse(report)
}

export function rankWithWeight(
  candidate: Candidate,
  weights: ObjectiveWeights,
  constraints: WorldGenesisConstraints,
): RankedCandidate {
  return {
    ...cloneCandidate({ ...candidate, weightedScore: 0 }),
    weightedScore: weightedObjectiveScore(candidate.scores, weights, constraints),
  }
}
