import { SeededRng } from '../../core/SeededRng'

export type DietType = 0 | 1 | 2

export type Genome = {
  metabolismRate: number
  moveCost: number
  preferredTemp: number
  tempTolerance: number
  preferredHumidity: number
  humidityTolerance: number
  aggression: number
  reproductionThreshold: number
  reproductionCost: number
  perceptionRadius: number
  dietType: DietType
  efficiency: number
  maxEnergy: number
  maxAge: number
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function gaussianLike(rng: SeededRng): number {
  // Somma di uniformi ~ distribuzione pseudo-gaussiana in [-1,1].
  let s = 0
  for (let i = 0; i < 6; i++) {
    s += rng.nextFloat()
  }
  return (s - 3) / 3
}

export function createRandomGenome(rng: SeededRng): Genome {
  return {
    metabolismRate: clamp(0.55 + rng.nextFloat() * 1.25, 0.25, 2.0),
    moveCost: clamp(0.35 + rng.nextFloat() * 1.15, 0.2, 2.0),
    preferredTemp: clamp(rng.nextFloat(), 0, 1),
    tempTolerance: clamp(0.1 + rng.nextFloat() * 0.4, 0.05, 0.6),
    preferredHumidity: clamp(rng.nextFloat(), 0, 1),
    humidityTolerance: clamp(0.1 + rng.nextFloat() * 0.4, 0.05, 0.6),
    aggression: clamp(rng.nextFloat(), 0, 1),
    reproductionThreshold: clamp(0.45 + rng.nextFloat() * 0.45, 0.35, 0.95),
    reproductionCost: clamp(0.14 + rng.nextFloat() * 0.34, 0.08, 0.6),
    perceptionRadius: clamp(1 + Math.floor(rng.nextFloat() * 6), 1, 6),
    dietType: 0,
    efficiency: clamp(0.75 + rng.nextFloat() * 0.6, 0.5, 1.8),
    maxEnergy: clamp(95 + rng.nextFloat() * 90, 80, 240),
    maxAge: clamp(220 + rng.nextFloat() * 480, 150, 1000),
  }
}

export function mutate(base: Genome, rng: SeededRng, mutationRate = 0.07): Genome {
  const n = (): number => gaussianLike(rng)
  const rate = clamp(mutationRate, 0, 0.5)
  const m = (value: number): number => n() * value * (rate / 0.07 || 0)

  const mutated: Genome = {
    metabolismRate: clamp(base.metabolismRate + m(0.08), 0.2, 2.2),
    moveCost: clamp(base.moveCost + m(0.08), 0.15, 2.2),
    preferredTemp: clamp(base.preferredTemp + m(0.05), 0, 1),
    tempTolerance: clamp(base.tempTolerance + m(0.035), 0.03, 0.7),
    preferredHumidity: clamp(base.preferredHumidity + m(0.05), 0, 1),
    humidityTolerance: clamp(base.humidityTolerance + m(0.035), 0.03, 0.7),
    aggression: clamp(base.aggression + m(0.06), 0, 1),
    reproductionThreshold: clamp(base.reproductionThreshold + m(0.045), 0.3, 0.97),
    reproductionCost: clamp(base.reproductionCost + m(0.04), 0.06, 0.75),
    perceptionRadius: clamp(Math.round(base.perceptionRadius + m(0.8)), 1, 6),
    dietType: base.dietType,
    efficiency: clamp(base.efficiency + m(0.08), 0.35, 2.2),
    maxEnergy: clamp(base.maxEnergy + m(12), 70, 260),
    maxAge: clamp(base.maxAge + m(45), 120, 1200),
  }

  if (rng.nextFloat() < 0.03 + rate * 0.2) {
    mutated.dietType = rng.nextFloat() < 0.5 ? 0 : 2
  }

  return mutated
}

function distanceNorm(
  valueA: number,
  valueB: number,
  min: number,
  max: number,
): number {
  const span = Math.max(1e-6, max - min)
  return Math.abs(valueA - valueB) / span
}

export function geneticDistance(a: Genome, b: Genome): number {
  let d = 0
  d += distanceNorm(a.metabolismRate, b.metabolismRate, 0.2, 2.2)
  d += distanceNorm(a.moveCost, b.moveCost, 0.15, 2.2)
  d += distanceNorm(a.preferredTemp, b.preferredTemp, 0, 1)
  d += distanceNorm(a.tempTolerance, b.tempTolerance, 0.03, 0.7)
  d += distanceNorm(a.preferredHumidity, b.preferredHumidity, 0, 1)
  d += distanceNorm(a.humidityTolerance, b.humidityTolerance, 0.03, 0.7)
  d += distanceNorm(a.aggression, b.aggression, 0, 1)
  d += distanceNorm(a.reproductionThreshold, b.reproductionThreshold, 0.3, 0.97)
  d += distanceNorm(a.reproductionCost, b.reproductionCost, 0.06, 0.75)
  d += distanceNorm(a.perceptionRadius, b.perceptionRadius, 1, 6)
  d += distanceNorm(a.efficiency, b.efficiency, 0.35, 2.2)
  d += distanceNorm(a.maxEnergy, b.maxEnergy, 70, 260)
  d += distanceNorm(a.maxAge, b.maxAge, 120, 1200)
  d += a.dietType === b.dietType ? 0 : 0.4
  return d
}

export function genomeSummary(genome: Genome): string {
  return [
    `met:${genome.metabolismRate.toFixed(2)}`,
    `move:${genome.moveCost.toFixed(2)}`,
    `repThr:${genome.reproductionThreshold.toFixed(2)}`,
    `eff:${genome.efficiency.toFixed(2)}`,
  ].join(' ')
}
