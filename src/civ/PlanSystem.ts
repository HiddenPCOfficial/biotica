import { TileId } from '../game/enums/TileId'
import type { SeededRng } from '../core/SeededRng'
import type { WorldState } from '../world/types'
import type {
  Agent,
  AgentIntent,
  AgentPlan,
  AgentPlanSummary,
  Faction,
  PlanActionStep,
  ReasonCode,
  StructureBlueprint,
} from './types'

export type PlanBuildContext = {
  tick: number
  world: WorldState
  faction: Faction
  agent: Agent
  intent: AgentIntent
  reasonCodes: ReasonCode[]
  rng: SeededRng
}

export type PlanStepOutcome = {
  success: boolean
  progressDelta: number
  atTarget: boolean
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function isHabitable(tile: TileId): boolean {
  return tile !== TileId.DeepWater && tile !== TileId.ShallowWater && tile !== TileId.Lava
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function preferredStructureByIntent(intent: AgentIntent, faction: Faction, agent: Agent): StructureBlueprint {
  if (intent === 'fortify') {
    return faction.cultureParams.aggression > 0.58 ? 'watch_tower' : 'palisade'
  }
  if (intent === 'farm') {
    return 'farm_plot'
  }
  if (intent === 'expand_territory') {
    return faction.cultureParams.aggression > 0.5 ? 'watch_tower' : 'palisade'
  }
  if (faction.cultureParams.spirituality > 0.68 && (agent.role === 'Elder' || agent.role === 'Leader')) {
    return 'shrine'
  }
  if (agent.role === 'Scribe' || agent.role === 'Trader') {
    return 'storage'
  }
  return 'hut'
}

/**
 * Traduce intent in un piano multi-step eseguibile e progressivo.
 */
export class PlanSystem {
  private planCounter = 0

  createPlan(ctx: PlanBuildContext): AgentPlan {
    const buildTarget = this.pickBuildTarget(ctx.world, ctx.faction, ctx.agent, ctx.rng)
    const gatherTarget = this.pickGatherTarget(ctx.world, ctx.agent, ctx.rng)
    const frontierTarget = this.pickFrontierTarget(ctx.world, ctx.faction, ctx.agent, ctx.rng)
    const migrateTarget = this.pickMigrationTarget(ctx.world, ctx.faction, ctx.agent, ctx.rng)
    const structureBlueprint = preferredStructureByIntent(ctx.intent, ctx.faction, ctx.agent)

    const moveHomeStep = this.makeStep({
      actionType: 'move_to',
      goal: 'Explore',
      description: 'Raggiungi il centro della fazione',
      targetX: ctx.faction.homeCenterX,
      targetY: ctx.faction.homeCenterY,
      targetLabel: 'base',
      requiredTicks: 1,
    })

    const steps: PlanActionStep[] = []
    switch (ctx.intent) {
      case 'build':
        steps.push(
          this.makeStep({
            actionType: 'move_to',
            goal: 'Explore',
            description: 'Spostati verso risorse da costruzione',
            targetX: gatherTarget.x,
            targetY: gatherTarget.y,
            targetLabel: gatherTarget.label,
            requiredTicks: 1,
          }),
          this.makeStep({
            actionType: 'gather_resource',
            goal: 'Gather',
            description: 'Raccogli materiali',
            targetX: gatherTarget.x,
            targetY: gatherTarget.y,
            targetLabel: gatherTarget.label,
            requiredTicks: 2,
          }),
          moveHomeStep,
          this.makeStep({
            actionType: 'construct',
            goal: 'Build',
            description: `Costruisci ${structureBlueprint.replace('_', ' ')}`,
            targetX: buildTarget.x,
            targetY: buildTarget.y,
            targetLabel: buildTarget.label,
            requiredTicks: 2,
            structureBlueprint,
          }),
        )
        break
      case 'fortify':
        steps.push(
          this.makeStep({
            actionType: 'move_to',
            goal: 'Explore',
            description: 'Raggiungi il confine vulnerabile',
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 1,
          }),
          this.makeStep({
            actionType: 'fortify_border',
            goal: 'Build',
            description: `Rinforza il confine con ${structureBlueprint === 'watch_tower' ? 'torre' : 'palizzata'}`,
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 3,
            structureBlueprint,
          }),
        )
        break
      case 'migrate':
        steps.push(
          this.makeStep({
            actionType: 'relocate_home',
            goal: 'Explore',
            description: 'Riposiziona il centro civico',
            targetX: migrateTarget.x,
            targetY: migrateTarget.y,
            targetLabel: migrateTarget.label,
            requiredTicks: 2,
          }),
          this.makeStep({
            actionType: 'gather_resource',
            goal: 'Gather',
            description: 'Ricostituisci risorse nel nuovo territorio',
            targetX: migrateTarget.x,
            targetY: migrateTarget.y,
            targetLabel: migrateTarget.label,
            requiredTicks: 1,
          }),
        )
        break
      case 'farm':
        steps.push(
          this.makeStep({
            actionType: 'move_to',
            goal: 'Explore',
            description: 'Individua terreno fertile',
            targetX: gatherTarget.x,
            targetY: gatherTarget.y,
            targetLabel: gatherTarget.label,
            requiredTicks: 1,
          }),
          this.makeStep({
            actionType: 'farm_plot',
            goal: 'Farm',
            description: 'Coltiva e stabilizza la resa',
            targetX: gatherTarget.x,
            targetY: gatherTarget.y,
            targetLabel: gatherTarget.label,
            requiredTicks: 2,
            structureBlueprint: 'farm_plot',
          }),
        )
        break
      case 'trade':
        steps.push(
          moveHomeStep,
          this.makeStep({
            actionType: 'trade_exchange',
            goal: 'Trade',
            description: 'Esegui scambio locale',
            targetX: ctx.faction.homeCenterX,
            targetY: ctx.faction.homeCenterY,
            targetLabel: 'hub locale',
            requiredTicks: 2,
          }),
        )
        break
      case 'defend':
        steps.push(
          this.makeStep({
            actionType: 'move_to',
            goal: 'Explore',
            description: 'Presidia area critica',
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 1,
          }),
          this.makeStep({
            actionType: 'defend_area',
            goal: 'Defend',
            description: 'Difendi il perimetro',
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 2,
          }),
        )
        break
      case 'invent':
        steps.push(
          moveHomeStep,
          this.makeStep({
            actionType: 'invent_tool',
            goal: 'CraftItem',
            description: 'Sperimenta nuovi strumenti',
            targetX: ctx.faction.homeCenterX,
            targetY: ctx.faction.homeCenterY,
            targetLabel: 'officina',
            requiredTicks: 2,
          }),
        )
        break
      case 'write':
        steps.push(
          moveHomeStep,
          this.makeStep({
            actionType: 'write_record',
            goal: 'Write',
            description: 'Registra decisioni e lezioni',
            targetX: ctx.faction.homeCenterX,
            targetY: ctx.faction.homeCenterY,
            targetLabel: 'archivio',
            requiredTicks: 2,
          }),
        )
        break
      case 'negotiate':
        steps.push(
          moveHomeStep,
          this.makeStep({
            actionType: 'negotiate_terms',
            goal: 'Talk',
            description: 'Coordina alleanze e patti',
            targetX: ctx.faction.homeCenterX,
            targetY: ctx.faction.homeCenterY,
            targetLabel: 'consiglio',
            requiredTicks: 1,
          }),
        )
        break
      case 'expand_territory':
        steps.push(
          this.makeStep({
            actionType: 'move_to',
            goal: 'Explore',
            description: 'Apri un nuovo avamposto',
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 1,
          }),
          this.makeStep({
            actionType: 'claim_territory',
            goal: 'Build',
            description: 'Marca il confine con struttura',
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 2,
            structureBlueprint,
          }),
        )
        break
      case 'domesticate_species':
        steps.push(
          this.makeStep({
            actionType: 'move_to',
            goal: 'Explore',
            description: 'Raggiungi area adatta alla domesticazione',
            targetX: gatherTarget.x,
            targetY: gatherTarget.y,
            targetLabel: gatherTarget.label,
            requiredTicks: 1,
          }),
          this.makeStep({
            actionType: 'domesticate',
            goal: 'Farm',
            description: 'Stabilisci routine di domesticazione',
            targetX: gatherTarget.x,
            targetY: gatherTarget.y,
            targetLabel: gatherTarget.label,
            requiredTicks: 2,
          }),
        )
        break
      case 'hunt':
        steps.push(
          this.makeStep({
            actionType: 'move_to',
            goal: 'Explore',
            description: 'Insegui tracce di prede',
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 1,
          }),
          this.makeStep({
            actionType: 'hunt_prey',
            goal: 'Gather',
            description: 'Procura cibo ad alta resa',
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 2,
          }),
        )
        break
      case 'gather':
        steps.push(
          this.makeStep({
            actionType: 'move_to',
            goal: 'Explore',
            description: 'Raggiungi nodo risorse vicino',
            targetX: gatherTarget.x,
            targetY: gatherTarget.y,
            targetLabel: gatherTarget.label,
            requiredTicks: 1,
          }),
          this.makeStep({
            actionType: 'gather_resource',
            goal: 'Gather',
            description: 'Raccogli risorse utili',
            targetX: gatherTarget.x,
            targetY: gatherTarget.y,
            targetLabel: gatherTarget.label,
            requiredTicks: 2,
          }),
        )
        break
      case 'explore':
      default:
        steps.push(
          this.makeStep({
            actionType: 'move_to',
            goal: 'Explore',
            description: 'Esplora il fronte meno noto',
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 1,
          }),
          this.makeStep({
            actionType: 'observe',
            goal: 'Explore',
            description: 'Osserva e aggiorna conoscenza locale',
            targetX: frontierTarget.x,
            targetY: frontierTarget.y,
            targetLabel: frontierTarget.label,
            requiredTicks: 1,
          }),
        )
        break
    }

    return {
      id: `plan-${ctx.agent.id}-${ctx.tick}-${++this.planCounter}`,
      intent: ctx.intent,
      status: 'active',
      createdAtTick: ctx.tick,
      reasonCodes: [...ctx.reasonCodes],
      steps,
      currentStepIndex: 0,
      progress01: 0,
    }
  }

  getCurrentStep(plan: AgentPlan | null): PlanActionStep | null {
    if (!plan || plan.status !== 'active') {
      return null
    }
    return plan.steps[plan.currentStepIndex] ?? null
  }

  applyStepOutcome(plan: AgentPlan | null, outcome: PlanStepOutcome): void {
    if (!plan || plan.status !== 'active') {
      return
    }
    const step = this.getCurrentStep(plan)
    if (!step) {
      plan.status = 'completed'
      plan.progress01 = 1
      return
    }

    step.elapsedTicks += Math.max(0, Math.floor(outcome.progressDelta))

    const reachedTarget = outcome.atTarget
    const actionIsMovement = step.actionType === 'move_to' || step.actionType === 'relocate_home'
    const enoughTicks = step.elapsedTicks >= Math.max(1, step.requiredTicks)
    const overStallCap = step.elapsedTicks >= Math.max(2, step.requiredTicks + 2)
    const shouldComplete =
      (actionIsMovement && reachedTarget) ||
      (!actionIsMovement && enoughTicks && outcome.success) ||
      overStallCap

    if (shouldComplete) {
      step.completed = true
      plan.currentStepIndex += 1
      if (plan.currentStepIndex >= plan.steps.length) {
        plan.status = 'completed'
      }
    }

    const completed = plan.steps.filter((row) => row.completed).length
    plan.progress01 = clamp(
      plan.steps.length > 0 ? completed / plan.steps.length : 1,
      0,
      1,
    )
    if (plan.status === 'completed') {
      plan.progress01 = 1
    }
  }

  summarize(plan: AgentPlan | null): AgentPlanSummary | null {
    if (!plan) {
      return null
    }
    const step = plan.steps[plan.currentStepIndex] ?? null
    return {
      id: plan.id,
      intent: plan.intent,
      status: plan.status,
      currentStepIndex: plan.currentStepIndex,
      totalSteps: plan.steps.length,
      progress01: plan.progress01,
      currentStepDescription: step?.description ?? '-',
      currentStepActionType: step?.actionType ?? null,
      currentStepTargetLabel: step?.targetLabel ?? '-',
    }
  }

  private makeStep(input: Omit<PlanActionStep, 'id' | 'elapsedTicks' | 'completed'>): PlanActionStep {
    return {
      id: `step-${input.actionType}-${input.targetX}-${input.targetY}-${input.requiredTicks}`,
      actionType: input.actionType,
      goal: input.goal,
      description: input.description,
      targetX: input.targetX,
      targetY: input.targetY,
      targetLabel: input.targetLabel,
      requiredTicks: Math.max(1, input.requiredTicks),
      elapsedTicks: 0,
      completed: false,
      structureBlueprint: input.structureBlueprint,
    }
  }

  private pickGatherTarget(world: WorldState, agent: Agent, rng: SeededRng): { x: number; y: number; label: string } {
    const radius = 8
    let bestX = agent.x
    let bestY = agent.y
    let bestScore = Number.NEGATIVE_INFINITY
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const x = agent.x + ox
        const y = agent.y + oy
        if (!world.inBounds(x, y)) continue
        const idx = world.index(x, y)
        const tile = world.tiles[idx] as TileId
        if (!isHabitable(tile)) continue
        const fertility = (world.fertility[idx] ?? 0) / 255
        const hazard = (world.hazard[idx] ?? 0) / 255
        const dist = Math.abs(ox) + Math.abs(oy)
        const score = fertility * 1.2 - hazard * 1.1 - dist * 0.03 + (rng.nextFloat() - 0.5) * 0.05
        if (score > bestScore) {
          bestScore = score
          bestX = x
          bestY = y
        }
      }
    }
    return { x: bestX, y: bestY, label: 'resource-zone' }
  }

  private pickBuildTarget(
    world: WorldState,
    faction: Faction,
    agent: Agent,
    rng: SeededRng,
  ): { x: number; y: number; label: string } {
    const radius = 6
    let bestX = faction.homeCenterX
    let bestY = faction.homeCenterY
    let bestScore = Number.NEGATIVE_INFINITY
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const x = faction.homeCenterX + ox
        const y = faction.homeCenterY + oy
        if (!world.inBounds(x, y)) continue
        const idx = world.index(x, y)
        const tile = world.tiles[idx] as TileId
        if (!isHabitable(tile)) continue
        const fertility = (world.fertility[idx] ?? 0) / 255
        const hazard = (world.hazard[idx] ?? 0) / 255
        const dist = Math.abs(x - agent.x) + Math.abs(y - agent.y)
        const score =
          (1 - hazard) * 0.8 +
          fertility * 0.22 -
          Math.abs(ox + oy) * 0.02 -
          dist * 0.01 +
          (rng.nextFloat() - 0.5) * 0.04
        if (score > bestScore) {
          bestScore = score
          bestX = x
          bestY = y
        }
      }
    }
    return { x: bestX, y: bestY, label: 'build-site' }
  }

  private pickFrontierTarget(
    world: WorldState,
    faction: Faction,
    agent: Agent,
    rng: SeededRng,
  ): { x: number; y: number; label: string } {
    const radiusMin = 4
    const radiusMax = 11
    let bestX = clampInt(agent.x + 1, 0, world.width - 1)
    let bestY = clampInt(agent.y + 1, 0, world.height - 1)
    let bestScore = Number.NEGATIVE_INFINITY
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * Math.PI * 2
      const radius = radiusMin + rng.nextInt(Math.max(1, radiusMax - radiusMin + 1))
      const x = clampInt(faction.homeCenterX + Math.cos(angle) * radius, 0, world.width - 1)
      const y = clampInt(faction.homeCenterY + Math.sin(angle) * radius, 0, world.height - 1)
      const idx = world.index(x, y)
      const tile = world.tiles[idx] as TileId
      if (!isHabitable(tile)) continue
      const hazard = (world.hazard[idx] ?? 0) / 255
      const fertility = (world.fertility[idx] ?? 0) / 255
      const homeDist = Math.abs(x - faction.homeCenterX) + Math.abs(y - faction.homeCenterY)
      const score = homeDist * 0.03 + (1 - hazard) * 0.7 + fertility * 0.15 + (rng.nextFloat() - 0.5) * 0.06
      if (score > bestScore) {
        bestScore = score
        bestX = x
        bestY = y
      }
    }
    return { x: bestX, y: bestY, label: 'frontier' }
  }

  private pickMigrationTarget(
    world: WorldState,
    faction: Faction,
    agent: Agent,
    rng: SeededRng,
  ): { x: number; y: number; label: string } {
    let bestX = faction.homeCenterX
    let bestY = faction.homeCenterY
    let bestScore = Number.NEGATIVE_INFINITY
    for (let i = 0; i < 60; i++) {
      const x = rng.nextInt(world.width)
      const y = rng.nextInt(world.height)
      const idx = world.index(x, y)
      const tile = world.tiles[idx] as TileId
      if (!isHabitable(tile)) continue
      const fertility = (world.fertility[idx] ?? 0) / 255
      const humidity = (world.humidity[idx] ?? 0) / 255
      const hazard = (world.hazard[idx] ?? 0) / 255
      const dist = Math.abs(x - agent.x) + Math.abs(y - agent.y)
      const score = fertility * 0.45 + humidity * 0.4 + (1 - hazard) * 0.9 - dist * 0.003
      if (score > bestScore) {
        bestScore = score
        bestX = x
        bestY = y
      }
    }
    return { x: bestX, y: bestY, label: 'migration-target' }
  }
}
