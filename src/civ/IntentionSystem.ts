import type { SeededRng } from '../core/SeededRng'
import type { Agent, AgentIntent, Faction, ReasonCode } from './types'

export type IntentPerception = {
  tick: number
  agent: Agent
  faction: Faction
  hunger: number
  waterNeed: number
  hazard: number
  fertility: number
  humidity: number
  canBuild: boolean
  hasTradePartner: boolean
  inventoryRichness: number
  nearResourceNode: number
}

export type IntentSelection = {
  intent: AgentIntent
  ranked: Array<{ intent: AgentIntent; score: number }>
  reasonCodes: ReasonCode[]
  emotionalTone: 'calm' | 'focused' | 'urgent' | 'alarmed'
}

type IntentWeights = Record<AgentIntent, number>

const INTENTS: AgentIntent[] = [
  'explore',
  'gather',
  'hunt',
  'build',
  'fortify',
  'migrate',
  'farm',
  'trade',
  'defend',
  'invent',
  'write',
  'negotiate',
  'expand_territory',
  'domesticate_species',
]

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function createZeroWeights(): IntentWeights {
  return {
    explore: 0,
    gather: 0,
    hunt: 0,
    build: 0,
    fortify: 0,
    migrate: 0,
    farm: 0,
    trade: 0,
    defend: 0,
    invent: 0,
    write: 0,
    negotiate: 0,
    expand_territory: 0,
    domesticate_species: 0,
  }
}

function roleBias(agent: Agent, intent: AgentIntent): number {
  switch (agent.role) {
    case 'Scout':
      if (intent === 'explore') return 0.62
      if (intent === 'expand_territory') return 0.26
      return 0
    case 'Farmer':
      if (intent === 'farm') return 0.56
      if (intent === 'gather') return 0.34
      if (intent === 'domesticate_species') return 0.16
      return 0
    case 'Builder':
      if (intent === 'build') return 0.6
      if (intent === 'fortify') return 0.38
      return 0
    case 'Leader':
      if (intent === 'negotiate') return 0.3
      if (intent === 'expand_territory') return 0.35
      if (intent === 'defend') return 0.24
      return 0
    case 'Scribe':
      if (intent === 'write') return 0.62
      if (intent === 'invent') return 0.38
      return 0
    case 'Guard':
      if (intent === 'defend') return 0.66
      if (intent === 'fortify') return 0.42
      if (intent === 'hunt') return 0.12
      return 0
    case 'Trader':
      if (intent === 'trade') return 0.72
      if (intent === 'negotiate') return 0.44
      return 0
    case 'Elder':
      if (intent === 'write') return 0.34
      if (intent === 'build') return 0.18
      if (intent === 'defend') return 0.12
      return 0
    default:
      return 0
  }
}

/**
 * Selettore intent guidato da contesto reale + RL leggero per agente.
 */
export class IntentionSystem {
  private readonly rlByAgentId = new Map<string, IntentWeights>()

  selectIntent(
    perception: IntentPerception,
    rng: SeededRng,
    cooldownPenalty: (intent: AgentIntent) => number,
  ): IntentSelection {
    const agent = perception.agent
    const faction = perception.faction
    const rl = this.getOrCreateWeights(agent.id)
    const c = faction.cultureParams

    const scored: Array<{ intent: AgentIntent; score: number }> = []

    for (let i = 0; i < INTENTS.length; i++) {
      const intent = INTENTS[i]
      if (!intent) continue

      let score = 0.08 + roleBias(agent, intent)
      score += rl[intent]

      const hunger = clamp(perception.hunger, 0, 1)
      const waterNeed = clamp(perception.waterNeed, 0, 1)
      const hazard = clamp(perception.hazard, 0, 1)
      const fertility = clamp(perception.fertility, 0, 1)
      const humidity = clamp(perception.humidity, 0, 1)
      const nearResource = clamp(perception.nearResourceNode, 0, 1)
      const inventoryRichness = clamp(perception.inventoryRichness, 0, 1)

      if (intent === 'gather' || intent === 'hunt' || intent === 'farm') {
        score += hunger * 1.35
      }
      if (intent === 'migrate') {
        score += waterNeed * 0.82 + (1 - humidity) * 0.44 + hazard * 0.25
      }
      if (intent === 'defend' || intent === 'fortify') {
        score += hazard * 1.08
      }
      if (intent === 'build' || intent === 'invent') {
        score += (1 - hunger) * 0.32 + fertility * 0.28 + inventoryRichness * 0.52
      }
      if (intent === 'trade' || intent === 'negotiate') {
        score += perception.hasTradePartner ? 0.55 : -0.5
      }
      if (intent === 'write') {
        score += faction.literacyLevel >= 2 ? 0.42 : -0.9
      }
      if (intent === 'domesticate_species') {
        score += nearResource * 0.36 + fertility * 0.18
      }
      if (intent === 'expand_territory') {
        score += c.aggression * 0.42 + c.curiosity * 0.16 + (1 - hazard) * 0.12
      }
      if (intent === 'explore') {
        score += c.curiosity * 0.52 + (1 - nearResource) * 0.16
      }
      if (intent === 'build' && !perception.canBuild) {
        score -= 0.62
      }
      if (intent === 'farm' && fertility < 0.2) {
        score -= 0.4
      }

      score += c.collectivism * (intent === 'build' || intent === 'fortify' ? 0.24 : 0)
      score += c.spirituality * (intent === 'write' ? 0.14 : 0)
      score += c.tradeAffinity * (intent === 'trade' ? 0.24 : 0)
      score += c.aggression * (intent === 'defend' || intent === 'expand_territory' ? 0.2 : 0)

      score -= cooldownPenalty(intent) * 1.18
      score += (rng.nextFloat() - 0.5) * 0.04

      scored.push({ intent, score })
    }

    scored.sort((a, b) => b.score - a.score)
    const winner = scored[0]?.intent ?? 'explore'

    const reasonCodes = this.buildReasonCodes(perception, winner)
    return {
      intent: winner,
      ranked: scored.slice(0, 5),
      reasonCodes,
      emotionalTone: this.resolveTone(perception),
    }
  }

  applyReward(agentId: string, intent: AgentIntent, reward: number): void {
    if (!Number.isFinite(reward)) {
      return
    }
    const rl = this.getOrCreateWeights(agentId)
    const alpha = 0.07
    rl[intent] = clamp(rl[intent] + reward * alpha, -1.4, 1.4)
  }

  private getOrCreateWeights(agentId: string): IntentWeights {
    const existing = this.rlByAgentId.get(agentId)
    if (existing) {
      return existing
    }
    const created = createZeroWeights()
    this.rlByAgentId.set(agentId, created)
    return created
  }

  private buildReasonCodes(perception: IntentPerception, intent: AgentIntent): ReasonCode[] {
    const out: ReasonCode[] = []
    if (perception.hunger > 0.55) out.push('SEEK_FOOD')
    if (perception.waterNeed > 0.55) out.push('SEEK_WATER')
    if (perception.hazard > 0.42) out.push('AVOID_HAZARD')

    switch (intent) {
      case 'build':
        out.push('BUILD_INFRA')
        break
      case 'fortify':
        out.push('FORTIFY_BORDER')
        break
      case 'migrate':
        out.push('MIGRATE_PRESSURE')
        break
      case 'farm':
      case 'gather':
      case 'hunt':
        out.push('COLLECT_RESOURCES')
        break
      case 'defend':
        out.push('DEFEND_TERRITORY')
        break
      case 'trade':
        out.push('TRADE_OPPORTUNITY')
        break
      case 'invent':
        out.push('INVENT_TECH')
        break
      case 'write':
        out.push('WRITE_RECORD')
        break
      case 'negotiate':
        out.push('NEGOTIATE_RELATION')
        break
      case 'expand_territory':
        out.push('EXPAND_INFLUENCE')
        break
      case 'domesticate_species':
        out.push('DOMESTICATE_NEED')
        break
      case 'explore':
      default:
        out.push('EXPLORE_FRONTIER')
        break
    }

    if (out.length === 0) {
      out.push('PLAN_CONTINUITY')
    }
    return out
  }

  private resolveTone(
    perception: IntentPerception,
  ): 'calm' | 'focused' | 'urgent' | 'alarmed' {
    if (perception.hazard >= 0.64) return 'alarmed'
    if (perception.hunger >= 0.7 || perception.waterNeed >= 0.72) return 'urgent'
    if (perception.fertility > 0.35 && perception.inventoryRichness > 0.3) return 'focused'
    return 'calm'
  }
}
