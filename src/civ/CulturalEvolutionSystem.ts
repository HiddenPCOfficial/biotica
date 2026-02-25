import type { SeededRng } from '../core/SeededRng'
import type { WorldState } from '../world/types'
import type {
  CivStateLabel,
  CultureHistoryPoint,
  CultureStrategy,
  Faction,
} from './types'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function smooth(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha
}

type LocalClimateSample = {
  fertility: number
  hazard: number
  humidity: number
  temperature: number
}

export type CulturalEvolutionInput = {
  tick: number
  world: WorldState
  faction: Faction
  population: number
  memberPositions: Array<{ x: number; y: number }>
  territoryClaimRatio: number
  resourceScarcity: number
  externalPressure: number
  disasterPressure: number
  warPressure: number
}

export type CulturalEvolutionResult = {
  changed: boolean
  notes: string[]
  strategyChanged: boolean
  movedCapital?: {
    x: number
    y: number
    reason: string
  }
  historyPoint?: CultureHistoryPoint
}

/**
 * Evoluzione culturale graduale e deterministica:
 * - adatta parametri in base a clima, risorse, guerra/disastri
 * - aggiorna strategia e pratiche emergenti
 * - propone eventuale spostamento capitale in stress estremo
 */
export class CulturalEvolutionSystem {
  stepFaction(input: CulturalEvolutionInput, rng: SeededRng): CulturalEvolutionResult {
    const { faction, world, tick } = input
    const notes: string[] = []
    const climate = this.sampleLocalClimate(world, faction.homeCenterX, faction.homeCenterY, 5)

    const climateStress = clamp(
      Math.abs(climate.temperature - 0.56) * 0.7 +
        Math.abs(climate.humidity - 0.58) * 0.52 +
        climate.hazard * 0.88,
      0,
      1,
    )

    const scarcity = clamp(input.resourceScarcity, 0, 1)
    const externalPressure = clamp(input.externalPressure, 0, 1)
    const disasterPressure = clamp(input.disasterPressure, 0, 1)
    const warPressure = clamp(input.warPressure, 0, 1)
    const claimRatio = clamp(input.territoryClaimRatio, 0, 1)

    const targetCollectivism = clamp(0.24 + scarcity * 0.4 + disasterPressure * 0.2 + (1 - claimRatio) * 0.2, 0, 1)
    const targetAggression = clamp(0.12 + warPressure * 0.52 + externalPressure * 0.34 - faction.cultureParams.tradeAffinity * 0.2, 0, 1)
    const targetSpirituality = clamp(0.1 + disasterPressure * 0.36 + climateStress * 0.28 + faction.cultureParams.tradition * 0.22, 0, 1)
    const targetCuriosity = clamp(0.2 + (1 - scarcity) * 0.42 + (1 - warPressure) * 0.18 - disasterPressure * 0.2, 0, 1)
    const targetAdaptation = clamp(0.16 + climateStress * 0.44 + disasterPressure * 0.22 + (1 - claimRatio) * 0.22, 0, 1)
    const targetTechOrientation = clamp(0.2 + targetCuriosity * 0.36 + (1 - scarcity) * 0.2 + faction.techLevel / 22, 0, 1)

    const alpha = 0.045
    const oldCollectivism = faction.cultureParams.collectivism
    const oldAggression = faction.cultureParams.aggression
    const oldSpirituality = faction.cultureParams.spirituality
    const oldCuriosity = faction.cultureParams.curiosity
    const oldAdaptation = faction.cultureParams.environmentalAdaptation
    const oldTechOrientation = faction.cultureParams.techOrientation

    faction.cultureParams.collectivism = smooth(oldCollectivism, targetCollectivism, alpha)
    faction.cultureParams.aggression = smooth(oldAggression, targetAggression, alpha)
    faction.cultureParams.spirituality = smooth(oldSpirituality, targetSpirituality, alpha)
    faction.cultureParams.curiosity = smooth(oldCuriosity, targetCuriosity, alpha)
    faction.cultureParams.environmentalAdaptation = smooth(oldAdaptation, targetAdaptation, alpha)
    faction.cultureParams.techOrientation = smooth(oldTechOrientation, targetTechOrientation, alpha)

    const previousStrategy = faction.adaptationStrategy
    const nextStrategy = this.pickStrategy(
      faction.cultureParams.collectivism,
      faction.cultureParams.aggression,
      faction.cultureParams.curiosity,
      scarcity,
      warPressure,
      disasterPressure,
    )
    faction.adaptationStrategy = nextStrategy

    faction.dominantPractices = this.pickPractices(
      nextStrategy,
      faction.cultureParams,
      climate,
      scarcity,
      disasterPressure,
    )

    const priorState = faction.state
    faction.state = this.pickFactionState(input.population, faction.techLevel, faction.literacyLevel)

    const literacySignal = clamp(
      faction.techLevel / 12 * 0.45 +
        faction.cultureParams.techOrientation * 0.3 +
        faction.cultureParams.collectivism * 0.12 +
        (1 - scarcity) * 0.13,
      0,
      1,
    )
    const desiredLiteracy = clamp(Math.floor(literacySignal * 6), 0, 5) as Faction['literacyLevel']
    if (desiredLiteracy > faction.literacyLevel && tick % 180 === 0) {
      faction.literacyLevel = Math.min(5, faction.literacyLevel + 1) as Faction['literacyLevel']
      faction.writing.literacyLevel = faction.literacyLevel
      notes.push(`LITERACY_UP_${faction.literacyLevel}`)
    }

    const currentSymbolTarget = 4 + faction.literacyLevel * 3
    if (faction.writing.symbolSet.length < currentSymbolTarget) {
      const toAdd = currentSymbolTarget - faction.writing.symbolSet.length
      const base = ['ka', 'ru', 'ti', 'en', 'sa', 'lo', 'mi', 'vek', 'dor', 'sha', 'ne', 'ir']
      for (let i = 0; i < toAdd; i++) {
        const token = base[(faction.writing.symbolSet.length + i + rng.nextInt(base.length)) % base.length]
        if (!token) continue
        const candidate = `${token}${(faction.writing.symbolSet.length + i) % 7}`
        if (!faction.writing.symbolSet.includes(candidate)) {
          faction.writing.symbolSet.push(candidate)
        }
      }
    }

    let movedCapital: CulturalEvolutionResult['movedCapital']
    if (
      tick - faction.lastCultureShiftTick >= 900 &&
      input.memberPositions.length > 0 &&
      (disasterPressure > 0.66 || claimRatio < 0.16)
    ) {
      const nextCapital = this.pickCapitalCandidate(world, input.memberPositions)
      if (
        nextCapital &&
        (Math.abs(nextCapital.x - faction.homeCenterX) + Math.abs(nextCapital.y - faction.homeCenterY) >= 5)
      ) {
        faction.homeCenterX = nextCapital.x
        faction.homeCenterY = nextCapital.y
        faction.lastCultureShiftTick = tick
        movedCapital = {
          x: nextCapital.x,
          y: nextCapital.y,
          reason: disasterPressure > 0.66 ? 'DISASTER_RELOCATION' : 'LOW_TERRITORY_CONTROL',
        }
        notes.push(`CAPITAL_MOVE_${movedCapital.reason}`)
      }
    }

    if (priorState !== faction.state) {
      notes.push(`STATE_${priorState}_TO_${faction.state}`)
    }
    if (previousStrategy !== faction.adaptationStrategy) {
      notes.push(`STRATEGY_${previousStrategy}_TO_${faction.adaptationStrategy}`)
    }

    const deltaNorm =
      Math.abs(oldCollectivism - faction.cultureParams.collectivism) +
      Math.abs(oldAggression - faction.cultureParams.aggression) +
      Math.abs(oldSpirituality - faction.cultureParams.spirituality) +
      Math.abs(oldCuriosity - faction.cultureParams.curiosity) +
      Math.abs(oldAdaptation - faction.cultureParams.environmentalAdaptation) +
      Math.abs(oldTechOrientation - faction.cultureParams.techOrientation)
    const changed = deltaNorm >= 0.006 || notes.length > 0

    let historyPoint: CultureHistoryPoint | undefined
    if (changed && tick % 120 === 0) {
      historyPoint = {
        tick,
        collectivism: faction.cultureParams.collectivism,
        aggression: faction.cultureParams.aggression,
        spirituality: faction.cultureParams.spirituality,
        curiosity: faction.cultureParams.curiosity,
        environmentalAdaptation: faction.cultureParams.environmentalAdaptation,
        techOrientation: faction.cultureParams.techOrientation,
        strategy: faction.adaptationStrategy,
        practices: [...faction.dominantPractices],
      }
      faction.cultureHistory.push(historyPoint)
      if (faction.cultureHistory.length > 240) {
        faction.cultureHistory.splice(0, faction.cultureHistory.length - 240)
      }
    }

    return {
      changed,
      notes,
      strategyChanged: previousStrategy !== nextStrategy,
      movedCapital,
      historyPoint,
    }
  }

  private pickStrategy(
    collectivism: number,
    aggression: number,
    curiosity: number,
    scarcity: number,
    warPressure: number,
    disasterPressure: number,
  ): CultureStrategy {
    if (warPressure > 0.62 && aggression > 0.58) {
      return 'offensive'
    }
    if (disasterPressure > 0.56 && scarcity > 0.46) {
      return 'migration'
    }
    if (collectivism > 0.62 && aggression < 0.45) {
      return 'defensive'
    }
    if (curiosity > 0.62 && scarcity > 0.54) {
      return 'nomadic'
    }
    return 'balanced'
  }

  private pickPractices(
    strategy: CultureStrategy,
    params: Faction['cultureParams'],
    climate: LocalClimateSample,
    scarcity: number,
    disasterPressure: number,
  ): string[] {
    const practices: string[] = []

    if (strategy === 'defensive') practices.push('fortified_settlement')
    if (strategy === 'offensive') practices.push('military_patrol')
    if (strategy === 'migration') practices.push('seasonal_migration')
    if (strategy === 'nomadic') practices.push('nomadic_camps')

    if (scarcity > 0.55) {
      practices.push('resource_rationing')
    }
    if (climate.fertility > 0.55 && params.collectivism > 0.45) {
      practices.push('intensive_agriculture')
    }
    if (disasterPressure > 0.5 || climate.hazard > 0.45) {
      practices.push('disaster_preparedness')
    }
    if (params.techOrientation > 0.55) {
      practices.push('tech_specialization')
    }
    if (params.spirituality > 0.6) {
      practices.push('ritual_calendar')
    }

    if (practices.length === 0) {
      practices.push('mixed_subsistence')
    }

    return practices.slice(0, 5)
  }

  private pickFactionState(population: number, techLevel: number, literacyLevel: number): CivStateLabel {
    if (population >= 70 && techLevel >= 5 && literacyLevel >= 3) {
      return 'state'
    }
    if (population >= 24 && techLevel >= 2.5) {
      return 'society'
    }
    return 'tribe'
  }

  private sampleLocalClimate(world: WorldState, cx: number, cy: number, radius: number): LocalClimateSample {
    let fertilitySum = 0
    let hazardSum = 0
    let humiditySum = 0
    let temperatureSum = 0
    let count = 0

    const minX = Math.max(0, cx - radius)
    const maxX = Math.min(world.width - 1, cx + radius)
    const minY = Math.max(0, cy - radius)
    const maxY = Math.min(world.height - 1, cy + radius)

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = world.index(x, y)
        fertilitySum += (world.fertility[idx] ?? 0) / 255
        hazardSum += (world.hazard[idx] ?? 0) / 255
        humiditySum += (world.humidity[idx] ?? 0) / 255
        temperatureSum += (world.temperature[idx] ?? 0) / 255
        count++
      }
    }

    if (count <= 0) {
      return {
        fertility: 0,
        hazard: 0,
        humidity: 0,
        temperature: 0,
      }
    }

    return {
      fertility: fertilitySum / count,
      hazard: hazardSum / count,
      humidity: humiditySum / count,
      temperature: temperatureSum / count,
    }
  }

  private pickCapitalCandidate(
    world: WorldState,
    members: Array<{ x: number; y: number }>,
  ): { x: number; y: number } | null {
    let bestScore = Number.NEGATIVE_INFINITY
    let best: { x: number; y: number } | null = null

    for (let i = 0; i < members.length; i++) {
      const member = members[i]
      if (!member) continue
      const idx = world.index(member.x, member.y)
      const fertility = (world.fertility[idx] ?? 0) / 255
      const hazard = (world.hazard[idx] ?? 0) / 255
      const humidity = (world.humidity[idx] ?? 0) / 255
      const score = fertility * 0.55 + humidity * 0.18 - hazard * 0.9
      if (score > bestScore) {
        bestScore = score
        best = { x: member.x, y: member.y }
      }
    }

    return best
  }
}
