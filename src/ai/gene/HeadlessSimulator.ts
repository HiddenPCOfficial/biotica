import { SeededRng } from './SeededRng'
import type { WorldGenome } from './schemas'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

type PendingShock = {
  applyTick: number
  baselineFauna: number
  baselineFlora: number
}

export type HeadlessSimulationInput = {
  seed: number
  genome: WorldGenome
  ticks: number
}

export type HeadlessSimulationResult = {
  ticks: number
  initial: {
    flora: number
    fauna: number
    biodiversity: number
  }
  final: {
    flora: number
    fauna: number
    biodiversity: number
  }
  series: {
    flora: number[]
    fauna: number[]
    biodiversity: number[]
    biomass: number[]
  }
  zeroPopulationTicks: number
  catastropheRecoveries: number[]
}

/**
 * Simulatore headless breve e deterministico per valutare candidati NSGA-II.
 */
export class HeadlessSimulator {
  run(input: HeadlessSimulationInput): HeadlessSimulationResult {
    const ticks = Math.max(30, Math.floor(input.ticks))
    const rng = new SeededRng(input.seed)

    let flora = clamp(0.3 + input.genome.initialBiomass * 0.8, 0.02, 1.6)
    let herbivore = clamp(0.24 + input.genome.initialBiomass * 0.28, 0.02, 1.5)
    let scavenger = clamp(0.16 + (1.2 - input.genome.reproductionThreshold) * 0.17, 0.02, 1.2)
    let predator = 0
    let humidity = 0.52
    let temperature = 0.5
    let hazard = 0

    let droughtPulse = 0
    let rainPulse = 0
    let volcanoPulse = 0

    const seriesFlora: number[] = []
    const seriesFauna: number[] = []
    const seriesBiodiversity: number[] = []
    const seriesBiomass: number[] = []

    const catastropheRecoveries: number[] = []
    const pendingShocks: PendingShock[] = []

    let zeroPopulationTicks = 0

    const plannedDroughtTick = Math.max(8, Math.floor(ticks * 0.34))
    const plannedVolcanoTick = Math.max(16, Math.floor(ticks * 0.67))

    const computeBiodiversity = (): number => {
      let guilds = 0
      if (flora > 0.08) guilds += 1
      if (herbivore > 0.05) guilds += 1
      if (scavenger > 0.05) guilds += 1
      if (predator > 0.05) guilds += 1
      return guilds / 4
    }

    const baselineFauna = herbivore + scavenger + predator
    const initialBiodiversity = computeBiodiversity()

    for (let tick = 0; tick < ticks; tick++) {
      // Eventi stocastici deterministici controllati da genome.eventRate
      const eventChance = clamp(0.002 + input.genome.eventRate * 0.004, 0, 0.035)
      if (rng.chance(eventChance)) {
        const roll = rng.nextFloat()
        if (roll < 0.4) {
          droughtPulse += 0.18 + input.genome.droughtSeverity * 0.42
          pendingShocks.push({
            applyTick: tick + 42,
            baselineFauna: herbivore + scavenger + predator,
            baselineFlora: flora,
          })
        } else if (roll < 0.85) {
          rainPulse += 0.14 + input.genome.rainSeverity * 0.36
        } else {
          volcanoPulse += 0.08 + input.genome.droughtSeverity * 0.22
          pendingShocks.push({
            applyTick: tick + 50,
            baselineFauna: herbivore + scavenger + predator,
            baselineFlora: flora,
          })
        }
      }

      // Catastrofi sintetiche fisse per misurare tolerance/recovery.
      if (tick === plannedDroughtTick) {
        droughtPulse += 0.35 + input.genome.droughtSeverity * 0.35
        pendingShocks.push({
          applyTick: tick + 55,
          baselineFauna: herbivore + scavenger + predator,
          baselineFlora: flora,
        })
      }
      if (tick === plannedVolcanoTick) {
        volcanoPulse += 0.26 + input.genome.droughtSeverity * 0.28
        pendingShocks.push({
          applyTick: tick + 65,
          baselineFauna: herbivore + scavenger + predator,
          baselineFlora: flora,
        })
      }

      const seasonal = Math.sin((tick / Math.max(1, ticks - 1)) * Math.PI * 2)
      const tempNoise = (rng.nextFloat() - 0.5) * input.genome.tempVariance * 0.24
      const humNoise = (rng.nextFloat() - 0.5) * input.genome.humidityVariance * 0.24

      droughtPulse *= 0.93
      rainPulse *= 0.91
      volcanoPulse *= 0.9

      temperature = clamp(
        0.5 + seasonal * 0.12 + tempNoise + volcanoPulse * 0.35 - droughtPulse * 0.12,
        0,
        1,
      )
      humidity = clamp(
        0.5 + seasonal * -0.08 + humNoise + rainPulse * 0.33 - droughtPulse * 0.37,
        0,
        1,
      )
      hazard = clamp(volcanoPulse * 0.9 + droughtPulse * 0.42, 0, 1)

      const tempStress = Math.abs(temperature - 0.54)
      const climateSuitability = clamp(1 - tempStress * 1.8, 0, 1)

      const growth =
        input.genome.plantBaseGrowth * (0.18 + humidity * 0.46 + climateSuitability * 0.24) * (1 - flora * 0.35)
      const decay = input.genome.plantDecay * (0.08 + hazard * 0.42) * flora
      const herbivoreConsumption = herbivore * (0.02 + 0.05 * input.genome.metabolismScale)
      const scavengerConsumption = scavenger * (0.008 + 0.01 * input.genome.metabolismScale)

      flora += growth - decay - herbivoreConsumption - scavengerConsumption
      flora = clamp(flora, 0, 2.2)

      const foodAvailability = clamp(flora / 1.2, 0, 1.5)
      const herbivoreBirthPressure = smoothstep(0.2, 0.85, foodAvailability)
      const herbivoreBirth =
        herbivore *
        (0.007 + herbivoreBirthPressure * 0.04) *
        (1.18 - input.genome.reproductionThreshold * 0.65)
      const herbivoreDeath =
        herbivore *
        (0.006 + input.genome.metabolismScale * 0.015 + hazard * 0.02 + (1 - humidity) * 0.008)

      if (tick >= input.genome.predatorEnableTick) {
        predator = Math.max(predator, 0.04 + input.genome.metabolismScale * 0.02)
      }

      const predationPressure = predator * (0.02 + 0.04 * input.genome.metabolismScale)
      herbivore += herbivoreBirth - herbivoreDeath - predationPressure
      herbivore = clamp(herbivore, 0, 2.2)

      const carrion = clamp(herbivoreDeath + predationPressure + hazard * 0.02, 0, 1)
      const scavengerBirth = scavenger * (0.005 + carrion * 0.05)
      const scavengerDeath = scavenger * (0.007 + input.genome.metabolismScale * 0.012 + hazard * 0.018)
      scavenger += scavengerBirth - scavengerDeath
      scavenger = clamp(scavenger, 0, 1.6)

      const preyPool = clamp(herbivore * 0.7 + scavenger * 0.5, 0, 2)
      const predatorBirth = predator * (0.003 + preyPool * 0.026)
      const predatorDeath = predator * (0.008 + input.genome.metabolismScale * 0.014 + hazard * 0.02)
      predator += predatorBirth - predatorDeath
      predator = clamp(predator, 0, 1.4)

      const fauna = herbivore + scavenger + predator
      if (fauna <= 0.02) {
        zeroPopulationTicks += 1
      }

      const biodiversity = computeBiodiversity()
      const biomass = clamp(flora * 0.62 + fauna * 0.38, 0, 2.5)

      seriesFlora.push(flora)
      seriesFauna.push(fauna)
      seriesBiodiversity.push(biodiversity)
      seriesBiomass.push(biomass)

      for (let i = pendingShocks.length - 1; i >= 0; i--) {
        const shock = pendingShocks[i]
        if (!shock) continue
        if (tick < shock.applyTick) continue

        const faunaRecovery =
          shock.baselineFauna <= 0.0001
            ? 1
            : clamp((herbivore + scavenger + predator) / shock.baselineFauna, 0, 1.4)
        const floraRecovery =
          shock.baselineFlora <= 0.0001
            ? 1
            : clamp(flora / shock.baselineFlora, 0, 1.4)

        catastropheRecoveries.push(clamp((faunaRecovery * 0.65 + floraRecovery * 0.35) / 1.2, 0, 1))
        pendingShocks.splice(i, 1)
      }
    }

    const finalFauna = herbivore + scavenger + predator
    const finalBiodiversity = computeBiodiversity()

    return {
      ticks,
      initial: {
        flora: clamp(0.3 + input.genome.initialBiomass * 0.8, 0.02, 1.6),
        fauna: baselineFauna,
        biodiversity: initialBiodiversity,
      },
      final: {
        flora,
        fauna: finalFauna,
        biodiversity: finalBiodiversity,
      },
      series: {
        flora: seriesFlora,
        fauna: seriesFauna,
        biodiversity: seriesBiodiversity,
        biomass: seriesBiomass,
      },
      zeroPopulationTicks,
      catastropheRecoveries,
    }
  }
}
