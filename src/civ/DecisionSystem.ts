import type { SeededRng } from '../core/SeededRng'
import { TileId } from '../game/enums/TileId'
import type { WorldState } from '../world/WorldState'
import type { Agent, AgentGoal, Faction, ReasonCode } from './types'

export type AgentDecision = {
  goal: AgentGoal
  targetX: number
  targetY: number
  reasonCodes: ReasonCode[]
  targetLabel: string
}

export type DecisionContext = {
  tick: number
  world: WorldState
  faction: Faction
  canBuild: boolean
  canTalk: boolean
  hasTradePartner: boolean
  factionStress: number
  hasTool: boolean
  inventoryRichness: number
  nearResourceNode: number
}

export type ActionWeights = {
  goalBias: Record<AgentGoal, number>
  hasTool: number
  inventoryRichness: number
  nearResourceNode: number
}

type RewardFeatures = {
  hasTool: boolean
  inventoryRichness: number
  nearResourceNode: number
}

type AgentRlState = {
  weights: ActionWeights
}

const GOALS: AgentGoal[] = [
  'Explore',
  'Gather',
  'Build',
  'Farm',
  'Defend',
  'Trade',
  'Talk',
  'Worship',
  'PickItem',
  'UseItem',
  'CraftItem',
  'EquipItem',
  'Write',
]

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function traitCuriosityProxy(agent: Agent): number {
  return clamp(agent.traits.intelligence * 0.68 + agent.traits.sociability * 0.32, 0, 1)
}

function isBlockedTile(tile: TileId): boolean {
  return tile === TileId.DeepWater || tile === TileId.ShallowWater || tile === TileId.Lava
}

function randomNeighbor(
  x: number,
  y: number,
  width: number,
  height: number,
  rng: SeededRng,
): { x: number; y: number } {
  const choices = [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
    { x: x + 1, y: y + 1 },
    { x: x - 1, y: y - 1 },
    { x: x + 1, y: y - 1 },
    { x: x - 1, y: y + 1 },
  ]

  const start = rng.nextInt(choices.length)
  for (let i = 0; i < choices.length; i++) {
    const item = choices[(start + i) % choices.length]
    if (!item) continue
    if (item.x < 0 || item.y < 0 || item.x >= width || item.y >= height) {
      continue
    }
    return item
  }

  return { x, y }
}

function scoreTile(
  ctx: DecisionContext,
  x: number,
  y: number,
  goal: AgentGoal,
): number {
  const idx = ctx.world.index(x, y)
  const tile = ctx.world.tiles[idx] as TileId
  if (isBlockedTile(tile)) {
    return -999
  }

  const discovered = ctx.faction.knowledgeMap.discovered[idx] === 1
  const fertility = (ctx.faction.knowledgeMap.fertilityModel[idx] ?? 128) / 255
  const hazard = (ctx.faction.knowledgeMap.hazardModel[idx] ?? 128) / 255

  const curiosityBonus = discovered ? 0 : 0.7 * ctx.faction.cultureParams.curiosity
  const tabooPenalty = hazard * (0.6 + ctx.faction.cultureParams.tabooHazard)

  switch (goal) {
    case 'Explore':
      return curiosityBonus - tabooPenalty * 0.6 + fertility * 0.2
    case 'Gather':
    case 'Farm':
      return fertility * 1.6 - tabooPenalty
    case 'Build':
      return fertility * 0.7 - tabooPenalty * 1.2 + (discovered ? 0.2 : -0.3)
    case 'Defend': {
      const homeDx = Math.abs(x - ctx.faction.homeCenterX)
      const homeDy = Math.abs(y - ctx.faction.homeCenterY)
      return 1.1 - (homeDx + homeDy) * 0.08 - tabooPenalty
    }
    case 'Trade':
      return (discovered ? 0.6 : 0.1) + fertility * 0.5 - tabooPenalty * 0.7
    case 'Talk': {
      const homeDx = Math.abs(x - ctx.faction.homeCenterX)
      const homeDy = Math.abs(y - ctx.faction.homeCenterY)
      return 0.8 - (homeDx + homeDy) * 0.05 - tabooPenalty * 0.35
    }
    case 'Worship': {
      const sacredBonus = ctx.faction.cultureParams.sacredBiomes.includes(tile) ? 0.9 : 0
      return sacredBonus + (discovered ? 0.3 : 0) - tabooPenalty
    }
    case 'PickItem':
      return (discovered ? 0.4 : 0.75) + ctx.nearResourceNode * 0.9 - tabooPenalty * 0.6
    case 'UseItem':
      return fertility * 0.55 + (ctx.hasTool ? 0.85 : 0) - tabooPenalty * 0.45
    case 'CraftItem': {
      const homeDx = Math.abs(x - ctx.faction.homeCenterX)
      const homeDy = Math.abs(y - ctx.faction.homeCenterY)
      return ctx.inventoryRichness * 0.85 + (discovered ? 0.22 : -0.18) - (homeDx + homeDy) * 0.04 - tabooPenalty * 0.4
    }
    case 'EquipItem': {
      const homeDx = Math.abs(x - ctx.faction.homeCenterX)
      const homeDy = Math.abs(y - ctx.faction.homeCenterY)
      return ctx.inventoryRichness * 0.72 + (ctx.hasTool ? 0.1 : 0.45) - (homeDx + homeDy) * 0.03 - tabooPenalty * 0.3
    }
    case 'Write': {
      const homeDx = Math.abs(x - ctx.faction.homeCenterX)
      const homeDy = Math.abs(y - ctx.faction.homeCenterY)
      const centerAffinity = clamp(1 - (homeDx + homeDy) * 0.08, 0, 1)
      const literacyBonus = ctx.faction.literacyLevel >= 3 ? 0.24 : ctx.faction.literacyLevel >= 2 ? 0.14 : -0.3
      return centerAffinity + literacyBonus + (discovered ? 0.18 : -0.08) - tabooPenalty * 0.42
    }
    default:
      return -tabooPenalty
  }
}

function baseGoalBias(goal: AgentGoal, agent: Agent, ctx: DecisionContext): number {
  const needFood = agent.energy < 48
  const oldAge = agent.age > 280
  const c = ctx.faction.cultureParams

  switch (goal) {
    case 'Gather':
      return needFood ? 0.75 : 0.1
    case 'Farm':
      return needFood && agent.role === 'Farmer' ? 0.95 : 0.1
    case 'Build':
      return ctx.canBuild ? (agent.role === 'Builder' ? 0.65 : 0.2) : -0.55
    case 'Talk':
      return ctx.canTalk ? (0.16 + agent.traits.sociability * 0.34) : -0.5
    case 'Trade':
      return ctx.hasTradePartner ? (0.08 + c.tradeAffinity * 0.26) : -0.45
    case 'Worship':
      return oldAge || agent.role === 'Elder' || agent.role === 'Leader' ? 0.2 + c.spirituality * 0.22 : c.spirituality * 0.06
    case 'Explore':
      return 0.14 + c.curiosity * 0.24
    case 'Defend':
      return ctx.factionStress > 0.72 ? 0.72 : 0.2 + c.aggression * 0.22
    case 'PickItem':
      return 0.06 + ctx.nearResourceNode * 0.58
    case 'UseItem':
      return 0.05 + (ctx.hasTool ? 0.22 : -0.2)
    case 'CraftItem':
      return 0.08 + ctx.inventoryRichness * 0.4
    case 'EquipItem':
      return ctx.hasTool ? -0.2 : 0.14 + ctx.inventoryRichness * 0.3
    case 'Write':
      if (ctx.faction.literacyLevel < 2) {
        return -0.9
      }
      if (agent.role === 'Scribe') {
        return 0.28 + c.curiosity * 0.22 + c.collectivism * 0.08
      }
      return agent.role === 'Leader' ? 0.14 + c.collectivism * 0.06 : -0.16
    default:
      return 0
  }
}

/**
 * Selettore deterministico goal+target con RL leggero:
 * - pesi azione per agente
 * - reward update locale per azioni item-aware
 */
export class DecisionSystem {
  private readonly rlByAgentId = new Map<string, AgentRlState>()

  decide(agent: Agent, ctx: DecisionContext, rng: SeededRng): AgentDecision {
    const rl = this.getOrCreateRlState(agent)
    let goal: AgentGoal = 'Explore'
    let bestScore = Number.NEGATIVE_INFINITY

    for (let i = 0; i < GOALS.length; i++) {
      const candidate = GOALS[i]
      if (!candidate) continue

      const score = this.scoreGoal(candidate, agent, ctx, rl.weights, rng)
      if (score > bestScore) {
        bestScore = score
        goal = candidate
      }
    }

    const radius =
      goal === 'Explore' || goal === 'Trade'
        ? 4
        : goal === 'Build' || goal === 'CraftItem' || goal === 'Write'
          ? 3
          : goal === 'PickItem'
            ? 2
            : 1
    const target = this.pickTarget(agent, ctx, goal, radius, rng)
    const reasonCodes = this.buildReasonCodes(goal, agent, ctx)

    return {
      goal,
      targetX: target.x,
      targetY: target.y,
      reasonCodes,
      targetLabel: this.targetLabel(goal),
    }
  }

  applyReward(
    agentId: string,
    goal: AgentGoal,
    reward: number,
    features: RewardFeatures,
  ): void {
    if (!Number.isFinite(reward)) {
      return
    }
    const rl = this.rlByAgentId.get(agentId)
    if (!rl) {
      return
    }

    const alpha = 0.055
    rl.weights.goalBias[goal] = clamp(
      rl.weights.goalBias[goal] + reward * alpha,
      -1.6,
      1.6,
    )

    rl.weights.hasTool = clamp(
      rl.weights.hasTool + reward * alpha * 0.35 * (features.hasTool ? 1 : -0.3),
      -1.2,
      1.2,
    )
    rl.weights.inventoryRichness = clamp(
      rl.weights.inventoryRichness + reward * alpha * 0.32 * clamp(features.inventoryRichness, 0, 1),
      -1.2,
      1.2,
    )
    rl.weights.nearResourceNode = clamp(
      rl.weights.nearResourceNode + reward * alpha * 0.33 * clamp(features.nearResourceNode, 0, 1),
      -1.2,
      1.2,
    )
  }

  private scoreGoal(
    goal: AgentGoal,
    agent: Agent,
    ctx: DecisionContext,
    weights: ActionWeights,
    rng: SeededRng,
  ): number {
    const featureScore =
      weights.hasTool * (ctx.hasTool ? 1 : 0) +
      weights.inventoryRichness * clamp(ctx.inventoryRichness, 0, 1) +
      weights.nearResourceNode * clamp(ctx.nearResourceNode, 0, 1)

    const viabilityPenalty = (() => {
      if (goal === 'Build' && !ctx.canBuild) return 0.55
      if (goal === 'Talk' && !ctx.canTalk) return 0.5
      if (goal === 'Trade' && !ctx.hasTradePartner) return 0.45
      if (goal === 'PickItem' && ctx.nearResourceNode <= 0.01) return 0.46
      if (goal === 'UseItem' && !ctx.hasTool) return 0.38
      if (goal === 'CraftItem' && ctx.inventoryRichness <= 0.1) return 0.42
      if (goal === 'EquipItem' && (ctx.hasTool || ctx.inventoryRichness <= 0.05)) return 0.28
      if (goal === 'Write' && ctx.faction.literacyLevel < 2) return 0.72
      if (goal === 'Write' && agent.role !== 'Scribe' && agent.role !== 'Leader') return 0.3
      return 0
    })()

    return (
      baseGoalBias(goal, agent, ctx) +
      weights.goalBias[goal] +
      featureScore -
      viabilityPenalty +
      (rng.nextFloat() - 0.5) * 0.03
    )
  }

  private pickTarget(
    agent: Agent,
    ctx: DecisionContext,
    goal: AgentGoal,
    radius: number,
    rng: SeededRng,
  ): { x: number; y: number } {
    let bestX = agent.x
    let bestY = agent.y
    let bestScore = scoreTile(ctx, agent.x, agent.y, goal) - 0.03

    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const tx = agent.x + ox
        const ty = agent.y + oy
        if (!ctx.world.inBounds(tx, ty)) continue

        const s = scoreTile(ctx, tx, ty, goal) + (rng.nextFloat() - 0.5) * 0.04
        if (s > bestScore) {
          bestScore = s
          bestX = tx
          bestY = ty
        }
      }
    }

    if (bestX === agent.x && bestY === agent.y) {
      return randomNeighbor(agent.x, agent.y, ctx.world.width, ctx.world.height, rng)
    }

    return {
      x: clampInt(bestX, 0, ctx.world.width - 1),
      y: clampInt(bestY, 0, ctx.world.height - 1),
    }
  }

  private getOrCreateRlState(agent: Agent): AgentRlState {
    const existing = this.rlByAgentId.get(agent.id)
    if (existing) {
      return existing
    }

    const goalBias: Record<AgentGoal, number> = {
      Explore: 0.06 + agent.traits.intelligence * 0.08,
      Gather: 0.12 + agent.traits.diligence * 0.1,
      Build: 0.1 + agent.traits.diligence * 0.08,
      Farm: 0.12 + agent.traits.diligence * 0.12,
      Defend: 0.1 + agent.traits.bravery * 0.1,
      Trade: 0.08 + agent.traits.sociability * 0.08,
      Talk: 0.08 + agent.traits.sociability * 0.12,
      Worship: 0.05 + agent.traits.spirituality * 0.1,
      PickItem: 0.09 + traitCuriosityProxy(agent) * 0.04,
      UseItem: 0.08 + agent.traits.intelligence * 0.1,
      CraftItem: 0.1 + agent.traits.intelligence * 0.12,
      EquipItem: 0.07 + agent.traits.bravery * 0.08,
      Write: 0.03 + agent.traits.intelligence * 0.08 + agent.traits.sociability * 0.04,
    }

    const state: AgentRlState = {
      weights: {
        goalBias,
        hasTool: 0.11 + agent.traits.intelligence * 0.12,
        inventoryRichness: 0.1 + agent.traits.diligence * 0.11,
        nearResourceNode: 0.1 + traitCuriosityProxy(agent) * 0.11,
      },
    }
    this.rlByAgentId.set(agent.id, state)
    return state
  }

  private buildReasonCodes(goal: AgentGoal, agent: Agent, ctx: DecisionContext): ReasonCode[] {
    const reasons = new Set<ReasonCode>()

    if (agent.energy < 52) {
      reasons.add('SEEK_FOOD')
    }
    if (agent.waterNeed > 0.42) {
      reasons.add('SEEK_WATER')
    }

    const hazard = (ctx.world.hazard[ctx.world.index(agent.x, agent.y)] ?? 0) / 255
    if (hazard > 0.35 || ctx.factionStress > 0.62) {
      reasons.add('AVOID_HAZARD')
    }

    switch (goal) {
      case 'Explore':
        reasons.add('EXPLORE_FRONTIER')
        break
      case 'Gather':
      case 'Farm':
      case 'PickItem':
        reasons.add('COLLECT_RESOURCES')
        break
      case 'Build':
        reasons.add('BUILD_INFRA')
        break
      case 'Defend':
        reasons.add('DEFEND_TERRITORY')
        break
      case 'Trade':
        reasons.add('TRADE_OPPORTUNITY')
        break
      case 'Talk':
        reasons.add('SOCIAL_COHESION')
        break
      case 'Worship':
        reasons.add('RITUAL_NEED')
        break
      case 'CraftItem':
        reasons.add('CRAFT_UPGRADE')
        break
      case 'EquipItem':
      case 'UseItem':
        reasons.add('EQUIP_TOOL')
        break
      case 'Write':
        reasons.add('WRITE_RECORD')
        break
    }

    if (agent.role === 'Leader') {
      reasons.add('FOLLOW_LEADER')
    }

    return [...reasons]
  }

  private targetLabel(goal: AgentGoal): string {
    switch (goal) {
      case 'Explore':
        return 'frontier'
      case 'Gather':
      case 'Farm':
      case 'PickItem':
        return 'resource_zone'
      case 'Build':
        return 'build_site'
      case 'Defend':
        return 'territory_edge'
      case 'Trade':
        return 'trade_path'
      case 'Talk':
        return 'meeting_point'
      case 'Worship':
        return 'ritual_site'
      case 'CraftItem':
        return 'craft_area'
      case 'EquipItem':
      case 'UseItem':
        return 'equipment_point'
      case 'Write':
        return 'scribe_spot'
      default:
        return 'local_area'
    }
  }
}
