import type { SeededRng } from '../core/SeededRng'
import type { Agent, Ethnicity, Faction } from './types'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export type EthnicityStepInput = {
  tick: number
  factions: readonly Faction[]
  agents: readonly Agent[]
  existingEthnicities: readonly Ethnicity[]
}

export type EthnicityStepResult = {
  created: Ethnicity[]
  assignments: Array<{ agentId: string; ethnicityId: string }>
  primaryAssignments: Array<{ factionId: string; ethnicityId: string }>
}

const SYMBOL_ROOTS = ['ka', 'ru', 'te', 'sa', 'lo', 'mi', 've', 'dor', 'nel', 'tor']

/**
 * Emergenza etnie deterministica:
 * - nasce solo quando esiste separazione territoriale + divergenza culturale
 * - etnia sempre vincolata a una singola specie
 */
export class EthnicitySystem {
  private ethnicityCounter = 0

  constructor(private readonly seed: number) {}

  reset(existing: readonly Ethnicity[] = []): void {
    let maxCounter = 0
    for (let i = 0; i < existing.length; i++) {
      const ethnicity = existing[i]
      if (!ethnicity) continue
      const tokens = ethnicity.id.split('-')
      const tail = Number(tokens[tokens.length - 1])
      if (Number.isFinite(tail) && tail > maxCounter) {
        maxCounter = tail
      }
    }
    this.ethnicityCounter = maxCounter
  }

  step(input: EthnicityStepInput, rng: SeededRng): EthnicityStepResult {
    const created: Ethnicity[] = []
    const assignments: Array<{ agentId: string; ethnicityId: string }> = []
    const primaryAssignments: Array<{ factionId: string; ethnicityId: string }> = []

    const agentsByFaction = new Map<string, Agent[]>()
    for (let i = 0; i < input.agents.length; i++) {
      const agent = input.agents[i]
      if (!agent) continue
      const list = agentsByFaction.get(agent.factionId)
      if (list) {
        list.push(agent)
      } else {
        agentsByFaction.set(agent.factionId, [agent])
      }
    }

    const ethnicityCountByFaction = new Map<string, number>()
    for (let i = 0; i < input.existingEthnicities.length; i++) {
      const ethnicity = input.existingEthnicities[i]
      if (!ethnicity) continue
      ethnicityCountByFaction.set(
        ethnicity.factionId,
        (ethnicityCountByFaction.get(ethnicity.factionId) ?? 0) + 1,
      )
    }

    for (let i = 0; i < input.factions.length; i++) {
      const faction = input.factions[i]
      if (!faction) continue

      const factionEthnicityCount = ethnicityCountByFaction.get(faction.id) ?? 0
      if (factionEthnicityCount >= 6) {
        continue
      }
      if (faction.members.length < 14 || input.tick - faction.foundedAtTick < 220) {
        continue
      }

      const members = (agentsByFaction.get(faction.id) ?? []).filter(
        (agent) => agent.speciesId === faction.dominantSpeciesId,
      )
      if (members.length < 10) {
        continue
      }

      const distanceThreshold = 8 + Math.min(10, factionEthnicityCount * 2)
      const remoteCandidates: Array<{ agent: Agent; distance: number }> = []
      for (let m = 0; m < members.length; m++) {
        const agent = members[m]
        if (!agent) continue
        const distance = Math.abs(agent.x - faction.homeCenterX) + Math.abs(agent.y - faction.homeCenterY)
        if (distance >= distanceThreshold) {
          remoteCandidates.push({ agent, distance })
        }
      }
      if (remoteCandidates.length < 4) {
        continue
      }

      remoteCandidates.sort((a, b) => {
        if (a.distance !== b.distance) {
          return b.distance - a.distance
        }
        return a.agent.id.localeCompare(b.agent.id)
      })

      let distanceSum = 0
      for (let r = 0; r < remoteCandidates.length; r++) {
        distanceSum += remoteCandidates[r]?.distance ?? 0
      }
      const avgDistance = distanceSum / remoteCandidates.length

      const culturalDivergence = clamp(
        Math.abs(faction.cultureParams.aggression - faction.cultureParams.tradeAffinity) * 0.34 +
          Math.abs(faction.cultureParams.collectivism - faction.cultureParams.curiosity) * 0.28 +
          faction.stress * 0.24 +
          clamp(avgDistance / 35, 0, 1) * 0.34,
        0,
        1,
      )
      if (culturalDivergence < 0.58) {
        continue
      }

      const emergenceChance = clamp(0.015 + culturalDivergence * 0.05, 0.01, 0.08)
      if (!rng.chance(emergenceChance)) {
        continue
      }

      const targetGroupSize = Math.max(4, Math.min(18, Math.floor(remoteCandidates.length * 0.45)))
      const ethnicity = this.createEthnicity(
        faction,
        input.tick,
        factionEthnicityCount,
        culturalDivergence,
      )
      created.push(ethnicity)

      if (!faction.ethnicityId) {
        primaryAssignments.push({ factionId: faction.id, ethnicityId: ethnicity.id })
      }

      for (let r = 0; r < targetGroupSize; r++) {
        const remote = remoteCandidates[r]
        if (!remote) continue
        assignments.push({ agentId: remote.agent.id, ethnicityId: ethnicity.id })
      }
    }

    return {
      created,
      assignments,
      primaryAssignments,
    }
  }

  private createEthnicity(
    faction: Faction,
    tick: number,
    existingCount: number,
    divergence: number,
  ): Ethnicity {
    const id = `eth-${this.seed}-${++this.ethnicityCounter}`
    const symbolRoot = SYMBOL_ROOTS[(this.ethnicityCounter + this.seed + existingCount) % SYMBOL_ROOTS.length] ?? 'ka'
    const symbol = `${symbolRoot}${(tick + existingCount) % 9}`

    const traits: string[] = []
    if (faction.cultureParams.collectivism >= 0.6) {
      traits.push('clan-solidarity')
    }
    if (faction.cultureParams.curiosity >= 0.55) {
      traits.push('frontier-seeking')
    }
    if (faction.cultureParams.tradeAffinity >= 0.55) {
      traits.push('barter-oriented')
    }
    if (faction.cultureParams.aggression >= 0.6) {
      traits.push('martial-guarded')
    }
    if (faction.cultureParams.environmentalAdaptation >= 0.58) {
      traits.push('climate-adaptive')
    }
    if (divergence >= 0.74) {
      traits.push('high-divergence')
    }
    if (traits.length === 0) {
      traits.push('shared-customs')
    }

    return {
      id,
      speciesId: faction.dominantSpeciesId,
      factionId: faction.id,
      name: null,
      symbol,
      culturalTraits: traits.slice(0, 5),
      createdAtTick: tick,
    }
  }
}
