import { SeededRng } from '../core/SeededRng'
import { TileId } from '../game/enums/TileId'
import { CraftingEvolutionSystem } from '../items/CraftingEvolutionSystem'
import { ItemCatalog, type FrozenItemDefinition } from '../items/ItemCatalog'
import type { ResourceNodeSystem } from '../resources/ResourceNodeSystem'
import type { SpeciesStat } from '../sim/types'
import type { WorldState } from '../world/types'
import { BuildingSystem, type BuildingSystemState } from './BuildingSystem'
import { CooldownIntentManager } from './CooldownIntentManager'
import { CommunicationSystem } from './CommunicationSystem'
import { CulturalEvolutionSystem } from './CulturalEvolutionSystem'
import { DecisionSystem } from './DecisionSystem'
import { DialogueActionBinding } from './DialogueActionBinding'
import { EthnicitySystem } from './EthnicitySystem'
import { IdentityEvolutionSystem } from './IdentityEvolutionSystem'
import { IntentionSystem } from './IntentionSystem'
import { PlanSystem } from './PlanSystem'
import { StructureSystem } from './StructureSystem'
import { TerritorySystem } from './TerritorySystem'
import type {
  Agent,
  AgentGoal,
  AgentIntent,
  AgentInventoryEntry,
  AgentInspectorData,
  AgentPlan,
  AgentRole,
  CivFactionInventoryRow,
  CivGroundItemRow,
  CivItemsSnapshot,
  CivMetricsPoint,
  CivStepResult,
  CivTimelineEntry,
  DialogueRecord,
  Ethnicity,
  EthnicitySummary,
  FactionMemberSummary,
  FactionRelationSeries,
  FactionRelationSummary,
  Faction,
  FactionNarrative,
  FactionSummary,
  EquipmentSlots,
  Inventory,
  MentalLog,
  Note,
  NarrativeRequest,
  GroundItemStack,
  Religion,
  ReligionSummary,
  ReasonCode,
  Structure,
  StructureBlueprint,
  TerritoryMapSnapshot,
  TerritorySummary,
  UtteranceTranslation,
} from './types'

const ROLE_ORDER: AgentRole[] = ['Leader', 'Scout', 'Farmer', 'Builder', 'Scribe', 'Guard', 'Trader']
const CIV_FOUNDATION_POP_THRESHOLD = 24
const CIV_FOUNDATION_INTELLIGENCE_THRESHOLD = 0.42
const CIV_FOUNDATION_STABILITY_THRESHOLD = 0.53

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function clampByte(value: number): number {
  if (value < 0) return 0
  if (value > 255) return 255
  return value | 0
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function isHabitable(tile: TileId): boolean {
  return tile !== TileId.DeepWater && tile !== TileId.ShallowWater && tile !== TileId.Lava
}

function defaultInventory(): Inventory {
  return { food: 30, wood: 12, stone: 8, ore: 2 }
}

function roleByIndex(index: number): AgentRole {
  return ROLE_ORDER[index % ROLE_ORDER.length] ?? 'Scout'
}

function defaultIntentByRole(role: AgentRole): AgentIntent {
  switch (role) {
    case 'Farmer':
      return 'farm'
    case 'Builder':
      return 'build'
    case 'Guard':
      return 'defend'
    case 'Scribe':
      return 'write'
    case 'Trader':
      return 'trade'
    case 'Leader':
      return 'negotiate'
    case 'Elder':
      return 'build'
    case 'Scout':
    default:
      return 'explore'
  }
}

function agentNameFromSeed(seed: number, index: number): string {
  const partsA = ['Ka', 'Li', 'Ro', 'Na', 'Ti', 'Se', 'Va', 'Mu', 'El', 'Do']
  const partsB = ['ran', 'tor', 'mir', 'zen', 'kai', 'lum', 'vek', 'sal', 'dri', 'nos']
  const a = partsA[(seed + index * 3) % partsA.length] ?? 'Ka'
  const b = partsB[(seed * 7 + index * 5) % partsB.length] ?? 'ran'
  return `${a}${b}`
}

function computeSpeciesStability(stat: SpeciesStat): number {
  return clamp(stat.vitality * 0.62 + (1 - stat.eventPressure) * 0.38, 0, 1)
}

function ideologyFromCulture(aggression: number, spirituality: number): string {
  if (aggression > 0.7) return 'espansionismo difensivo'
  if (spirituality > 0.7) return 'tradizione rituale'
  if (aggression < 0.35) return 'cooperazione pragmatica'
  return 'equilibrio comunitario'
}

function deterministicAgentThought(
  goal: AgentGoal,
  role: AgentRole,
  factionName: string,
  hunger: number,
  waterNeed: number,
  hazardStress: number,
  fertility: number,
): string {
  if (hunger > 0.78) {
    return `Serve cibo subito per ${factionName}.`
  }
  if (waterNeed > 0.72) {
    return 'Scorte d acqua insufficienti: priorita approvvigionamento.'
  }
  if (hazardStress > 0.68) {
    return 'Zona instabile: meglio cambiare percorso.'
  }
  if (fertility < 0.22 && (goal === 'Farm' || goal === 'Gather')) {
    return 'Terra povera: cercare suolo piu fertile.'
  }

  switch (goal) {
    case 'Explore':
      return role === 'Scout' ? 'Seguo tracce e segni del terreno.' : 'Esploro confini utili alla fazione.'
    case 'Gather':
      return 'Raccolgo risorse per tenere stabile il villaggio.'
    case 'Build':
      return 'Consolidare strutture adesso riduce rischi futuri.'
    case 'Farm':
      return 'Priorita: aumentare la resa dei campi.'
    case 'Defend':
      return 'Controllo i punti vulnerabili del territorio.'
    case 'Trade':
      return 'Uno scambio ben fatto evita conflitti inutili.'
    case 'Talk':
      return 'Confronto rapido: servono decisioni condivise.'
    case 'Worship':
      return 'Rito collettivo per mantenere coesione.'
    case 'Write':
      return 'Registro eventi e segnali utili alla memoria collettiva.'
    default:
      return 'Osservo e adatto la strategia.'
  }
}

function normalizeItemId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function inventoryTotal(inv: Record<string, number>): number {
  let total = 0
  for (const amount of Object.values(inv)) {
    if (!Number.isFinite(amount) || amount <= 0) continue
    total += amount
  }
  return total
}

function inventoryUniqueCount(inv: Record<string, number>): number {
  let count = 0
  for (const amount of Object.values(inv)) {
    if (!Number.isFinite(amount) || amount <= 0) continue
    count += 1
  }
  return count
}

function incrementItemInventory(
  inv: Record<string, number>,
  itemId: string,
  amount: number,
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    return
  }
  const key = normalizeItemId(itemId)
  if (!key) return
  inv[key] = (inv[key] ?? 0) + amount
}

function decrementItemInventory(
  inv: Record<string, number>,
  itemId: string,
  amount: number,
): boolean {
  if (!Number.isFinite(amount) || amount <= 0) {
    return false
  }
  const key = normalizeItemId(itemId)
  const current = inv[key] ?? 0
  if (current < amount) {
    return false
  }
  const next = current - amount
  if (next <= 0) {
    delete inv[key]
  } else {
    inv[key] = next
  }
  return true
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

type SerializableKnowledgeMap = {
  discovered: number[]
  fertilityModel: number[]
  hazardModel: number[]
}

type SerializableFaction = Omit<Faction, 'knowledgeMap'> & {
  knowledgeMap: SerializableKnowledgeMap
}

export type CivSystemState = {
  factions: SerializableFaction[]
  ethnicities: Ethnicity[]
  religions: Religion[]
  speciesCivFounded: string[]
  pendingIdentityNarrativeByFaction: string[]
  pendingReligionNarrativeByFaction: string[]
  agents: Agent[]
  timeline: CivTimelineEntry[]
  dialogues: DialogueRecord[]
  metrics: CivMetricsPoint[]
  pendingNarratives: NarrativeRequest[]
  groundItems: GroundItemStack[]
  groundItemCounter: number
  lastGroundSpawnTick: number
  notes: Note[]
  noteCounter: number
  factionCounter: number
  agentCounter: number
  timelineCounter: number
  dialogueCounter: number
  itemRngState: number
  building: BuildingSystemState
  cooldowns: Record<string, Record<string, number>>
}

type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Sistema civiltà deterministico:
 * - agenti intelligenti con ruoli e goal
 * - fazioni con cultura/religione/leggi
 * - costruzioni e fog-of-war condivisa
 * - richieste narrative asincrone separate dalla simulazione
 */
export class CivSystem {
  private readonly decisionSystem = new DecisionSystem()
  private readonly buildingSystem = new BuildingSystem()
  private readonly structureSystem = new StructureSystem(this.buildingSystem)
  private readonly communicationSystem = new CommunicationSystem()
  private readonly intentionSystem = new IntentionSystem()
  private readonly planSystem = new PlanSystem()
  private readonly cooldownIntentManager = new CooldownIntentManager()
  private readonly dialogueActionBinding = new DialogueActionBinding()
  private readonly territorySystem: TerritorySystem
  private readonly culturalEvolutionSystem = new CulturalEvolutionSystem()
  private readonly ethnicitySystem: EthnicitySystem
  private readonly identityEvolutionSystem: IdentityEvolutionSystem

  private readonly factions: Faction[] = []
  private readonly factionById = new Map<string, Faction>()
  private readonly ethnicities: Ethnicity[] = []
  private readonly ethnicityById = new Map<string, Ethnicity>()
  private readonly religions: Religion[] = []
  private readonly religionById = new Map<string, Religion>()
  private readonly speciesStatsById = new Map<string, SpeciesStat>()
  private readonly speciesCivFounded = new Set<string>()
  private readonly pendingIdentityNarrativeByFaction = new Set<string>()
  private readonly pendingReligionNarrativeByFaction = new Set<string>()

  private readonly agents: Agent[] = []
  private readonly agentById = new Map<string, Agent>()
  private readonly agentsByTile = new Map<string, Agent[]>()
  private readonly agentsScratch: Agent[] = []
  private readonly newbornScratch: Agent[] = []
  private readonly queryScratch: Agent[] = []

  private readonly timeline: CivTimelineEntry[] = []
  private readonly dialogues: DialogueRecord[] = []
  private readonly metrics: CivMetricsPoint[] = []

  private readonly pendingNarratives: NarrativeRequest[] = []
  private readonly pendingNarrativeKeys = new Set<string>()

  private readonly itemRng: SeededRng

  private itemCatalog: ItemCatalog | null = null
  private craftingSystem: CraftingEvolutionSystem | null = null
  private resourceNodeSystem: ResourceNodeSystem | null = null
  private readonly groundItems: GroundItemStack[] = []
  private readonly groundItemById = new Map<string, GroundItemStack>()
  private groundItemCounter = 0
  private lastGroundSpawnTick = 0
  private readonly notes: Note[] = []
  private readonly noteById = new Map<string, Note>()
  private noteCounter = 0

  private factionCounter = 0
  private agentCounter = 0
  private timelineCounter = 0
  private dialogueCounter = 0

  constructor(
    private readonly seed: number,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.itemRng = new SeededRng((seed ^ 0x1d47b9a5) >>> 0)
    this.territorySystem = new TerritorySystem(width, height)
    this.ethnicitySystem = new EthnicitySystem(seed ^ 0x46ab8cf1)
    this.identityEvolutionSystem = new IdentityEvolutionSystem(seed ^ 0x73c18e29)
  }

  setItemSystems(catalog: ItemCatalog, craftingSystem: CraftingEvolutionSystem): void {
    this.itemCatalog = catalog
    this.craftingSystem = craftingSystem
  }

  setResourceNodeSystem(resourceNodeSystem: ResourceNodeSystem | null): void {
    this.resourceNodeSystem = resourceNodeSystem
  }

  reset(
    world: WorldState,
    rng: SeededRng,
    tick: number,
    speciesStats: readonly SpeciesStat[] = [],
  ): void {
    this.factions.length = 0
    this.factionById.clear()
    this.ethnicities.length = 0
    this.ethnicityById.clear()
    this.religions.length = 0
    this.religionById.clear()
    this.speciesStatsById.clear()
    this.speciesCivFounded.clear()
    this.pendingIdentityNarrativeByFaction.clear()
    this.pendingReligionNarrativeByFaction.clear()
    this.agents.length = 0
    this.agentById.clear()
    this.agentsByTile.clear()
    this.agentsScratch.length = 0
    this.newbornScratch.length = 0
    this.timeline.length = 0
    this.dialogues.length = 0
    this.metrics.length = 0
    this.pendingNarratives.length = 0
    this.pendingNarrativeKeys.clear()
    this.buildingSystem.reset()
    this.cooldownIntentManager.clearAll()
    this.groundItems.length = 0
    this.groundItemById.clear()
    this.groundItemCounter = 0
    this.lastGroundSpawnTick = tick
    this.notes.length = 0
    this.noteById.clear()
    this.noteCounter = 0

    this.factionCounter = 0
    this.agentCounter = 0
    this.timelineCounter = 0
    this.dialogueCounter = 0
    this.itemRng.reseed((this.seed ^ world.seed ^ 0x1d47b9a5) >>> 0)

    this.syncSpeciesStats(speciesStats)
    this.tryFoundCivilizationsFromSpecies(world, rng, tick)
    this.ethnicitySystem.reset(this.ethnicities)
    this.identityEvolutionSystem.reset(this.religions)

    this.seedFactionItemInventories(world, tick)
    this.spawnInitialGroundItems(world, tick)

    this.rebuildTileIndex()
    this.rebuildMembers()
    this.territorySystem.reset(this.factions)
    this.territorySystem.step({
      tick,
      world,
      factions: this.factions,
      agents: this.agents,
      structures: this.buildingSystem.getStructures(),
    })
    this.sampleMetrics(tick)
  }

  step(
    world: WorldState,
    rng: SeededRng,
    tick: number,
    speciesStats: readonly SpeciesStat[] = [],
  ): CivStepResult {
    this.syncSpeciesStats(speciesStats)
    const newlyFounded = this.tryFoundCivilizationsFromSpecies(world, rng, tick)

    if (this.agents.length === 0 || this.factions.length === 0) {
      return {
        changed: newlyFounded > 0,
        births: 0,
        deaths: 0,
        newFactions: newlyFounded,
        talks: 0,
        completedBuildings: 0,
        notesWritten: 0,
      }
    }

    this.rebuildMembers()
    this.rebuildTileIndex()

    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      this.communicationSystem.stepFactionCommunication(faction, tick, rng)
      this.craftingSystem?.stepFaction(faction.id, faction.techLevel, this.itemRng, tick)
    }

    if (this.itemCatalog && tick - this.lastGroundSpawnTick >= 24) {
      this.lastGroundSpawnTick = tick
      this.spawnNaturalGroundItems(world, 1 + Math.floor(this.factions.length * 0.5), tick)
    }
    if (tick % 90 === 0) {
      this.decayGroundItems(tick)
    }

    this.agentsScratch.length = 0
    this.newbornScratch.length = 0

    let births = 0
    let deaths = 0
    let talks = 0
    let newFactions = newlyFounded
    let notesWritten = 0
    let changed = newlyFounded > 0

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i]
      if (!agent) continue

      const faction = this.factionById.get(agent.factionId)
      if (!faction) {
        deaths++
        continue
      }

      agent.age += 1
      agent.energy -= 0.22
      if (!Number.isFinite(agent.hydration)) {
        agent.hydration = 68
      }
      if (!Number.isFinite(agent.waterNeed)) {
        agent.waterNeed = 0.24
      }

      this.discoverAround(world, faction, agent.x, agent.y, 2)

      const canBuild = faction.stockpile.wood + faction.stockpile.stone > 10 && tick - agent.lastDecisionTick >= 5
      const canTalk = tick - agent.lastTalkTick > 120
      const hasTradePartner = this.factions.length > 1
      const decisionFeatures = this.computeDecisionFeatures(agent, faction)
      const perceptionIdx = world.index(agent.x, agent.y)
      const localHazard = (world.hazard[perceptionIdx] ?? 0) / 255
      const localFertility = (world.fertility[perceptionIdx] ?? 0) / 255
      const localHumidity = (world.humidity[perceptionIdx] ?? 0) / 255

      const activeStepBeforeDecision = this.planSystem.getCurrentStep(agent.activePlan)
      const shouldRefreshPlan =
        !agent.activePlan ||
        agent.activePlan.status !== 'active' ||
        !activeStepBeforeDecision ||
        tick - agent.lastDecisionTick >= 12 ||
        (agent.hunger > 0.72 && agent.currentIntent !== 'gather' && agent.currentIntent !== 'farm') ||
        (agent.waterNeed > 0.72 && agent.currentIntent !== 'migrate')

      if (shouldRefreshPlan) {
        const intentSelection = this.intentionSystem.selectIntent(
          {
            tick,
            agent,
            faction,
            hunger: agent.hunger,
            waterNeed: agent.waterNeed,
            hazard: localHazard,
            fertility: localFertility,
            humidity: localHumidity,
            canBuild,
            hasTradePartner,
            inventoryRichness: decisionFeatures.inventoryRichness,
            nearResourceNode: decisionFeatures.nearResourceNode,
          },
          rng,
          (intent) => this.cooldownIntentManager.getPenalty(agent.id, intent, tick),
        )

        const plan = this.planSystem.createPlan({
          tick,
          world,
          faction,
          agent,
          intent: intentSelection.intent,
          reasonCodes: intentSelection.reasonCodes,
          rng,
        })

        agent.currentIntent = intentSelection.intent
        agent.proposedPlan = this.clonePlan(plan)
        agent.activePlan = plan
        const firstStep = plan.steps[0]
        if (firstStep) {
          agent.currentThought = `Intent ${intentSelection.intent}: ${firstStep.description}.`
        }
        agent.mentalState.lastReasonCodes = [...intentSelection.reasonCodes]
        agent.mentalState.emotionalTone = intentSelection.emotionalTone
        agent.mentalState.currentGoal = plan.steps[0]?.goal ?? 'Explore'
        this.cooldownIntentManager.markUsed(
          agent.id,
          intentSelection.intent,
          tick,
          1 + faction.stress * 0.5,
        )
        this.pushMentalLog(agent, tick, intentSelection.intent, intentSelection.reasonCodes)
        agent.lastDecisionTick = tick
      }

      const activeStep = this.planSystem.getCurrentStep(agent.activePlan)
      if (activeStep) {
        agent.currentGoal = activeStep.goal
        agent.goalTargetX = activeStep.targetX
        agent.goalTargetY = activeStep.targetY
        agent.mentalState.currentGoal = activeStep.goal
        agent.mentalState.targetX = activeStep.targetX
        agent.mentalState.targetY = activeStep.targetY
        agent.mentalState.targetLabel = activeStep.targetLabel
      } else if (tick - agent.lastDecisionTick >= 3) {
        const decision = this.decisionSystem.decide(
          agent,
          {
            tick,
            world,
            faction,
            canBuild,
            canTalk,
            hasTradePartner,
            factionStress: faction.stress,
            hasTool: decisionFeatures.hasTool,
            inventoryRichness: decisionFeatures.inventoryRichness,
            nearResourceNode: decisionFeatures.nearResourceNode,
          },
          rng,
        )

        agent.currentGoal = decision.goal
        agent.goalTargetX = decision.targetX
        agent.goalTargetY = decision.targetY
        agent.mentalState.currentGoal = decision.goal
        agent.mentalState.lastReasonCodes = [...decision.reasonCodes]
        agent.mentalState.targetX = decision.targetX
        agent.mentalState.targetY = decision.targetY
        agent.mentalState.targetLabel = decision.targetLabel
        agent.lastDecisionTick = tick
      }

      const moved = this.moveAgentToward(agent, world, agent.goalTargetX, agent.goalTargetY)
      agent.activityState = moved ? 'moving' : 'idle'
      changed = changed || moved

      const idx = world.index(agent.x, agent.y)
      const hazard = (world.hazard[idx] ?? 0) / 255
      const fertility = (world.fertility[idx] ?? 0) / 255
      const humidity = (world.humidity[idx] ?? 0) / 255
      const temperature = (world.temperature[idx] ?? 0) / 255
      const tile = world.tiles[idx] as TileId
      const nearWater = tile === TileId.DeepWater || tile === TileId.ShallowWater

      agent.energy -= hazard * (1.1 + faction.cultureParams.tabooHazard)

      const hydrationGain = humidity * 1.7 + (nearWater ? 4.2 : 0)
      const hydrationLoss = 0.95 + temperature * 1.2 + hazard * 0.8 + (moved ? 0.28 : 0)
      agent.hydration = clamp(agent.hydration + hydrationGain - hydrationLoss, 0, 100)
      agent.waterNeed = clamp(1 - agent.hydration / 100, 0, 1)
      agent.energy -= agent.waterNeed * 1.5

      const currentPlanStep = this.planSystem.getCurrentStep(agent.activePlan)
      let actionSucceeded = false
      let planProgressDelta = moved ? 1 : 0
      let intentReward = moved ? 0.01 : -0.01
      let actionDescription = moved
        ? `si sposta verso ${agent.goalTargetX},${agent.goalTargetY}`
        : 'resta in osservazione'

      if (agent.currentGoal === 'Gather' || agent.currentGoal === 'Farm') {
        agent.activityState = agent.currentGoal === 'Farm' ? 'farming' : 'gathering'

        if (agent.currentGoal === 'Gather' && this.resourceNodeSystem) {
          const toolTags = this.resolveEquippedToolTags(agent)
          const harvest = this.resourceNodeSystem.harvestAt(
            agent.x,
            agent.y,
            toolTags,
            0.8 + agent.traits.diligence * 1.2,
          )

          if (harvest.ok && harvest.materialId) {
            this.applyHarvestToFaction(agent, faction, harvest.materialId, harvest.harvestedAmount)
            this.syncAgentCarryState(agent)
            actionSucceeded = true
            changed = true
            planProgressDelta += 2
            intentReward += 0.12
            actionDescription = `estrae ${harvest.harvestedAmount} ${harvest.materialId}`
          } else if (harvest.reason === 'tool_required') {
            actionDescription = `non puo estrarre: serve ${harvest.requiredToolTag}`
            intentReward -= 0.03
          } else {
            const gain = 1.5 + fertility * 1.8
            agent.energy += gain
            faction.stockpile.food += gain * 0.5
            world.fertility[idx] = clampByte((world.fertility[idx] ?? 0) - 1)
            actionSucceeded = true
            planProgressDelta += 1
            intentReward += 0.04
            actionDescription = 'foraggia risorse alimentari'
          }
        } else {
          const gain = 2.1 + fertility * (agent.role === 'Farmer' ? 3.5 : 2.2)
          agent.energy += gain
          faction.stockpile.food += gain * 0.6
          world.fertility[idx] = clampByte((world.fertility[idx] ?? 0) - 1)
          actionSucceeded = true
          planProgressDelta += 2
          intentReward += 0.11
          actionDescription = agent.currentGoal === 'Farm' ? 'coltiva il campo' : 'raccoglie risorse'
        }
      } else if (agent.currentGoal === 'Build') {
        agent.activityState = 'building'
        const blueprint = currentPlanStep?.structureBlueprint ?? this.resolveBlueprintForAgentIntent(agent)
        if (rng.chance(0.22)) {
          const req = this.structureSystem.requestBuild({
            faction,
            blueprint,
            x: agent.goalTargetX,
            y: agent.goalTargetY,
            world,
            tick,
          })

          if (req.accepted && req.structure) {
            changed = true
            actionSucceeded = true
            planProgressDelta += 2
            intentReward += 0.14
            actionDescription = `costruisce ${this.structureSystem.resolveLabel(req.blueprint)}`
            this.addTimeline({
              tick,
              category: 'build',
              factionId: faction.id,
              message: `${this.getFactionDisplayName(faction)} avvia ${this.structureSystem.resolveLabel(req.blueprint)}`,
              x: req.structure.x,
              y: req.structure.y,
            })
          } else {
            intentReward -= 0.03
            actionDescription = 'prova a costruire senza successo'
          }
        }
      } else if (agent.currentGoal === 'PickItem') {
        agent.activityState = 'gathering'
        const pickedAmount = this.handlePickItemAction(agent, faction, tick)
        if (pickedAmount > 0) {
          changed = true
          actionSucceeded = true
          planProgressDelta += 1
          intentReward += 0.07
          actionDescription = `raccoglie item x${pickedAmount}`
          this.decisionSystem.applyReward(
            agent.id,
            'PickItem',
            0.12 + Math.min(0.16, pickedAmount * 0.06),
            decisionFeatures,
          )
        } else {
          this.decisionSystem.applyReward(agent.id, 'PickItem', -0.05, decisionFeatures)
          intentReward -= 0.03
        }
      } else if (agent.currentGoal === 'UseItem') {
        agent.activityState = 'crafting'
        const useResult = this.handleUseItemAction(agent, faction, hazard)
        if (useResult.used) {
          actionSucceeded = true
          planProgressDelta += 1
          intentReward += 0.05
          actionDescription = 'usa un item per migliorare resa/sicurezza'
          this.decisionSystem.applyReward(agent.id, 'UseItem', useResult.reward, decisionFeatures)
        } else {
          this.decisionSystem.applyReward(agent.id, 'UseItem', -0.06, decisionFeatures)
          intentReward -= 0.02
        }
      } else if (agent.currentGoal === 'CraftItem') {
        agent.activityState = 'crafting'
        const craftResult = this.handleCraftItemAction(agent, faction, tick)
        if (craftResult.crafted) {
          changed = true
          actionSucceeded = true
          planProgressDelta += 2
          intentReward += 0.12
          actionDescription = 'inventa e produce nuovo oggetto'
          this.decisionSystem.applyReward(agent.id, 'CraftItem', craftResult.reward, decisionFeatures)
        } else {
          this.decisionSystem.applyReward(agent.id, 'CraftItem', craftResult.reward, decisionFeatures)
          intentReward -= 0.02
        }
      } else if (agent.currentGoal === 'EquipItem') {
        agent.activityState = 'crafting'
        const equipped = this.handleEquipItemAction(agent, faction)
        if (equipped) {
          actionSucceeded = true
          planProgressDelta += 1
          intentReward += 0.04
          actionDescription = 'equipaggia uno strumento'
          this.decisionSystem.applyReward(agent.id, 'EquipItem', 0.13, decisionFeatures)
        } else {
          this.decisionSystem.applyReward(agent.id, 'EquipItem', -0.04, decisionFeatures)
          intentReward -= 0.02
        }
      } else if (agent.currentGoal === 'Talk' && canTalk && agent.activePlan && agent.activePlan.status === 'active') {
        agent.activityState = 'talking'
        const partner = this.pickTalkPartner(agent, faction.id, rng)
        if (partner && this.createDialogueRecord(tick, faction.id, agent, partner, world, rng)) {
          talks++
          agent.lastTalkTick = tick
          partner.lastTalkTick = tick
          actionSucceeded = true
          planProgressDelta += 1
          intentReward += 0.08
          actionDescription = `coordina il piano con ${partner.name}`
        }
      } else if (agent.currentGoal === 'Trade') {
        agent.activityState = 'trading'
        if (this.applyTrade(agent, faction, rng, tick)) {
          actionSucceeded = true
          planProgressDelta += 2
          intentReward += 0.08
          actionDescription = 'esegue uno scambio'
          this.addTimeline({
            tick,
            category: 'trade',
            factionId: faction.id,
            message: `${this.getFactionDisplayName(faction)} conclude uno scambio locale`,
          })
        } else {
          intentReward -= 0.03
        }
      } else if (agent.currentGoal === 'Worship') {
        agent.activityState = 'worshipping'
        faction.stress = clamp(faction.stress - 0.01, 0, 1)
        actionSucceeded = true
        planProgressDelta += 1
        intentReward += 0.02
        actionDescription = 'esegue un rito comunitario'
        if (rng.chance(0.08)) {
          this.addTimeline({
            tick,
            category: 'religion',
            factionId: faction.id,
            message: `${this.getFactionDisplayName(faction)} celebra un rito comune`,
            x: agent.x,
            y: agent.y,
          })
        }
      } else if (agent.currentGoal === 'Defend') {
        agent.activityState = 'defending'
        actionSucceeded = true
        planProgressDelta += 1
        intentReward += 0.06
        actionDescription = 'presidia il perimetro'
      } else if (agent.currentGoal === 'Write') {
        agent.activityState = 'writing'
        if (this.handleWriteAction(agent, faction, tick, rng)) {
          notesWritten += 1
          changed = true
          actionSucceeded = true
          planProgressDelta += 2
          intentReward += 0.13
          actionDescription = 'scrive note strategiche'
          this.decisionSystem.applyReward(agent.id, 'Write', 0.16, decisionFeatures)
        } else {
          this.decisionSystem.applyReward(agent.id, 'Write', -0.04, decisionFeatures)
          intentReward -= 0.02
        }
      }

      if (currentPlanStep && agent.activePlan) {
        const atPlanTarget =
          agent.x === currentPlanStep.targetX &&
          agent.y === currentPlanStep.targetY
        const relocationStep = currentPlanStep.actionType === 'relocate_home'
        this.planSystem.applyStepOutcome(agent.activePlan, {
          success: actionSucceeded,
          progressDelta: Math.max(1, planProgressDelta),
          atTarget: atPlanTarget,
        })

        if (relocationStep && atPlanTarget) {
          if (faction.homeCenterX !== agent.x || faction.homeCenterY !== agent.y) {
            faction.homeCenterX = agent.x
            faction.homeCenterY = agent.y
            changed = true
            this.addTimeline({
              tick,
              category: 'foundation',
              factionId: faction.id,
              message: `${this.getFactionDisplayName(faction)} migra il centro civico a (${agent.x}, ${agent.y})`,
              x: agent.x,
              y: agent.y,
            })
          }
        }
      }

      this.intentionSystem.applyReward(agent.id, agent.currentIntent, intentReward)
      agent.lastAction = actionDescription
      if (agent.activePlan?.status === 'completed') {
        agent.proposedPlan = null
        agent.activePlan = null
      }

      const ageLoad = clamp(agent.age / 820, 0, 1)
      const hunger = clamp(1 - agent.energy / 120, 0, 1)
      const waterNeed = clamp(agent.waterNeed, 0, 1)
      const hazardStress = clamp(hazard * (0.65 + faction.stress * 0.35), 0, 1)
      const vitality = clamp(
        (1 - hunger) * 0.38 + (1 - waterNeed) * 0.3 + (1 - hazardStress) * 0.2 + (1 - ageLoad) * 0.12,
        0,
        1,
      )

      agent.hunger = hunger
      agent.waterNeed = waterNeed
      agent.hazardStress = hazardStress
      agent.vitality = vitality
      const thoughtBase = deterministicAgentThought(
        agent.currentGoal,
        agent.role,
        this.getFactionDisplayName(faction),
        hunger,
        waterNeed,
        hazardStress,
        fertility,
      )
      agent.currentThought = `${thoughtBase} Azione: ${agent.lastAction}.`
      agent.mentalState.lastAction = agent.activityState
      agent.mentalState.perceivedFoodLevel = clamp(fertility * 0.55 + (1 - hunger) * 0.45, 0, 1)
      agent.mentalState.perceivedThreatLevel = clamp(hazard * 0.7 + faction.stress * 0.3, 0, 1)
      agent.mentalState.stressLevel = clamp(hunger * 0.3 + waterNeed * 0.28 + hazardStress * 0.42, 0, 1)
      agent.mentalState.emotionalTone =
        agent.mentalState.stressLevel > 0.72
          ? 'alarmed'
          : agent.mentalState.stressLevel > 0.52
            ? 'urgent'
            : agent.activityState === 'building' || agent.activityState === 'writing'
              ? 'focused'
              : 'calm'
      agent.mentalState.loyaltyToFaction = clamp(
        agent.mentalState.loyaltyToFaction +
          (faction.cultureParams.collectivism - 0.5) * 0.012 +
          (agent.activityState === 'talking' ? 0.006 : 0) -
          agent.mentalState.stressLevel * 0.004,
        0,
        1,
      )
      if (agent.activityState !== 'idle') {
        agent.lastActionTick = tick
      }
      this.syncAgentCarryState(agent)

      if (this.shouldReproduce(agent, faction, rng)) {
        const childPos = this.findNeighborSpawn(world, agent.x, agent.y, rng)
        const childRole = roleByIndex(this.agentCounter + tick)
        const child = this.createAgent(
          faction.id,
          agent.speciesId,
          childRole,
          childPos.x,
          childPos.y,
          rng,
          agent.ethnicityId,
        )
        child.energy = 60
        child.hydration = 68
        child.age = 0
        child.generation = agent.generation + 1
        this.newbornScratch.push(child)
        births++
        agent.energy -= 18
      }

      if (this.shouldDie(agent)) {
        this.decisionSystem.applyReward(agent.id, agent.currentGoal, -1.4, decisionFeatures)
        this.intentionSystem.applyReward(agent.id, agent.currentIntent, -1.2)
        this.cooldownIntentManager.clear(agent.id)
        this.dropAgentInventoryToGround(agent, tick)
        this.agentById.delete(agent.id)
        deaths++
        continue
      }

      this.agentsScratch.push(agent)
    }

    if (this.newbornScratch.length > 0) {
      for (let i = 0; i < this.newbornScratch.length; i++) {
        const child = this.newbornScratch[i]
        if (!child) continue
        this.agentsScratch.push(child)
        this.agentById.set(child.id, child)
      }
    }

    this.agents.length = 0
    for (let i = 0; i < this.agentsScratch.length; i++) {
      const a = this.agentsScratch[i]
      if (!a) continue
      this.agents.push(a)
    }

    const builders = this.countRole('Builder')
    const buildResult = this.buildingSystem.step(world, tick, 8 + builders)
    if (buildResult.completed.length > 0) {
      changed = true
      for (let i = 0; i < buildResult.completed.length; i++) {
        const structure = buildResult.completed[i]
        if (!structure) continue
        this.addTimeline({
          tick,
          category: 'build',
          factionId: structure.factionId,
          message: `Completata ${structure.type}`,
          x: structure.x,
          y: structure.y,
        })
      }
    }

    newFactions += this.tryFactionSplit(world, rng, tick)
    this.rebuildMembers()
    this.rebuildTileIndex()

    if (tick % 30 === 0) {
      this.stepFactionRelations(tick, rng)
    }

    if (tick % 60 === 0) {
      this.stepCulturalEvolution(world, tick, rng)
    }

    if (tick % 12 === 0) {
      this.territorySystem.step({
        tick,
        world,
        factions: this.factions,
        agents: this.agents,
        structures: this.buildingSystem.getStructures(),
      })
      changed = true
    }

    if (tick % 45 === 0) {
      if (this.stepEthnicityEvolution(tick, rng) > 0) {
        changed = true
      }
    }
    if (tick % 30 === 0) {
      if (this.stepIdentityEvolution(world, tick, rng) > 0) {
        changed = true
      }
    }
    if (tick % 40 === 0) {
      this.validateEntityLinks()
    }

    if (tick % 10 === 0) {
      this.sampleMetrics(tick)
    }

    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      if (tick - faction.lastChronicleTick >= 2000) {
        faction.lastChronicleTick = tick
        this.enqueueNarrative({
          id: `nr-chronicle-${faction.id}-${tick}`,
          type: 'chronicle',
          tick,
          factionId: faction.id,
          payload: {
            recentLogs: this.timeline
              .filter((entry) => entry.factionId === faction.id)
              .slice(-10)
              .map((entry) => `[t${entry.tick}] ${entry.message}`),
          },
        })
      }
    }

    return {
      changed,
      births,
      deaths,
      newFactions,
      talks,
      completedBuildings: buildResult.completed.length,
      notesWritten,
    }
  }

  getFactions(): readonly Faction[] {
    return this.factions
  }

  getAgents(): readonly Agent[] {
    return this.agents
  }

  getAgentById(agentId: string): Agent | null {
    return this.agentById.get(agentId) ?? null
  }

  getStructures(): readonly Structure[] {
    return this.buildingSystem.getStructures()
  }

  getFactionById(factionId: string): Faction | null {
    return this.factionById.get(factionId) ?? null
  }

  getFactionSummaries(): FactionSummary[] {
    const out: FactionSummary[] = []

    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      out.push({
        id: faction.id,
        name: this.getFactionDisplayName(faction),
        rawName: faction.name,
        identitySymbol: faction.identitySymbol,
        foundingSpeciesId: faction.foundingSpeciesId,
        dominantSpeciesId: faction.dominantSpeciesId,
        ethnicityId: faction.ethnicityId,
        ethnicityIds: [...faction.ethnicityIds],
        religionId: faction.religionId,
        religionName: faction.religion,
        population: faction.members.length,
        techLevel: faction.techLevel,
        literacyLevel: faction.literacyLevel,
        state: faction.state,
        religion: faction.religion,
        spirituality: faction.cultureParams.spirituality,
        aggression: faction.cultureParams.aggression,
        curiosity: faction.cultureParams.curiosity,
        tradeAffinity: faction.cultureParams.tradeAffinity,
        collectivism: faction.cultureParams.collectivism,
        environmentalAdaptation: faction.cultureParams.environmentalAdaptation,
        techOrientation: faction.cultureParams.techOrientation,
        strategy: faction.adaptationStrategy,
        dominantPractices: [...faction.dominantPractices],
        grammarLevel: faction.communication.grammarLevel,
        foundedAtTick: faction.foundedAtTick,
        homeCenterX: faction.homeCenterX,
        homeCenterY: faction.homeCenterY,
        territoryTiles: this.territorySystem.getFactionClaimCount(faction.id),
        diplomacy: { ...faction.diplomacy },
      })
    }

    out.sort((a, b) => b.population - a.population)
    return out
  }

  getFactionMembers(factionId: string | null = null, limit = 600): FactionMemberSummary[] {
    const rows: FactionMemberSummary[] = []
    const max = Math.max(1, limit | 0)
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i]
      if (!agent) continue
      if (factionId && agent.factionId !== factionId) continue
      const faction = this.factionById.get(agent.factionId)
      if (!faction) continue
      rows.push({
        agentId: agent.id,
        speciesId: agent.speciesId,
        civilizationId: agent.civilizationId,
        ethnicityId: agent.ethnicityId,
        factionId: faction.id,
        factionName: this.getFactionDisplayName(faction),
        name: agent.name,
        role: agent.role,
        age: agent.age,
        energy: agent.energy,
        hydration: agent.hydration,
        x: agent.x,
        y: agent.y,
        currentIntent: agent.currentIntent,
        goal: agent.currentGoal,
        activityState: agent.activityState,
        lastAction: agent.lastAction,
        activePlan: this.planSystem.summarize(agent.activePlan),
        inventoryItems: this.cloneInventoryEntries(agent.inventoryItems),
        equipmentSlots: { ...agent.equipmentSlots },
        maxCarryWeight: agent.maxCarryWeight,
        currentCarryWeight: agent.currentCarryWeight,
        mentalState: {
          ...agent.mentalState,
          lastReasonCodes: [...agent.mentalState.lastReasonCodes],
        },
      })
      if (rows.length >= max) {
        break
      }
    }

    rows.sort((a, b) => b.energy - a.energy || a.name.localeCompare(b.name))
    return rows
  }

  getRelationSummaries(): FactionRelationSummary[] {
    const out: FactionRelationSummary[] = []
    const seen = new Set<string>()
    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      const entries = Object.entries(faction.relations)
      for (let j = 0; j < entries.length; j++) {
        const [otherId, rel] = entries[j] ?? []
        if (!otherId || !rel) continue
        const a = faction.id < otherId ? faction.id : otherId
        const b = faction.id < otherId ? otherId : faction.id
        const key = `${a}|${b}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          fromId: a,
          toId: b,
          status: rel.status,
          trust: rel.trust,
          tension: rel.tension,
          intensity: rel.intensity,
        })
      }
    }
    return out
  }

  getRelationSeries(limitPoints = 180): FactionRelationSeries[] {
    const out: FactionRelationSeries[] = []
    const seen = new Set<string>()
    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      const entries = Object.entries(faction.relationHistory)
      for (let j = 0; j < entries.length; j++) {
        const [otherId, points] = entries[j] ?? []
        if (!otherId || !points || points.length === 0) continue
        const a = faction.id < otherId ? faction.id : otherId
        const b = faction.id < otherId ? otherId : faction.id
        const key = `${a}|${b}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          relationKey: key,
          fromId: a,
          toId: b,
          points: points.slice(-limitPoints).map((point) => ({ ...point })),
        })
      }
    }
    return out
  }

  getTimeline(limit = 120): CivTimelineEntry[] {
    if (this.timeline.length <= limit) {
      return [...this.timeline]
    }
    return this.timeline.slice(this.timeline.length - limit)
  }

  getDialogues(limit = 100): DialogueRecord[] {
    if (this.dialogues.length <= limit) {
      return [...this.dialogues]
    }
    return this.dialogues.slice(this.dialogues.length - limit)
  }

  getMetrics(limit = 200): CivMetricsPoint[] {
    if (this.metrics.length <= limit) {
      return [...this.metrics]
    }
    return this.metrics.slice(this.metrics.length - limit)
  }

  getGroundItems(limit = 240): GroundItemStack[] {
    if (this.groundItems.length <= limit) {
      return this.groundItems.map((item) => ({ ...item }))
    }
    return this.groundItems
      .slice(this.groundItems.length - limit)
      .map((item) => ({ ...item }))
  }

  exportState(): CivSystemState {
    const factions: SerializableFaction[] = []
    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      const row = cloneJson(faction) as Omit<Faction, 'knowledgeMap'>
      factions.push({
        ...row,
        knowledgeMap: {
          discovered: Array.from(faction.knowledgeMap.discovered),
          fertilityModel: Array.from(faction.knowledgeMap.fertilityModel),
          hazardModel: Array.from(faction.knowledgeMap.hazardModel),
        },
      })
    }

    return {
      factions,
      ethnicities: cloneJson(this.ethnicities),
      religions: cloneJson(this.religions),
      speciesCivFounded: Array.from(this.speciesCivFounded.values()),
      pendingIdentityNarrativeByFaction: Array.from(this.pendingIdentityNarrativeByFaction.values()),
      pendingReligionNarrativeByFaction: Array.from(this.pendingReligionNarrativeByFaction.values()),
      agents: cloneJson(this.agents),
      timeline: cloneJson(this.timeline),
      dialogues: cloneJson(this.dialogues),
      metrics: cloneJson(this.metrics),
      pendingNarratives: cloneJson(this.pendingNarratives),
      groundItems: cloneJson(this.groundItems),
      groundItemCounter: this.groundItemCounter,
      lastGroundSpawnTick: this.lastGroundSpawnTick,
      notes: cloneJson(this.notes),
      noteCounter: this.noteCounter,
      factionCounter: this.factionCounter,
      agentCounter: this.agentCounter,
      timelineCounter: this.timelineCounter,
      dialogueCounter: this.dialogueCounter,
      itemRngState: this.itemRng.getState(),
      building: this.buildingSystem.exportState(),
      cooldowns: this.cooldownIntentManager.exportState(),
    }
  }

  hydrateState(
    state: CivSystemState,
    world: WorldState,
    speciesStats: readonly SpeciesStat[] = [],
  ): void {
    this.factions.length = 0
    this.factionById.clear()
    this.ethnicities.length = 0
    this.ethnicityById.clear()
    this.religions.length = 0
    this.religionById.clear()
    this.speciesStatsById.clear()
    this.speciesCivFounded.clear()
    this.pendingIdentityNarrativeByFaction.clear()
    this.pendingReligionNarrativeByFaction.clear()
    this.agents.length = 0
    this.agentById.clear()
    this.agentsByTile.clear()
    this.agentsScratch.length = 0
    this.newbornScratch.length = 0
    this.queryScratch.length = 0
    this.timeline.length = 0
    this.dialogues.length = 0
    this.metrics.length = 0
    this.pendingNarratives.length = 0
    this.pendingNarrativeKeys.clear()
    this.groundItems.length = 0
    this.groundItemById.clear()
    this.notes.length = 0
    this.noteById.clear()

    this.buildingSystem.hydrateState(state.building)
    this.cooldownIntentManager.hydrateState(state.cooldowns)
    this.itemRng.setState(state.itemRngState)

    this.factionCounter = Math.max(0, state.factionCounter | 0)
    this.agentCounter = Math.max(0, state.agentCounter | 0)
    this.timelineCounter = Math.max(0, state.timelineCounter | 0)
    this.dialogueCounter = Math.max(0, state.dialogueCounter | 0)
    this.groundItemCounter = Math.max(0, state.groundItemCounter | 0)
    this.lastGroundSpawnTick = Math.max(0, state.lastGroundSpawnTick | 0)
    this.noteCounter = Math.max(0, state.noteCounter | 0)

    const factionRows = Array.isArray(state.factions) ? state.factions : []
    for (let i = 0; i < factionRows.length; i++) {
      const row = factionRows[i]
      if (!row) continue
      const faction: Faction = {
        ...(cloneJson(row) as Omit<Faction, 'knowledgeMap'>),
        knowledgeMap: {
          discovered: new Uint8Array(row.knowledgeMap?.discovered ?? []),
          fertilityModel: new Uint8Array(row.knowledgeMap?.fertilityModel ?? []),
          hazardModel: new Uint8Array(row.knowledgeMap?.hazardModel ?? []),
        },
      }
      this.factions.push(faction)
      this.factionById.set(faction.id, faction)
    }

    const ethnicityRows = Array.isArray(state.ethnicities) ? state.ethnicities : []
    for (let i = 0; i < ethnicityRows.length; i++) {
      const row = ethnicityRows[i]
      if (!row) continue
      const ethnicity = cloneJson(row)
      this.ethnicities.push(ethnicity)
      this.ethnicityById.set(ethnicity.id, ethnicity)
    }

    const religionRows = Array.isArray(state.religions) ? state.religions : []
    for (let i = 0; i < religionRows.length; i++) {
      const row = religionRows[i]
      if (!row) continue
      const religion = cloneJson(row)
      this.religions.push(religion)
      this.religionById.set(religion.id, religion)
    }

    const founded = Array.isArray(state.speciesCivFounded) ? state.speciesCivFounded : []
    for (let i = 0; i < founded.length; i++) {
      const id = founded[i]
      if (!id) continue
      this.speciesCivFounded.add(id)
    }
    const pendingIdentity = Array.isArray(state.pendingIdentityNarrativeByFaction)
      ? state.pendingIdentityNarrativeByFaction
      : []
    for (let i = 0; i < pendingIdentity.length; i++) {
      const id = pendingIdentity[i]
      if (!id) continue
      this.pendingIdentityNarrativeByFaction.add(id)
    }
    const pendingReligion = Array.isArray(state.pendingReligionNarrativeByFaction)
      ? state.pendingReligionNarrativeByFaction
      : []
    for (let i = 0; i < pendingReligion.length; i++) {
      const id = pendingReligion[i]
      if (!id) continue
      this.pendingReligionNarrativeByFaction.add(id)
    }

    const agentRows = Array.isArray(state.agents) ? state.agents : []
    for (let i = 0; i < agentRows.length; i++) {
      const row = agentRows[i]
      if (!row) continue
      const agent = cloneJson(row)
      this.agents.push(agent)
      this.agentById.set(agent.id, agent)
      const key = `${agent.x}:${agent.y}`
      const list = this.agentsByTile.get(key)
      if (list) {
        list.push(agent)
      } else {
        this.agentsByTile.set(key, [agent])
      }
    }

    this.timeline.push(...cloneJson(state.timeline ?? []))
    this.dialogues.push(...cloneJson(state.dialogues ?? []))
    this.metrics.push(...cloneJson(state.metrics ?? []))
    this.pendingNarratives.push(...cloneJson(state.pendingNarratives ?? []))
    for (let i = 0; i < this.pendingNarratives.length; i++) {
      const row = this.pendingNarratives[i]
      if (!row) continue
      this.pendingNarrativeKeys.add(row.id)
    }

    const groundRows = Array.isArray(state.groundItems) ? state.groundItems : []
    for (let i = 0; i < groundRows.length; i++) {
      const row = groundRows[i]
      if (!row) continue
      const item = cloneJson(row)
      this.groundItems.push(item)
      this.groundItemById.set(item.id, item)
    }

    const noteRows = Array.isArray(state.notes) ? state.notes : []
    for (let i = 0; i < noteRows.length; i++) {
      const row = noteRows[i]
      if (!row) continue
      const note = cloneJson(row)
      this.notes.push(note)
      this.noteById.set(note.id, note)
    }

    this.ethnicitySystem.reset(this.ethnicities)
    this.identityEvolutionSystem.reset(this.religions)
    this.syncSpeciesStats(speciesStats)
    this.reconcileConsistency()

    this.territorySystem.reset(this.factions)
    this.territorySystem.step({
      tick: world.tick,
      world,
      factions: this.factions,
      agents: this.agents,
      structures: this.buildingSystem.getStructures(),
    })
  }

  getItemsSnapshot(tick: number, preferredFactionId: string | null = null): CivItemsSnapshot | null {
    if (!this.itemCatalog) {
      return null
    }

    const catalog = this.itemCatalog
    const catalogRows = catalog.items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      baseProperties: { ...item.baseProperties },
      naturalSpawn: item.naturalSpawn,
      allowedBiomes: [...item.allowedBiomes],
    }))

    let selectedFaction: Faction | null = null
    if (preferredFactionId) {
      selectedFaction = this.factionById.get(preferredFactionId) ?? null
    }
    if (!selectedFaction) {
      for (let i = 0; i < this.factions.length; i++) {
        const faction = this.factions[i]
        if (!faction) continue
        if (!selectedFaction || faction.members.length > selectedFaction.members.length) {
          selectedFaction = faction
        }
      }
    }

    const factionInventory: CivFactionInventoryRow[] = []
    if (selectedFaction) {
      const entries = Object.entries(selectedFaction.itemInventory)
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        if (!entry) continue
        const itemId = normalizeItemId(entry[0])
        const quantity = entry[1]
        if (!Number.isFinite(quantity) || quantity <= 0) continue
        const item = catalog.getById(itemId)
        if (!item) continue
        factionInventory.push({
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          quantity,
        })
      }
      factionInventory.sort((a, b) => {
        if (a.quantity !== b.quantity) {
          return b.quantity - a.quantity
        }
        return a.itemName.localeCompare(b.itemName)
      })
    }

    const craftableItems = selectedFaction && this.craftingSystem
      ? this.craftingSystem.getRecipeStates(
          selectedFaction.id,
          selectedFaction.techLevel,
          selectedFaction.itemInventory,
          tick,
        )
      : []

    const groundItems: CivGroundItemRow[] = []
    for (let i = 0; i < this.groundItems.length; i++) {
      const stack = this.groundItems[i]
      if (!stack) continue
      const item = catalog.getById(stack.itemId)
      if (!item) continue
      groundItems.push({
        id: stack.id,
        itemId: stack.itemId,
        itemName: item.name,
        category: item.category,
        quantity: stack.quantity,
        x: stack.x,
        y: stack.y,
        naturalSpawn: stack.naturalSpawn,
        ageTicks: Math.max(0, tick - stack.spawnedAtTick),
      })
    }
    groundItems.sort((a, b) => b.quantity - a.quantity || a.itemName.localeCompare(b.itemName))

    return {
      catalogSeed: catalog.seed,
      catalogCreatedAtMs: catalog.createdAtMs,
      catalog: catalogRows,
      selectedFactionId: selectedFaction?.id ?? null,
      selectedFactionName: selectedFaction ? this.getFactionDisplayName(selectedFaction) : null,
      selectedFactionTechLevel: selectedFaction?.techLevel ?? 0,
      craftableItems,
      factionInventory,
      groundItems: groundItems.slice(0, 320),
    }
  }

  getTerritoryMap(): TerritoryMapSnapshot {
    return this.territorySystem.getSnapshot()
  }

  getTerritorySummary(stride = 4, maxCells = 4200): TerritorySummary {
    return this.territorySystem.buildSummary(stride, maxCells)
  }

  getTerritoryOwnerAt(tileX: number, tileY: number): string | null {
    return this.territorySystem.getOwnerFactionIdAt(tileX, tileY)
  }

  getNotes(limit = 240): Note[] {
    if (this.notes.length <= limit) {
      return this.notes.map((note) => ({ ...note }))
    }
    return this.notes.slice(this.notes.length - limit).map((note) => ({ ...note }))
  }

  getNoteById(noteId: string): Note | null {
    const note = this.noteById.get(noteId)
    return note ? { ...note } : null
  }

  setNoteTranslation(noteId: string, translated: string): void {
    const note = this.noteById.get(noteId)
    if (!note) {
      return
    }
    note.translatedContent = translated
  }

  setAgentThoughtGloss(agentId: string, thoughtGloss: string): void {
    const agent = this.agentById.get(agentId)
    if (!agent) {
      return
    }
    agent.thoughtGloss = thoughtGloss
  }

  getNoteAtTile(x: number, y: number): Note | null {
    const tx = Math.floor(x)
    const ty = Math.floor(y)
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const note = this.notes[i]
      if (!note) continue
      if (note.x === tx && note.y === ty) {
        return { ...note }
      }
    }
    return null
  }

  queryAgentsInRect(bounds: Bounds, target: Agent[] = []): Agent[] {
    target.length = 0
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i]
      if (!agent) continue
      if (
        agent.x >= bounds.minX &&
        agent.y >= bounds.minY &&
        agent.x <= bounds.maxX &&
        agent.y <= bounds.maxY
      ) {
        target.push(agent)
      }
    }
    return target
  }

  queryStructuresInRect(bounds: Bounds, target: Structure[] = []): Structure[] {
    target.length = 0
    const structures = this.buildingSystem.getStructures()
    for (let i = 0; i < structures.length; i++) {
      const structure = structures[i]
      if (!structure) continue
      if (
        structure.x >= bounds.minX &&
        structure.y >= bounds.minY &&
        structure.x <= bounds.maxX &&
        structure.y <= bounds.maxY
      ) {
        target.push(structure)
      }
    }
    return target
  }

  getAgentAtTile(x: number, y: number): Agent | null {
    const key = `${Math.floor(x)}:${Math.floor(y)}`
    const list = this.agentsByTile.get(key)
    if (!list || list.length === 0) {
      return null
    }
    return list[0] ?? null
  }

  getAgentInspectorData(agentId: string): AgentInspectorData | null {
    const agent = this.agentById.get(agentId)
    if (!agent) {
      return null
    }

    const faction = this.factionById.get(agent.factionId)
    if (!faction) {
      return null
    }
    this.syncAgentCarryState(agent)
    const latestMentalLog = agent.mentalLogs[agent.mentalLogs.length - 1] ?? null

    return {
      agentId: agent.id,
      speciesId: agent.speciesId,
      civilizationId: agent.civilizationId,
      ethnicityId: agent.ethnicityId,
      name: agent.name,
      factionId: faction.id,
      factionName: this.getFactionDisplayName(faction),
      role: agent.role,
      age: agent.age,
      energy: agent.energy,
      hydration: agent.hydration,
      x: agent.x,
      y: agent.y,
      inventory: { ...agent.inventory },
      itemInventory: { ...agent.itemInventory },
      inventoryRows: this.buildAgentInventoryRows(agent),
      equipmentSlots: { ...agent.equipmentSlots },
      equippedItemId: agent.equippedItemId,
      maxCarryWeight: agent.maxCarryWeight,
      currentCarryWeight: agent.currentCarryWeight,
      relationsCount: Object.keys(agent.relations.trust).length,
      currentIntent: agent.currentIntent,
      goal: agent.currentGoal,
      activityState: agent.activityState,
      lastAction: agent.lastAction,
      proposedPlan: this.planSystem.summarize(agent.proposedPlan),
      activePlan: this.planSystem.summarize(agent.activePlan),
      vitality: agent.vitality,
      hunger: agent.hunger,
      waterNeed: agent.waterNeed,
      hazardStress: agent.hazardStress,
      currentThought: agent.currentThought,
      thoughtGloss: agent.thoughtGloss,
      latestMentalLog: latestMentalLog
        ? {
            ...latestMentalLog,
            reasonCodes: [...latestMentalLog.reasonCodes],
          }
        : undefined,
      mentalState: {
        ...agent.mentalState,
        lastReasonCodes: [...agent.mentalState.lastReasonCodes],
      },
      narrativeBio: undefined,
      lastUtteranceTokens: [...agent.lastUtteranceTokens],
      lastUtteranceGloss: agent.lastUtteranceGloss,
    }
  }

  dequeueNarrativeRequest(): NarrativeRequest | null {
    const req = this.pendingNarratives.shift() ?? null
    if (!req) {
      return null
    }
    this.pendingNarrativeKeys.delete(req.id)
    return req
  }

  applyFactionNarrative(factionId: string, narrative: FactionNarrative, tickOverride?: number): void {
    const faction = this.factionById.get(factionId)
    if (!faction) {
      return
    }

    const tick = typeof tickOverride === 'number' ? tickOverride : faction.lastDialogueTick
    const prevName = faction.name
    const prevReligion = faction.religion
    if (narrative.name) {
      if (!faction.name) {
        faction.name = narrative.name
      }
      this.pendingIdentityNarrativeByFaction.delete(faction.id)
    }
    if (narrative.religion) {
      if (faction.religionId) {
        faction.religion = narrative.religion
        const religion = this.religionById.get(faction.religionId)
        if (religion) {
          religion.name = narrative.religion
          religion.description = narrative.motto || religion.description
        }
      }
      this.pendingReligionNarrativeByFaction.delete(faction.id)
    }
    faction.laws = narrative.coreLaws.length > 0 ? narrative.coreLaws : faction.laws
    faction.narrative = narrative
    if (!prevName && faction.name) {
      this.addTimeline({
        tick,
        category: 'foundation',
        factionId: faction.id,
        message: `Identita emersa: ${faction.name}`,
      })
    }
    if (!prevReligion && faction.religion) {
      this.addTimeline({
        tick,
        category: 'religion',
        factionId: faction.id,
        message: `${this.getFactionDisplayName(faction)} codifica culto: ${faction.religion}`,
      })
    }
  }

  applyDialogueTranslation(dialogueId: string, payload: UtteranceTranslation): void {
    for (let i = 0; i < this.dialogues.length; i++) {
      const dialogue = this.dialogues[i]
      if (!dialogue) continue
      if (dialogue.id !== dialogueId) continue

      dialogue.glossIt = payload.gloss_it
      dialogue.tone = payload.tone
      dialogue.newTerms = [...payload.new_terms]
      dialogue.narrativeApplied = true

      const speakerA = this.agentById.get(dialogue.speakerAId)
      const speakerB = this.agentById.get(dialogue.speakerBId)
      if (speakerA) {
        speakerA.lastUtteranceGloss = payload.gloss_it
      }
      if (speakerB) {
        speakerB.lastUtteranceGloss = payload.gloss_it
      }
      return
    }
  }

  addChronicle(factionId: string, tick: number, text: string): void {
    this.addTimeline({
      tick,
      category: 'law',
      factionId,
      message: `Cronaca: ${text.slice(0, 120)}`,
    })
  }

  getEthnicities(): readonly Ethnicity[] {
    return this.ethnicities
  }

  getReligions(): readonly Religion[] {
    return this.religions
  }

  getEthnicitySummaries(): EthnicitySummary[] {
    return this.ethnicities.map((ethnicity) => ({
      id: ethnicity.id,
      speciesId: ethnicity.speciesId,
      factionId: ethnicity.factionId,
      name: ethnicity.name,
      symbol: ethnicity.symbol,
      culturalTraits: [...ethnicity.culturalTraits],
      createdAtTick: ethnicity.createdAtTick,
    }))
  }

  getReligionSummaries(): ReligionSummary[] {
    return this.religions.map((religion) => ({
      id: religion.id,
      speciesId: religion.speciesId,
      ethnicityId: religion.ethnicityId,
      name: religion.name,
      coreBeliefs: [...religion.coreBeliefs],
      sacredSpeciesIds: [...religion.sacredSpeciesIds],
      createdAtTick: religion.createdAtTick,
      description: religion.description,
    }))
  }

  private syncSpeciesStats(speciesStats: readonly SpeciesStat[]): void {
    this.speciesStatsById.clear()
    for (let i = 0; i < speciesStats.length; i++) {
      const stat = speciesStats[i]
      if (!stat) continue
      this.speciesStatsById.set(stat.speciesId, stat)
    }
  }

  private tryFoundCivilizationsFromSpecies(
    world: WorldState,
    rng: SeededRng,
    tick: number,
  ): number {
    if (this.speciesStatsById.size === 0) {
      return 0
    }

    const foundedSpecies = new Set<string>()
    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      foundedSpecies.add(faction.foundingSpeciesId)
    }

    const candidates = [...this.speciesStatsById.values()]
      .filter((stat) => this.isSpeciesEligibleForCivilization(stat))
      .sort((a, b) => b.population - a.population || a.speciesId.localeCompare(b.speciesId))

    let created = 0
    const maxCivilizations = 8

    for (let i = 0; i < candidates.length; i++) {
      const species = candidates[i]
      if (!species) continue
      if (foundedSpecies.has(species.speciesId)) {
        continue
      }
      if (this.speciesCivFounded.has(species.speciesId)) {
        continue
      }
      if (this.factions.length >= maxCivilizations) {
        break
      }

      const center = this.findSpawnPoint(world, rng)
      const faction = this.createFaction(
        this.factions.length + created,
        tick,
        center.x,
        center.y,
        world,
        rng,
        species.speciesId,
      )
      faction.techLevel = clamp(1 + species.intelligence * 1.5, 1, 4.2)
      faction.cultureParams.curiosity = clamp(
        faction.cultureParams.curiosity * 0.55 + species.intelligence * 0.45,
        0,
        1,
      )
      faction.writing.symbolSet = [
        `sp${species.speciesId.slice(0, 2).toLowerCase() || 'zz'}0`,
        `sp${species.speciesId.slice(-2).toLowerCase() || 'aa'}1`,
      ]
      this.factions.push(faction)
      this.factionById.set(faction.id, faction)
      foundedSpecies.add(species.speciesId)
      this.speciesCivFounded.add(species.speciesId)

      for (let k = 0; k < this.factions.length; k++) {
        const other = this.factions[k]
        if (!other || other.id === faction.id) continue
        faction.diplomacy[other.id] = faction.diplomacy[other.id] ?? 'neutral'
        other.diplomacy[faction.id] = other.diplomacy[faction.id] ?? 'neutral'
        this.ensureRelationPair(faction, other, tick)
      }

      const members = clampInt(Math.floor(species.population * 0.18), 8, 18)
      for (let j = 0; j < members; j++) {
        const role = roleByIndex(j)
        const pos = this.findNeighborSpawn(world, center.x, center.y, rng)
        const agent = this.createAgent(
          faction.id,
          species.speciesId,
          role,
          pos.x,
          pos.y,
          rng,
          null,
        )
        this.agents.push(agent)
        this.agentById.set(agent.id, agent)
      }

      const speciesName = species.commonName || species.name || species.speciesId
      this.addTimeline({
        tick,
        category: 'foundation',
        factionId: faction.id,
        message: `Nasce cultura emergente della specie ${speciesName}`,
        x: center.x,
        y: center.y,
      })
      created++
    }

    if (created > 0) {
      this.rebuildMembers()
      this.rebuildTileIndex()
      this.territorySystem.step({
        tick,
        world,
        factions: this.factions,
        agents: this.agents,
        structures: this.buildingSystem.getStructures(),
      })
    }

    return created
  }

  private isSpeciesEligibleForCivilization(stat: SpeciesStat): boolean {
    const stability = computeSpeciesStability(stat)
    return (
      stat.population >= CIV_FOUNDATION_POP_THRESHOLD &&
      stat.intelligence >= CIV_FOUNDATION_INTELLIGENCE_THRESHOLD &&
      stability >= CIV_FOUNDATION_STABILITY_THRESHOLD &&
      (stat.isIntelligent || stat.languageLevel >= 0.22 || stat.socialComplexity >= 0.24)
    )
  }

  private getFactionDisplayName(faction: Faction): string {
    const explicitName = faction.name?.trim()
    if (explicitName) {
      return explicitName
    }
    const speciesName =
      this.speciesStatsById.get(faction.foundingSpeciesId)?.commonName ??
      this.speciesStatsById.get(faction.foundingSpeciesId)?.name ??
      faction.foundingSpeciesId
    return `Emerging Culture of ${speciesName}`
  }

  private createFaction(
    index: number,
    tick: number,
    homeX: number,
    homeY: number,
    world: WorldState,
    rng: SeededRng,
    foundingSpeciesId: string,
  ): Faction {
    const id = `fc-${this.seed}-${++this.factionCounter}`
    const spirituality = clamp(0.2 + rng.nextFloat() * 0.7, 0, 1)
    const aggression = clamp(0.15 + rng.nextFloat() * 0.75, 0, 1)
    const curiosity = clamp(0.2 + rng.nextFloat() * 0.65, 0, 1)

    const size = world.width * world.height
    const knowledgeMap = {
      discovered: new Uint8Array(size),
      fertilityModel: new Uint8Array(size),
      hazardModel: new Uint8Array(size),
    }
    knowledgeMap.fertilityModel.fill(128)
    knowledgeMap.hazardModel.fill(128)

    const sacredBiomes: TileId[] = [TileId.Hills, TileId.Forest]
    if (spirituality > 0.6) {
      sacredBiomes.push(TileId.Mountain)
    }

    return {
      id,
      name: null,
      identitySymbol: null,
      foundingSpeciesId,
      dominantSpeciesId: foundingSpeciesId,
      ethnicityId: null,
      ethnicityIds: [],
      religionId: null,
      ideology: ideologyFromCulture(aggression, spirituality),
      religion: null,
      laws: ['conservare il cibo', 'difendere il villaggio'],
      techLevel: 1,
      literacyLevel: 0,
      state: 'tribe',
      writing: {
        literacyLevel: 0,
        symbolSet: ['ka0', 'ru1', 'ti2'],
        writingArtifacts: [],
      },
      adaptationStrategy: 'balanced',
      dominantPractices: ['mixed_subsistence'],
      cultureHistory: [],
      cultureParams: {
        collectivism: clamp(0.3 + rng.nextFloat() * 0.6, 0, 1),
        aggression,
        spirituality,
        curiosity,
        tradition: clamp(0.2 + rng.nextFloat() * 0.7, 0, 1),
        tradeAffinity: clamp(0.15 + rng.nextFloat() * 0.75, 0, 1),
        tabooHazard: clamp(0.3 + rng.nextFloat() * 0.6, 0, 1),
        sacredBiomes,
        hierarchyLevel: clamp(0.15 + rng.nextFloat() * 0.75, 0, 1),
        environmentalAdaptation: clamp(0.18 + rng.nextFloat() * 0.52, 0, 1),
        techOrientation: clamp(0.14 + rng.nextFloat() * 0.62, 0, 1),
      },
      homeCenterX: homeX,
      homeCenterY: homeY,
      members: [],
      diplomacy: {},
      relations: {},
      relationHistory: {},
      knowledgeMap,
      stockpile: defaultInventory(),
      itemInventory: {},
      stress: clamp(0.25 + rng.nextFloat() * 0.35, 0, 1),
      culturalIdentityLevel: 0,
      significantEvents: 0,
      foundedAtTick: tick,
      lastDialogueTick: tick,
      lastChronicleTick: tick,
      lastCultureShiftTick: tick,
      communication: this.communicationSystem.createInitialState(this.seed ^ (index + 71), rng),
    }
  }

  private createAgent(
    factionId: string,
    speciesId: string,
    role: AgentRole,
    x: number,
    y: number,
    rng: SeededRng,
    ethnicityId: string | null = null,
  ): Agent {
    const id = `ag-${this.seed}-${++this.agentCounter}`
    const maxCarryWeight = 14 + rng.nextFloat() * 14
    const equipmentSlots: EquipmentSlots = {
      mainHand: null,
      offHand: null,
      body: null,
      utility: null,
    }
    const inventoryItems: AgentInventoryEntry[] = []
    const agent: Agent = {
      id,
      speciesId,
      civilizationId: factionId,
      ethnicityId,
      factionId,
      x,
      y,
      energy: 65 + rng.nextFloat() * 35,
      hydration: 68 + rng.nextFloat() * 26,
      age: Math.floor(rng.nextFloat() * 80),
      role,
      traits: {
        intelligence: clamp(0.2 + rng.nextFloat() * 0.75, 0, 1),
        sociability: clamp(0.2 + rng.nextFloat() * 0.75, 0, 1),
        spirituality: clamp(0.15 + rng.nextFloat() * 0.8, 0, 1),
        bravery: clamp(0.15 + rng.nextFloat() * 0.8, 0, 1),
        diligence: clamp(0.2 + rng.nextFloat() * 0.75, 0, 1),
      },
      knowledge: {
        discoveredCount: 0,
        lastSharedTick: 0,
        hazardEstimate: 0.5,
        fertilityEstimate: 0.5,
        discoveredBiomes: {},
      },
      inventory: { food: 4, wood: 1, stone: 0, ore: 0 },
      itemInventory: {},
      inventoryItems,
      equipmentSlots,
      equippedItemId: null,
      maxCarryWeight,
      currentCarryWeight: 0,
      relations: { trust: {} },
      lastTalkTick: 0,
      lastDecisionTick: 0,
      lastActionTick: 0,
      currentIntent: defaultIntentByRole(role),
      currentGoal: 'Explore',
      proposedPlan: null,
      activePlan: null,
      lastAction: 'idle',
      activityState: 'idle',
      goalTargetX: x,
      goalTargetY: y,
      generation: 1,
      name: agentNameFromSeed(this.seed, this.agentCounter),
      vitality: 0.65,
      hunger: 0.3,
      waterNeed: 0.24,
      hazardStress: 0.1,
      currentThought: 'Valuto il territorio circostante.',
      thoughtGloss: undefined,
      mentalState: {
        currentGoal: 'Explore',
        lastAction: 'idle',
        lastReasonCodes: ['EXPLORE_FRONTIER'],
        perceivedFoodLevel: 0.5,
        perceivedThreatLevel: 0.1,
        stressLevel: 0.25,
        loyaltyToFaction: clamp(0.5 + rng.nextFloat() * 0.35, 0, 1),
        targetX: x,
        targetY: y,
        targetLabel: 'start',
        emotionalTone: 'calm',
      },
      mentalLogs: [],
      dialogueMemory: [],
      lastUtteranceTokens: [],
      lastUtteranceGloss: undefined,
    }
    this.syncAgentCarryState(agent)
    return agent
  }

  private findSpawnPoint(world: WorldState, rng: SeededRng): { x: number; y: number } {
    for (let tries = 0; tries < 120; tries++) {
      const x = rng.nextInt(world.width)
      const y = rng.nextInt(world.height)
      const idx = world.index(x, y)
      const tile = world.tiles[idx] as TileId
      const fertility = world.fertility[idx] ?? 0
      const hazard = world.hazard[idx] ?? 0

      if (isHabitable(tile) && fertility > 85 && hazard < 70) {
        return { x, y }
      }
    }

    return {
      x: clampInt(world.width / 2, 0, world.width - 1),
      y: clampInt(world.height / 2, 0, world.height - 1),
    }
  }

  private findNeighborSpawn(
    world: WorldState,
    baseX: number,
    baseY: number,
    rng: SeededRng,
  ): { x: number; y: number } {
    for (let tries = 0; tries < 18; tries++) {
      const x = clampInt(baseX + rng.rangeInt(-3, 3), 0, world.width - 1)
      const y = clampInt(baseY + rng.rangeInt(-3, 3), 0, world.height - 1)
      const tile = world.tiles[world.index(x, y)] as TileId
      if (isHabitable(tile)) {
        return { x, y }
      }
    }

    return { x: baseX, y: baseY }
  }

  private discoverAround(world: WorldState, faction: Faction, x: number, y: number, radius: number): void {
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const tx = x + ox
        const ty = y + oy
        if (!world.inBounds(tx, ty)) continue

        const idx = world.index(tx, ty)
        faction.knowledgeMap.discovered[idx] = 1
        faction.knowledgeMap.fertilityModel[idx] = world.fertility[idx] ?? 0
        faction.knowledgeMap.hazardModel[idx] = world.hazard[idx] ?? 0
      }
    }
  }

  private moveAgentToward(agent: Agent, world: WorldState, tx: number, ty: number): boolean {
    const dx = Math.sign(tx - agent.x)
    const dy = Math.sign(ty - agent.y)

    const nextX = clampInt(agent.x + dx, 0, world.width - 1)
    const nextY = clampInt(agent.y + dy, 0, world.height - 1)
    const tile = world.tiles[world.index(nextX, nextY)] as TileId

    if (!isHabitable(tile)) {
      return false
    }

    if (nextX === agent.x && nextY === agent.y) {
      return false
    }

    agent.x = nextX
    agent.y = nextY
    return true
  }

  private pickTalkPartner(agent: Agent, factionId: string, rng: SeededRng): Agent | null {
    const pool: Agent[] = []
    for (let i = 0; i < this.agents.length; i++) {
      const other = this.agents[i]
      if (!other || other.id === agent.id || other.factionId !== factionId) {
        continue
      }
      const dist = Math.abs(other.x - agent.x) + Math.abs(other.y - agent.y)
      if (dist <= 3) {
        pool.push(other)
      }
    }

    if (pool.length === 0) {
      return null
    }

    return pool[rng.nextInt(pool.length)] ?? null
  }

  private resolveEquippedToolTags(agent: Agent): string[] {
    if (!this.itemCatalog || !agent.equippedItemId) {
      return []
    }
    const item = this.itemCatalog.getById(agent.equippedItemId)
    if (!item) {
      return []
    }
    if (item.toolTags.length > 0) {
      return [...item.toolTags]
    }
    if (item.category === 'tool' || item.category === 'weapon') {
      return ['knife']
    }
    return []
  }

  private applyHarvestToFaction(agent: Agent, faction: Faction, materialId: string, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      return
    }
    const normalizedAmount = Math.max(0.1, amount)

    if (materialId === 'wood') {
      faction.stockpile.wood += normalizedAmount
      return
    }
    if (materialId === 'stone') {
      faction.stockpile.stone += normalizedAmount
      return
    }
    if (materialId === 'iron_ore' || materialId === 'iron_ingot') {
      faction.stockpile.ore += normalizedAmount
      incrementItemInventory(faction.itemInventory, materialId, normalizedAmount)
      incrementItemInventory(agent.itemInventory, materialId, Math.max(1, Math.floor(normalizedAmount)))
      return
    }

    incrementItemInventory(faction.itemInventory, materialId, normalizedAmount)
    incrementItemInventory(agent.itemInventory, materialId, Math.max(1, Math.floor(normalizedAmount)))
  }

  private computeDecisionFeatures(
    agent: Agent,
    faction: Faction,
  ): { hasTool: boolean; inventoryRichness: number; nearResourceNode: number } {
    const equippedItem = agent.equippedItemId ? this.itemCatalog?.getById(agent.equippedItemId) : undefined
    const hasTool =
      equippedItem?.category === 'tool' || equippedItem?.category === 'weapon'

    const personalTotal = inventoryTotal(agent.itemInventory)
    const factionTotal = inventoryTotal(faction.itemInventory)
    const personalUnique = inventoryUniqueCount(agent.itemInventory)
    const factionUnique = inventoryUniqueCount(faction.itemInventory)
    const inventoryRichness = clamp(
      personalTotal / 8 +
        factionTotal / 28 +
        personalUnique * 0.08 +
        factionUnique * 0.04,
      0,
      1,
    )

    let nearResourceNode = 0
    const nodeAtTile = this.resourceNodeSystem?.getNodeAt(agent.x, agent.y)
    if (nodeAtTile && nodeAtTile.amount > 0) {
      nearResourceNode = 1
    }

    if (nearResourceNode < 1 && this.resourceNodeSystem) {
      const nearbyNodes = this.resourceNodeSystem.queryInRect(
        agent.x - 2,
        agent.y - 2,
        agent.x + 2,
        agent.y + 2,
      )
      for (let i = 0; i < nearbyNodes.length; i++) {
        const node = nearbyNodes[i]
        if (!node || node.amount <= 0) continue
        const distance = Math.abs(node.x - agent.x) + Math.abs(node.y - agent.y)
        const proximity = distance === 0 ? 1 : distance === 1 ? 0.75 : 0.45
        const amountFactor = clamp(node.amount / 180, 0.2, 1)
        nearResourceNode = Math.max(nearResourceNode, proximity * amountFactor)
      }
    }

    for (let i = 0; i < this.groundItems.length; i++) {
      const stack = this.groundItems[i]
      if (!stack || stack.quantity <= 0) continue
      const distance = Math.abs(stack.x - agent.x) + Math.abs(stack.y - agent.y)
      if (distance > 2) {
        continue
      }
      const proximity = distance === 0 ? 1 : distance === 1 ? 0.65 : 0.4
      const quantityFactor = clamp(stack.quantity / 3, 0.2, 1)
      nearResourceNode = Math.max(nearResourceNode, proximity * quantityFactor)
    }

    return {
      hasTool,
      inventoryRichness,
      nearResourceNode,
    }
  }

  private handlePickItemAction(agent: Agent, faction: Faction, tick: number): number {
    const stack = this.findNearestGroundStack(agent.x, agent.y, 1)
    if (!stack) {
      return 0
    }

    let amount = Math.min(stack.quantity, 1 + clampInt(agent.traits.diligence * 2.5, 0, 3))
    amount = this.clampCarryAmount(agent, stack.itemId, amount)
    if (amount <= 0) {
      return 0
    }

    incrementItemInventory(agent.itemInventory, stack.itemId, amount)
    incrementItemInventory(faction.itemInventory, stack.itemId, amount)
    this.syncAgentCarryState(agent)

    stack.quantity -= amount
    if (stack.quantity <= 0) {
      this.removeGroundStack(stack.id)
    }

    faction.techLevel = clamp(faction.techLevel + amount * 0.0012, 1, 12)

    if (stack.quantity <= 0 && this.itemCatalog?.getById(stack.itemId)?.category === 'food') {
      this.addTimeline({
        tick,
        category: 'trade',
        factionId: faction.id,
        message: `${this.getFactionDisplayName(faction)} raccoglie ${amount}x ${this.itemCatalog.getById(stack.itemId)?.name ?? stack.itemId}`,
        x: agent.x,
        y: agent.y,
      })
    }

    return amount
  }

  private handleUseItemAction(
    agent: Agent,
    faction: Faction,
    hazard: number,
  ): { used: boolean; reward: number } {
    const item = this.pickBestUsableItem(agent)
    if (!item) {
      return { used: false, reward: -0.05 }
    }

    if (item.category === 'food') {
      if (!decrementItemInventory(agent.itemInventory, item.id, 1)) {
        return { used: false, reward: -0.06 }
      }
      decrementItemInventory(faction.itemInventory, item.id, 1)
      this.syncAgentCarryState(agent)

      const nutrition = item.baseProperties.nutrition ?? 5
      const hydrationBoost = clamp((item.baseProperties.storage ?? 0) * 0.03 + nutrition * 0.02, 0.2, 4)
      const energyBoost = clamp(1.8 + nutrition * 0.24, 1, 22)
      agent.energy = clamp(agent.energy + energyBoost, 0, 140)
      agent.hydration = clamp(agent.hydration + hydrationBoost, 0, 100)

      let reward = 0.08 + clamp(nutrition / 90, 0, 0.2)
      if (nutrition < 4) {
        reward -= 0.06 // spreco risorsa poco utile
      }
      return { used: true, reward }
    }

    if (item.category === 'tool' || item.category === 'weapon') {
      agent.equippedItemId = item.id
      agent.equipmentSlots.mainHand = item.id
      agent.equipmentSlots.utility = item.category === 'tool' ? item.id : agent.equipmentSlots.utility
      const tacticalBoost = 0.6 + clamp(hazard, 0, 1) * 0.8
      agent.energy = clamp(agent.energy + tacticalBoost, 0, 140)
      return { used: true, reward: 0.12 + clamp(hazard * 0.08, 0, 0.08) }
    }

    if (!decrementItemInventory(agent.itemInventory, item.id, 1)) {
      return { used: false, reward: -0.05 }
    }
    decrementItemInventory(faction.itemInventory, item.id, 1)
    this.syncAgentCarryState(agent)
    agent.energy = clamp(agent.energy + 0.2, 0, 140)
    return { used: true, reward: -0.06 } // consumo non efficiente
  }

  private handleCraftItemAction(
    agent: Agent,
    faction: Faction,
    tick: number,
  ): { crafted: boolean; reward: number } {
    if (!this.craftingSystem) {
      return { crafted: false, reward: -0.02 }
    }

    const result = this.craftingSystem.attemptCraft(
      faction.id,
      faction.techLevel,
      faction.itemInventory,
      this.itemRng,
      tick,
    )
    if (!result.crafted) {
      if (result.reason === 'insufficient_items') {
        return { crafted: false, reward: -0.05 }
      }
      return { crafted: false, reward: -0.02 }
    }

    if (result.resultItemId) {
      const amount = this.clampCarryAmount(agent, result.resultItemId, 1)
      if (amount > 0) {
        incrementItemInventory(agent.itemInventory, result.resultItemId, amount)
        this.syncAgentCarryState(agent)
      }
      const craftedItem = this.itemCatalog?.getById(result.resultItemId)
      if (
        craftedItem &&
        (craftedItem.category === 'tool' || craftedItem.category === 'weapon') &&
        !agent.equippedItemId
      ) {
        agent.equippedItemId = craftedItem.id
        agent.equipmentSlots.mainHand = craftedItem.id
        if (craftedItem.category === 'tool') {
          agent.equipmentSlots.utility = craftedItem.id
        }
      }
    }

    const efficiency = result.efficiencyModifier ?? 1
    const produced = result.producedAmount ?? 1
    faction.techLevel = clamp(faction.techLevel + 0.003 + efficiency * 0.0022, 1, 12)
    const reward = clamp(0.12 + (efficiency - 1) * 0.18 + (produced - 1) * 0.08, -0.08, 0.45)
    return { crafted: true, reward }
  }

  private handleEquipItemAction(agent: Agent, faction: Faction): boolean {
    const personalCandidate = this.pickBestEquipableItem(agent.itemInventory)
    if (personalCandidate) {
      agent.equippedItemId = personalCandidate
      agent.equipmentSlots.mainHand = personalCandidate
      return true
    }

    const factionCandidate = this.pickBestEquipableItem(faction.itemInventory)
    if (!factionCandidate) {
      return false
    }

    if ((faction.itemInventory[factionCandidate] ?? 0) <= 0) {
      return false
    }
    if (!decrementItemInventory(faction.itemInventory, factionCandidate, 1)) {
      return false
    }
    const amount = this.clampCarryAmount(agent, factionCandidate, 1)
    if (amount <= 0) {
      incrementItemInventory(faction.itemInventory, factionCandidate, 1)
      return false
    }
    incrementItemInventory(agent.itemInventory, factionCandidate, amount)
    this.syncAgentCarryState(agent)
    agent.equippedItemId = factionCandidate
    agent.equipmentSlots.mainHand = factionCandidate
    return true
  }

  private pickBestUsableItem(agent: Agent): FrozenItemDefinition | null {
    if (!this.itemCatalog) {
      return null
    }
    let best: FrozenItemDefinition | null = null
    let bestScore = Number.NEGATIVE_INFINITY

    const entries = Object.entries(agent.itemInventory)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry) continue
      const itemId = normalizeItemId(entry[0])
      const quantity = entry[1]
      if (!Number.isFinite(quantity) || quantity <= 0) continue
      const item = this.itemCatalog.getById(itemId)
      if (!item) continue

      let score = 0
      if (item.category === 'food') {
        score += 1.2 + (item.baseProperties.nutrition ?? 0) * 0.08
      } else if (item.category === 'tool') {
        score += 0.8 + (item.baseProperties.durability ?? 0) * 0.01
      } else if (item.category === 'weapon') {
        score += 0.7 + (item.baseProperties.damage ?? 0) * 0.02
      } else if (item.category === 'resource') {
        score += 0.2
      } else {
        score += 0.12
      }

      if (score > bestScore) {
        bestScore = score
        best = item
      }
    }

    return best
  }

  private pickBestEquipableItem(inventory: Record<string, number>): string | null {
    if (!this.itemCatalog) {
      return null
    }

    let bestItemId: string | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    const entries = Object.entries(inventory)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry) continue
      const itemId = normalizeItemId(entry[0])
      const quantity = entry[1]
      if (!Number.isFinite(quantity) || quantity <= 0) continue
      const item = this.itemCatalog.getById(itemId)
      if (!item) continue
      if (item.category !== 'tool' && item.category !== 'weapon') continue

      const score =
        (item.baseProperties.damage ?? 0) * 0.55 +
        (item.baseProperties.durability ?? 0) * 0.12 +
        (item.category === 'weapon' ? 3 : 1)
      if (score > bestScore) {
        bestScore = score
        bestItemId = item.id
      }
    }

    return bestItemId
  }

  private findNearestGroundStack(
    x: number,
    y: number,
    maxManhattanDistance: number,
  ): GroundItemStack | null {
    let best: GroundItemStack | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    let bestQuantity = -1

    for (let i = 0; i < this.groundItems.length; i++) {
      const stack = this.groundItems[i]
      if (!stack || stack.quantity <= 0) continue
      const distance = Math.abs(stack.x - x) + Math.abs(stack.y - y)
      if (distance > maxManhattanDistance) {
        continue
      }
      if (
        distance < bestDistance ||
        (distance === bestDistance && stack.quantity > bestQuantity)
      ) {
        best = stack
        bestDistance = distance
        bestQuantity = stack.quantity
      }
    }

    return best
  }

  private seedFactionItemInventories(world: WorldState, tick: number): void {
    if (!this.itemCatalog) {
      return
    }
    const naturalItems = this.itemCatalog.items.filter((item) => item.naturalSpawn)
    if (naturalItems.length === 0) {
      return
    }

    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      faction.itemInventory = {}

      for (let k = 0; k < 4; k++) {
        const candidate = this.pickNaturalItemForBiome(
          world,
          faction.homeCenterX,
          faction.homeCenterY,
          naturalItems,
        )
        if (!candidate) continue
        incrementItemInventory(
          faction.itemInventory,
          candidate.id,
          1 + this.itemRng.nextInt(3),
        )
      }

      const members = this.agents.filter((agent) => agent.factionId === faction.id)
      for (let m = 0; m < members.length; m++) {
        const agent = members[m]
        if (!agent) continue
        agent.itemInventory = {}
        agent.inventoryItems = []
        agent.equipmentSlots = { mainHand: null, offHand: null, body: null, utility: null }
        agent.equippedItemId = null
        this.syncAgentCarryState(agent)
      }

      const recipeStates = this.craftingSystem?.getRecipeStates(
        faction.id,
        faction.techLevel,
        faction.itemInventory,
        tick,
      ) ?? []
      if (recipeStates.some((recipe) => recipe.unlocked)) {
        faction.techLevel = clamp(faction.techLevel + 0.04, 1, 12)
      }
    }
  }

  private spawnInitialGroundItems(world: WorldState, tick: number): void {
    if (!this.itemCatalog) {
      return
    }
    const count = clampInt(Math.floor((world.width * world.height) / 210), 24, 260)
    this.spawnNaturalGroundItems(world, count, tick)
  }

  private spawnNaturalGroundItems(world: WorldState, count: number, tick: number): void {
    if (!this.itemCatalog || count <= 0) {
      return
    }

    const naturalItems = this.itemCatalog.items.filter((item) => item.naturalSpawn)
    if (naturalItems.length === 0) {
      return
    }

    const maxStacks = 460
    for (let i = 0; i < count; i++) {
      if (this.groundItems.length >= maxStacks) {
        return
      }

      for (let attempt = 0; attempt < 28; attempt++) {
        const x = this.itemRng.nextInt(world.width)
        const y = this.itemRng.nextInt(world.height)
        const tile = world.tiles[world.index(x, y)] as TileId
        if (!isHabitable(tile)) {
          continue
        }

        const available: FrozenItemDefinition[] = []
        for (let j = 0; j < naturalItems.length; j++) {
          const item = naturalItems[j]
          if (!item) continue
          if (item.allowedBiomes.includes(tile)) {
            available.push(item)
          }
        }
        if (available.length === 0) {
          continue
        }

        const chosen = available[this.itemRng.nextInt(available.length)]
        if (!chosen) {
          continue
        }

        const quantity = 1 + this.itemRng.nextInt(4)
        this.addGroundStack(chosen.id, x, y, quantity, true, tick)
        break
      }
    }
  }

  private pickNaturalItemForBiome(
    world: WorldState,
    x: number,
    y: number,
    naturalItems: ReadonlyArray<FrozenItemDefinition>,
  ): FrozenItemDefinition | null {
    const tile = world.tiles[world.index(x, y)] as TileId
    const candidates: FrozenItemDefinition[] = []
    for (let i = 0; i < naturalItems.length; i++) {
      const item = naturalItems[i]
      if (!item) continue
      if (item.allowedBiomes.includes(tile)) {
        candidates.push(item)
      }
    }
    if (candidates.length === 0) {
      return naturalItems[this.itemRng.nextInt(naturalItems.length)] ?? null
    }
    return candidates[this.itemRng.nextInt(candidates.length)] ?? null
  }

  private addGroundStack(
    itemId: string,
    x: number,
    y: number,
    quantity: number,
    naturalSpawn: boolean,
    tick: number,
  ): void {
    const normalizedId = normalizeItemId(itemId)
    if (!normalizedId || quantity <= 0) {
      return
    }
    if (this.itemCatalog && !this.itemCatalog.has(normalizedId)) {
      return
    }

    for (let i = 0; i < this.groundItems.length; i++) {
      const stack = this.groundItems[i]
      if (!stack) continue
      if (stack.itemId !== normalizedId || stack.x !== x || stack.y !== y || stack.naturalSpawn !== naturalSpawn) {
        continue
      }
      stack.quantity += quantity
      return
    }

    const stack: GroundItemStack = {
      id: `gi-${this.seed}-${++this.groundItemCounter}`,
      itemId: normalizedId,
      quantity,
      x,
      y,
      spawnedAtTick: tick,
      naturalSpawn,
    }
    this.groundItems.push(stack)
    this.groundItemById.set(stack.id, stack)
  }

  private removeGroundStack(id: string): void {
    this.groundItemById.delete(id)
    const index = this.groundItems.findIndex((stack) => stack.id === id)
    if (index >= 0) {
      this.groundItems.splice(index, 1)
    }
  }

  private decayGroundItems(tick: number): void {
    const maxAge = 2600
    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const stack = this.groundItems[i]
      if (!stack) continue
      if (stack.quantity <= 0 || tick - stack.spawnedAtTick > maxAge) {
        this.groundItemById.delete(stack.id)
        this.groundItems.splice(i, 1)
      }
    }
  }

  private dropAgentInventoryToGround(agent: Agent, tick: number): void {
    const entries = Object.entries(agent.itemInventory)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry) continue
      const itemId = normalizeItemId(entry[0])
      const quantity = entry[1]
      if (!Number.isFinite(quantity) || quantity <= 0) continue
      const dropAmount = clampInt(quantity, 1, 6)
      this.addGroundStack(itemId, agent.x, agent.y, dropAmount, false, tick)
    }
    agent.itemInventory = {}
    agent.inventoryItems = []
    agent.currentCarryWeight = 0
    agent.equipmentSlots = { mainHand: null, offHand: null, body: null, utility: null }
    agent.equippedItemId = null
  }

  private pushDialogueMemory(agent: Agent, utterance: string): void {
    agent.dialogueMemory.push(utterance)
    if (agent.dialogueMemory.length > 5) {
      agent.dialogueMemory.splice(0, agent.dialogueMemory.length - 5)
    }
  }

  private pushMentalLog(
    agent: Agent,
    tick: number,
    intent: AgentIntent,
    reasonCodes: ReasonCode[],
  ): void {
    const log: MentalLog = {
      tick,
      thought: agent.currentThought || `Intent ${intent}`,
      reasonCodes: [...reasonCodes],
      linkedIntent: intent,
    }
    agent.mentalLogs.push(log)
    if (agent.mentalLogs.length > 14) {
      agent.mentalLogs.splice(0, agent.mentalLogs.length - 14)
    }
  }

  private clonePlan(plan: AgentPlan): AgentPlan {
    return {
      ...plan,
      reasonCodes: [...plan.reasonCodes],
      steps: plan.steps.map((step) => ({
        ...step,
      })),
    }
  }

  private resolveBlueprintForAgentIntent(agent: Agent): StructureBlueprint {
    if (agent.currentIntent === 'fortify') {
      return agent.role === 'Guard' ? 'watch_tower' : 'palisade'
    }
    if (agent.currentIntent === 'farm') {
      return 'farm_plot'
    }
    if (agent.currentIntent === 'expand_territory') {
      return 'watch_tower'
    }
    if (agent.role === 'Scribe' || agent.role === 'Trader') {
      return 'storage'
    }
    if (agent.role === 'Leader' || agent.role === 'Elder') {
      return 'shrine'
    }
    return 'hut'
  }

  private createDialogueRecord(
    tick: number,
    factionId: string,
    a: Agent,
    b: Agent,
    world: WorldState,
    rng: SeededRng,
  ): boolean {
    const faction = this.factionById.get(factionId)
    if (!faction) {
      return false
    }
    if (!a.activePlan || !b.activePlan) {
      return false
    }

    const scarcity = clamp(
      1 - faction.stockpile.food / Math.max(8, faction.members.length * 1.2),
      0,
      1,
    )
    const hazard = (world.hazard[world.index(a.x, a.y)] ?? 0) / 255
    const concepts = this.communicationSystem.pickCoreConcepts(faction, scarcity, hazard, rng)
    const utteranceA = this.communicationSystem.buildUtterance(faction, concepts, rng)
    const utteranceB = this.communicationSystem.buildUtterance(faction, concepts, rng)
    const stepA = this.planSystem.getCurrentStep(a.activePlan)
    const stepB = this.planSystem.getCurrentStep(b.activePlan)
    const binding = this.dialogueActionBinding.build({
      tick,
      factionId,
      factionName: this.getFactionDisplayName(faction),
      speakerA: a,
      speakerB: b,
      planA: a.activePlan,
      planB: b.activePlan,
      stepA,
      stepB,
    })

    a.lastUtteranceTokens = binding.lineA
      .replace(/[\[\]\"]/g, '')
      .split(/\s+/)
      .slice(0, 16)
    b.lastUtteranceTokens = binding.lineB
      .replace(/[\[\]\"]/g, '')
      .split(/\s+/)
      .slice(0, 16)
    this.pushDialogueMemory(a, binding.lineA)
    this.pushDialogueMemory(b, binding.lineB)

    const id = `dlg-${this.seed}-${++this.dialogueCounter}`
    const record: DialogueRecord = {
      id,
      tick,
      factionId,
      speakerAId: a.id,
      speakerBId: b.id,
      topic: binding.topic,
      utteranceA: [...utteranceA.tokens],
      utteranceB: [...utteranceB.tokens],
      actionContext: binding.actionContext,
      lines: [
        { speaker: a.name, text: binding.lineA },
        { speaker: b.name, text: binding.lineB },
      ],
      newTerms: [...utteranceA.tokens.slice(0, 1), ...utteranceB.tokens.slice(0, 1)],
      narrativeApplied: false,
    }

    this.dialogues.push(record)
    if (this.dialogues.length > 200) {
      this.dialogues.splice(0, this.dialogues.length - 200)
    }

    faction.lastDialogueTick = tick

    this.addTimeline({
      tick,
      category: 'talk',
      factionId,
      message: `Dialogo tra ${a.name} e ${b.name}`,
      x: a.x,
      y: a.y,
    })

    this.enqueueNarrative({
      id: `nr-dialogue-${id}`,
      type: 'dialogue',
      tick,
      factionId,
      payload: {
        dialogueId: id,
        speakerAName: a.name,
        speakerBName: b.name,
        contextSummary: `scarcity=${scarcity.toFixed(2)} hazard=${hazard.toFixed(2)} grammar=${faction.communication.grammarLevel} intentA=${a.currentIntent} intentB=${b.currentIntent}`,
        actionContext: binding.actionContext,
        utteranceTokens: [...utteranceA.tokens, ...utteranceB.tokens],
        recentFactionUtterances: binding.recentFactionUtterances,
        communication: this.communicationSystem.summarize(faction),
      },
    })
    return true
  }

  private applyTrade(agent: Agent, faction: Faction, rng: SeededRng, tick: number): boolean {
    const targetFaction = this.factions.find((f) => f.id !== faction.id)
    if (!targetFaction) {
      return false
    }

    const amount = 1 + Math.floor(rng.nextFloat() * 2)
    if (faction.stockpile.food < amount) {
      return false
    }

    faction.stockpile.food -= amount
    faction.stockpile.stone += amount
    targetFaction.stockpile.food += amount
    targetFaction.stockpile.stone = Math.max(0, targetFaction.stockpile.stone - amount)

    const tradeItemId = this.pickBestEquipableItem(faction.itemInventory)
    if (tradeItemId && decrementItemInventory(faction.itemInventory, tradeItemId, 1)) {
      incrementItemInventory(targetFaction.itemInventory, tradeItemId, 1)
    }

    this.ensureRelationPair(faction, targetFaction, tick)
    faction.diplomacy[targetFaction.id] = 'trade'
    targetFaction.diplomacy[faction.id] = 'trade'
    this.updateRelationPair(faction, targetFaction, 'trade', tick, 0.06, -0.08)
    this.communicationSystem.borrowTokens(faction, targetFaction, tick, rng, 0.14)
    this.communicationSystem.borrowTokens(targetFaction, faction, tick, rng, 0.1)
    agent.energy += 1
    return true
  }

  private shouldReproduce(agent: Agent, faction: Faction, rng: SeededRng): boolean {
    if (faction.members.length > 120) {
      return false
    }
    if (agent.hydration < 42) {
      return false
    }

    const chance = 0.002 + faction.cultureParams.collectivism * 0.002
    return agent.energy > 115 && agent.age > 90 && rng.chance(chance)
  }

  private shouldDie(agent: Agent): boolean {
    return agent.energy <= 0 || agent.age > 820
  }

  private mutateCulture(faction: Faction, rng: SeededRng, tick: number): void {
    if (tick % 120 !== 0) {
      return
    }

    const delta = (): number => (rng.nextFloat() - 0.5) * 0.02
    faction.cultureParams.curiosity = clamp(faction.cultureParams.curiosity + delta(), 0, 1)
    faction.cultureParams.aggression = clamp(faction.cultureParams.aggression + delta(), 0, 1)
    faction.cultureParams.spirituality = clamp(faction.cultureParams.spirituality + delta(), 0, 1)
    faction.cultureParams.tradeAffinity = clamp(faction.cultureParams.tradeAffinity + delta(), 0, 1)

    const foodStress = faction.stockpile.food < faction.members.length * 0.8 ? 0.02 : -0.01
    faction.stress = clamp(faction.stress + foodStress + (rng.nextFloat() - 0.5) * 0.01, 0, 1)

    const inventorySignal = clamp(inventoryTotal(faction.itemInventory) / 100, 0, 1)
    const curiositySignal = faction.cultureParams.curiosity
    faction.techLevel = clamp(
      faction.techLevel + 0.004 + curiositySignal * 0.004 + inventorySignal * 0.003,
      1,
      12,
    )
  }

  private tryFactionSplit(world: WorldState, rng: SeededRng, tick: number): number {
    let created = 0

    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      if (faction.members.length < 34 || faction.stress < 0.62) {
        continue
      }

      const divergence =
        Math.abs(faction.cultureParams.aggression - faction.cultureParams.tradeAffinity) +
        Math.abs(faction.cultureParams.curiosity - faction.cultureParams.tradition)
      if (divergence < 0.55) {
        continue
      }

      if (!rng.chance(0.018)) {
        continue
      }

      const splitMembers = faction.members.filter((memberId, idx) => {
        if (idx % 3 !== 0) {
          return false
        }
        const agent = memberId ? this.agentById.get(memberId) : null
        if (!agent) {
          return false
        }
        return agent.speciesId === faction.dominantSpeciesId
      })
      if (splitMembers.length < 8) {
        continue
      }

      const center = this.findSpawnPoint(world, rng)
      const childFaction = this.createFaction(
        this.factions.length + created,
        tick,
        center.x,
        center.y,
        world,
        rng,
        faction.foundingSpeciesId,
      )
      childFaction.cultureParams.aggression = clamp(faction.cultureParams.aggression + 0.08, 0, 1)
      childFaction.cultureParams.curiosity = clamp(faction.cultureParams.curiosity + 0.05, 0, 1)
      childFaction.cultureParams.tradition = clamp(faction.cultureParams.tradition - 0.07, 0, 1)
      childFaction.stress = clamp(faction.stress - 0.12, 0, 1)
      childFaction.stockpile.food += 20
      childFaction.foundingSpeciesId = faction.foundingSpeciesId
      childFaction.dominantSpeciesId = faction.dominantSpeciesId
      childFaction.ethnicityId = faction.ethnicityId
      childFaction.religionId = faction.religionId
      childFaction.religion = faction.religion
      childFaction.identitySymbol = faction.identitySymbol

      const itemEntries = Object.entries(faction.itemInventory)
      for (let t = 0; t < itemEntries.length; t++) {
        const entry = itemEntries[t]
        if (!entry) continue
        const itemId = normalizeItemId(entry[0])
        const quantity = entry[1]
        if (!Number.isFinite(quantity) || quantity <= 1) continue
        const moved = Math.floor(quantity * 0.35)
        if (moved <= 0) continue
        decrementItemInventory(faction.itemInventory, itemId, moved)
        incrementItemInventory(childFaction.itemInventory, itemId, moved)
      }

      this.factions.push(childFaction)
      this.factionById.set(childFaction.id, childFaction)
      for (let k = 0; k < this.factions.length; k++) {
        const other = this.factions[k]
        if (!other || other.id === childFaction.id) continue
        childFaction.diplomacy[other.id] = childFaction.diplomacy[other.id] ?? 'neutral'
        other.diplomacy[childFaction.id] = other.diplomacy[childFaction.id] ?? 'neutral'
        this.ensureRelationPair(childFaction, other, tick)
      }

      for (let j = 0; j < splitMembers.length; j++) {
        const memberId = splitMembers[j]
        if (!memberId) continue
        const agent = this.agentById.get(memberId)
        if (!agent) continue
        agent.factionId = childFaction.id
        agent.civilizationId = childFaction.id
        const pos = this.findNeighborSpawn(world, center.x, center.y, rng)
        agent.x = pos.x
        agent.y = pos.y
      }

      faction.stress = clamp(faction.stress - 0.2, 0, 1)

      this.addTimeline({
        tick,
        category: 'split',
        factionId: childFaction.id,
        message: `Scissione da ${this.getFactionDisplayName(faction)}, nasce ${this.getFactionDisplayName(childFaction)}`,
        x: center.x,
        y: center.y,
      })

      created++
      this.rebuildMembers()
    }

    return created
  }

  private countRole(role: AgentRole): number {
    let count = 0
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i]
      if (!agent) continue
      if (agent.role === role) {
        count++
      }
    }
    return count
  }

  private rebuildMembers(): void {
    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      faction.members.length = 0
      faction.ethnicityIds = []
    }

    const speciesCountsByFaction = new Map<string, Map<string, number>>()
    const ethnicityByFaction = new Map<string, Set<string>>()

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i]
      if (!agent) continue
      const faction = this.factionById.get(agent.factionId)
      if (!faction) continue
      if (!agent.speciesId) {
        agent.speciesId = faction.dominantSpeciesId || faction.foundingSpeciesId
      }
      agent.civilizationId = faction.id
      faction.members.push(agent.id)

      const speciesCounts = speciesCountsByFaction.get(faction.id) ?? new Map<string, number>()
      speciesCounts.set(agent.speciesId, (speciesCounts.get(agent.speciesId) ?? 0) + 1)
      speciesCountsByFaction.set(faction.id, speciesCounts)

      if (agent.ethnicityId) {
        const set = ethnicityByFaction.get(faction.id) ?? new Set<string>()
        set.add(agent.ethnicityId)
        ethnicityByFaction.set(faction.id, set)
      }
    }

    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue

      const speciesCounts = speciesCountsByFaction.get(faction.id)
      if (speciesCounts && speciesCounts.size > 0) {
        let dominantSpecies = faction.foundingSpeciesId
        let dominantCount = -1
        for (const [speciesId, count] of speciesCounts.entries()) {
          if (count > dominantCount) {
            dominantSpecies = speciesId
            dominantCount = count
          }
        }
        faction.dominantSpeciesId = dominantSpecies
      } else {
        faction.dominantSpeciesId = faction.foundingSpeciesId
      }

      const ethnicitySet = ethnicityByFaction.get(faction.id)
      if (ethnicitySet && ethnicitySet.size > 0) {
        faction.ethnicityIds = [...ethnicitySet]
          .filter((ethnicityId) => this.ethnicityById.has(ethnicityId))
          .sort()
      } else {
        faction.ethnicityIds = []
      }
      if (faction.ethnicityId && !faction.ethnicityIds.includes(faction.ethnicityId)) {
        faction.ethnicityId = faction.ethnicityIds[0] ?? null
      }
    }
  }

  private rebuildTileIndex(): void {
    this.agentsByTile.clear()

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i]
      if (!agent) continue
      const key = `${agent.x}:${agent.y}`
      const list = this.agentsByTile.get(key)
      if (list) {
        list.push(agent)
      } else {
        this.agentsByTile.set(key, [agent])
      }
    }
  }

  private stepFactionRelations(tick: number, rng: SeededRng): void {
    for (let i = 0; i < this.factions.length; i++) {
      const a = this.factions[i]
      if (!a) continue
      for (let j = i + 1; j < this.factions.length; j++) {
        const b = this.factions[j]
        if (!b) continue
        this.ensureRelationPair(a, b, tick)

        const relA = a.relations[b.id]
        const relB = b.relations[a.id]
        if (!relA || !relB) continue

        relA.trust = clamp(relA.trust + (0.5 - relA.trust) * 0.02, 0, 1)
        relB.trust = clamp(relB.trust + (0.5 - relB.trust) * 0.02, 0, 1)
        relA.tension = clamp(relA.tension + (0.28 - relA.tension) * 0.02, 0, 1)
        relB.tension = clamp(relB.tension + (0.28 - relB.tension) * 0.02, 0, 1)

        const aggressionSignal = (a.cultureParams.aggression + b.cultureParams.aggression) * 0.5
        const stressSignal = (a.stress + b.stress) * 0.5
        const warSignal = aggressionSignal * 0.55 + stressSignal * 0.25 + relA.tension * 0.2

        if (warSignal > 0.66 && rng.chance(0.09)) {
          if (relA.status !== 'hostile') {
            this.addTimeline({
              tick,
              category: 'war',
              factionId: a.id,
              message: `${this.getFactionDisplayName(a)} entra in conflitto con ${this.getFactionDisplayName(b)}`,
            })
            a.significantEvents = clampInt(a.significantEvents + 1, 0, 9999)
            b.significantEvents = clampInt(b.significantEvents + 1, 0, 9999)
          }
          this.updateRelationPair(a, b, 'hostile', tick, -0.06, 0.08)
          continue
        }

        if (relA.status === 'hostile' && relA.tension < 0.32 && relA.trust > 0.44) {
          this.updateRelationPair(a, b, 'neutral', tick, 0.03, -0.05)
          continue
        }

        if (relA.status === 'trade' && relA.trust > 0.66 && relA.tension < 0.28) {
          this.updateRelationPair(a, b, 'ally', tick, 0.03, -0.03)
          continue
        }

        const status = relA.status
        relA.intensity = clamp((relA.trust + relA.tension) * 0.5, 0, 1)
        relB.intensity = relA.intensity
        relB.status = status
        a.diplomacy[b.id] = status
        b.diplomacy[a.id] = status
        if (tick % 30 === 0) {
          this.pushRelationHistory(a, b, tick, status, relA.trust, relA.tension)
        }
      }
    }
  }

  private stepCulturalEvolution(world: WorldState, tick: number, rng: SeededRng): void {
    const worldSize = Math.max(1, world.width * world.height)
    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue

      const memberPositions: Array<{ x: number; y: number }> = []
      for (let m = 0; m < faction.members.length; m++) {
        const memberId = faction.members[m]
        if (!memberId) continue
        const agent = this.agentById.get(memberId)
        if (!agent) continue
        memberPositions.push({ x: agent.x, y: agent.y })
      }

      const resourceScarcity = clamp(
        1 - faction.stockpile.food / Math.max(8, faction.members.length * 1.2),
        0,
        1,
      )
      let hostileCount = 0
      let tensionSum = 0
      let relationCount = 0
      for (const rel of Object.values(faction.relations)) {
        if (!rel) continue
        relationCount++
        tensionSum += rel.tension
        if (rel.status === 'hostile') {
          hostileCount++
        }
      }

      const homeIdx = world.index(faction.homeCenterX, faction.homeCenterY)
      const localHazard = (world.hazard[homeIdx] ?? 0) / 255
      const territoryClaimRatio = this.territorySystem.getFactionClaimCount(faction.id) / worldSize

      const result = this.culturalEvolutionSystem.stepFaction(
        {
          tick,
          world,
          faction,
          population: faction.members.length,
          memberPositions,
          territoryClaimRatio,
          resourceScarcity,
          externalPressure: clamp(
            hostileCount * 0.25 + (relationCount > 0 ? tensionSum / relationCount : 0) * 0.4,
            0,
            1,
          ),
          disasterPressure: clamp(localHazard * 0.7 + faction.stress * 0.3, 0, 1),
          warPressure: clamp(hostileCount * 0.33 + localHazard * 0.12, 0, 1),
        },
        rng,
      )

      faction.ideology = ideologyFromCulture(faction.cultureParams.aggression, faction.cultureParams.spirituality)
      faction.writing.literacyLevel = faction.literacyLevel
      faction.stress = clamp(
        faction.stress +
          (resourceScarcity > 0.55 ? 0.01 : -0.005) +
          (localHazard > 0.42 ? 0.008 : -0.003),
        0,
        1,
      )
      faction.techLevel = clamp(
        faction.techLevel + 0.002 + faction.cultureParams.techOrientation * 0.0032 + faction.cultureParams.curiosity * 0.0024,
        1,
        12,
      )

      if (result.movedCapital) {
        this.addTimeline({
          tick,
          category: 'build',
          factionId: faction.id,
          message: `${this.getFactionDisplayName(faction)} sposta la capitale (${result.movedCapital.reason})`,
          x: result.movedCapital.x,
          y: result.movedCapital.y,
        })
      }
      if (result.notes.length > 0) {
        this.addTimeline({
          tick,
          category: 'law',
          factionId: faction.id,
          message: `${this.getFactionDisplayName(faction)} evolve cultura: ${result.notes.join(', ')}`,
          x: faction.homeCenterX,
          y: faction.homeCenterY,
        })
      }
    }
  }

  private stepEthnicityEvolution(tick: number, rng: SeededRng): number {
    const result = this.ethnicitySystem.step(
      {
        tick,
        factions: this.factions,
        agents: this.agents,
        existingEthnicities: this.ethnicities,
      },
      rng,
    )

    if (result.created.length === 0 && result.assignments.length === 0 && result.primaryAssignments.length === 0) {
      return 0
    }

    for (let i = 0; i < result.created.length; i++) {
      const ethnicity = result.created[i]
      if (!ethnicity) continue
      this.ethnicities.push(ethnicity)
      this.ethnicityById.set(ethnicity.id, ethnicity)
      const faction = this.factionById.get(ethnicity.factionId)
      if (faction) {
        if (!faction.ethnicityIds.includes(ethnicity.id)) {
          faction.ethnicityIds.push(ethnicity.id)
        }
      }

      this.addTimeline({
        tick,
        category: 'law',
        factionId: ethnicity.factionId,
        message: `Emergenza etnica ${ethnicity.id} (${ethnicity.symbol})`,
      })
    }

    for (let i = 0; i < result.assignments.length; i++) {
      const assignment = result.assignments[i]
      if (!assignment) continue
      const agent = this.agentById.get(assignment.agentId)
      const ethnicity = this.ethnicityById.get(assignment.ethnicityId)
      if (!agent || !ethnicity) continue
      if (agent.speciesId !== ethnicity.speciesId) {
        continue
      }
      agent.ethnicityId = ethnicity.id
    }

    for (let i = 0; i < result.primaryAssignments.length; i++) {
      const assignment = result.primaryAssignments[i]
      if (!assignment) continue
      const faction = this.factionById.get(assignment.factionId)
      if (!faction) continue
      faction.ethnicityId = assignment.ethnicityId
      if (!faction.ethnicityIds.includes(assignment.ethnicityId)) {
        faction.ethnicityIds.push(assignment.ethnicityId)
      }
    }

    this.rebuildMembers()
    return result.created.length
  }

  private stepIdentityEvolution(world: WorldState, tick: number, rng: SeededRng): number {
    let changes = 0

    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue

      const territoryTiles = this.territorySystem.getFactionClaimCount(faction.id)
      const homeIdx = world.index(faction.homeCenterX, faction.homeCenterY)
      const localHazard = (world.hazard[homeIdx] ?? 0) / 255
      if (localHazard > 0.62 || faction.stress > 0.7) {
        faction.significantEvents = clampInt(faction.significantEvents + 1, 0, 9999)
      }

      const result = this.identityEvolutionSystem.stepFaction(
        {
          tick,
          faction,
          territoryTiles,
          existingReligions: this.religions,
        },
        rng,
      )

      if (result.changed) {
        changes++
      }

      if (result.createdReligion) {
        this.religions.push(result.createdReligion)
        this.religionById.set(result.createdReligion.id, result.createdReligion)
        faction.religionId = result.createdReligion.id
        faction.religion = result.createdReligion.name
        this.addTimeline({
          tick,
          category: 'religion',
          factionId: faction.id,
          message: `${this.getFactionDisplayName(faction)} avvia nuova religione`,
          x: faction.homeCenterX,
          y: faction.homeCenterY,
        })
        changes++
      } else if (result.assignedReligionId) {
        faction.religionId = result.assignedReligionId
        const religion = this.religionById.get(result.assignedReligionId)
        faction.religion = religion?.name ?? faction.religion
        changes++
      }

      if (result.triggerIdentityNarrative && !this.pendingIdentityNarrativeByFaction.has(faction.id)) {
        this.pendingIdentityNarrativeByFaction.add(faction.id)
        this.enqueueNarrative({
          id: `nr-identity-${faction.id}-name`,
          type: 'faction_identity',
          tick,
          factionId: faction.id,
          payload: {
            worldSummary: this.buildIdentityWorldSummary(world, faction, territoryTiles, 'name'),
          },
        })
      }

      if (result.triggerReligionNarrative && !this.pendingReligionNarrativeByFaction.has(faction.id)) {
        this.pendingReligionNarrativeByFaction.add(faction.id)
        this.enqueueNarrative({
          id: `nr-identity-${faction.id}-religion`,
          type: 'faction_identity',
          tick,
          factionId: faction.id,
          payload: {
            worldSummary: this.buildIdentityWorldSummary(world, faction, territoryTiles, 'religion'),
          },
        })
      }
    }

    return changes
  }

  private buildIdentityWorldSummary(
    world: WorldState,
    faction: Faction,
    territoryTiles: number,
    mode: 'name' | 'religion',
  ): string {
    const idx = world.index(faction.homeCenterX, faction.homeCenterY)
    const fertility = ((world.fertility[idx] ?? 0) / 255).toFixed(2)
    const hazard = ((world.hazard[idx] ?? 0) / 255).toFixed(2)
    const speciesName =
      this.speciesStatsById.get(faction.foundingSpeciesId)?.commonName ?? faction.foundingSpeciesId
    return [
      `mode=${mode}`,
      `species=${speciesName}`,
      `population=${faction.members.length}`,
      `literacy=${faction.literacyLevel}`,
      `territory=${territoryTiles}`,
      `spirituality=${faction.cultureParams.spirituality.toFixed(2)}`,
      `fertility=${fertility}`,
      `hazard=${hazard}`,
      `strategy=${faction.adaptationStrategy}`,
    ].join(' ')
  }

  private reconcileConsistency(): void {
    this.validateEntityLinks()
    this.rebuildMembers()
    this.rebuildTileIndex()
  }

  private validateEntityLinks(): void {
    for (let i = this.factions.length - 1; i >= 0; i--) {
      const faction = this.factions[i]
      if (!faction) continue
      if (!faction.foundingSpeciesId) {
        this.factionById.delete(faction.id)
        this.factions.splice(i, 1)
      }
    }

    for (let i = this.ethnicities.length - 1; i >= 0; i--) {
      const ethnicity = this.ethnicities[i]
      if (!ethnicity) continue
      if (!ethnicity.speciesId || !this.factionById.has(ethnicity.factionId)) {
        this.ethnicityById.delete(ethnicity.id)
        this.ethnicities.splice(i, 1)
      }
    }

    for (let i = this.agents.length - 1; i >= 0; i--) {
      const agent = this.agents[i]
      if (!agent) continue
      const faction = this.factionById.get(agent.factionId)
      if (!faction) {
        this.agentById.delete(agent.id)
        this.agents.splice(i, 1)
        continue
      }
      if (!agent.speciesId) {
        agent.speciesId = faction.dominantSpeciesId || faction.foundingSpeciesId
      }
      if (agent.ethnicityId) {
        const ethnicity = this.ethnicityById.get(agent.ethnicityId)
        if (!ethnicity || ethnicity.speciesId !== agent.speciesId) {
          agent.ethnicityId = null
        }
      }
      agent.civilizationId = faction.id
    }

    for (let i = this.religions.length - 1; i >= 0; i--) {
      const religion = this.religions[i]
      if (!religion) continue
      if (!religion.speciesId) {
        this.religionById.delete(religion.id)
        this.religions.splice(i, 1)
      }
    }
  }

  private ensureRelationPair(a: Faction, b: Faction, tick: number): void {
    if (!a.relations[b.id]) {
      a.relations[b.id] = {
        status: a.diplomacy[b.id] ?? 'neutral',
        trust: 0.5,
        tension: 0.28,
        intensity: 0.4,
        lastTick: tick,
      }
    }
    if (!b.relations[a.id]) {
      b.relations[a.id] = {
        status: b.diplomacy[a.id] ?? 'neutral',
        trust: 0.5,
        tension: 0.28,
        intensity: 0.4,
        lastTick: tick,
      }
    }
    a.relationHistory[b.id] = a.relationHistory[b.id] ?? []
    b.relationHistory[a.id] = b.relationHistory[a.id] ?? []
    if (a.relationHistory[b.id]!.length === 0) {
      this.pushRelationHistory(a, b, tick, a.relations[b.id]!.status, a.relations[b.id]!.trust, a.relations[b.id]!.tension)
    }
  }

  private updateRelationPair(
    a: Faction,
    b: Faction,
    status: Faction['diplomacy'][string],
    tick: number,
    trustDelta: number,
    tensionDelta: number,
  ): void {
    this.ensureRelationPair(a, b, tick)
    const aRel = a.relations[b.id]
    const bRel = b.relations[a.id]
    if (!aRel || !bRel) {
      return
    }

    aRel.status = status
    bRel.status = status
    aRel.trust = clamp(aRel.trust + trustDelta, 0, 1)
    bRel.trust = clamp(bRel.trust + trustDelta, 0, 1)
    aRel.tension = clamp(aRel.tension + tensionDelta, 0, 1)
    bRel.tension = clamp(bRel.tension + tensionDelta, 0, 1)
    aRel.intensity = clamp((aRel.trust + aRel.tension) * 0.5, 0, 1)
    bRel.intensity = aRel.intensity
    aRel.lastTick = tick
    bRel.lastTick = tick
    a.diplomacy[b.id] = status
    b.diplomacy[a.id] = status
    this.pushRelationHistory(a, b, tick, status, aRel.trust, aRel.tension)
  }

  private pushRelationHistory(
    a: Faction,
    b: Faction,
    tick: number,
    status: Faction['diplomacy'][string],
    trust: number,
    tension: number,
  ): void {
    const aHistory = a.relationHistory[b.id] ?? []
    const bHistory = b.relationHistory[a.id] ?? []
    aHistory.push({ tick, status, trust, tension })
    bHistory.push({ tick, status, trust, tension })
    if (aHistory.length > 240) {
      aHistory.splice(0, aHistory.length - 240)
    }
    if (bHistory.length > 240) {
      bHistory.splice(0, bHistory.length - 240)
    }
    a.relationHistory[b.id] = aHistory
    b.relationHistory[a.id] = bHistory
  }

  private handleWriteAction(agent: Agent, faction: Faction, tick: number, rng: SeededRng): boolean {
    if (faction.literacyLevel < 2) {
      return false
    }
    if (agent.role !== 'Scribe' && agent.role !== 'Leader') {
      return false
    }
    if (tick - agent.lastActionTick < 36) {
      return false
    }
    if (!rng.chance(0.06 + faction.literacyLevel * 0.02)) {
      return false
    }

    const recentDuplicate = this.notes.find(
      (note) =>
        note.factionId === faction.id &&
        note.x === agent.x &&
        note.y === agent.y &&
        tick - note.createdAtTick < 120,
    )
    if (recentDuplicate) {
      return false
    }

    const tokenContent = this.createWritingTokenContent(agent, faction, tick, rng)
    const note: Note = {
      id: `note-${this.seed}-${++this.noteCounter}`,
      authorId: agent.id,
      factionId: faction.id,
      createdAtTick: tick,
      tokenContent,
      translatedContent: undefined,
      x: agent.x,
      y: agent.y,
    }
    this.notes.push(note)
    this.noteById.set(note.id, note)
    if (this.notes.length > 620) {
      const cut = this.notes.length - 620
      const removed = this.notes.splice(0, cut)
      for (let i = 0; i < removed.length; i++) {
        const item = removed[i]
        if (!item) continue
        this.noteById.delete(item.id)
      }
    }

    faction.writing.writingArtifacts.push(note.id)
    if (faction.writing.writingArtifacts.length > 320) {
      faction.writing.writingArtifacts.splice(0, faction.writing.writingArtifacts.length - 320)
    }

    incrementItemInventory(agent.itemInventory, 'writing-tablet', 1)
    incrementItemInventory(faction.itemInventory, 'writing-tablet', 1)
    this.syncAgentCarryState(agent)

    this.addTimeline({
      tick,
      category: 'law',
      factionId: faction.id,
      message: `${this.getFactionDisplayName(faction)} registra nota ${note.id}`,
      x: note.x,
      y: note.y,
    })

    return true
  }

  private createWritingTokenContent(agent: Agent, faction: Faction, tick: number, rng: SeededRng): string {
    const symbolSet = faction.writing.symbolSet.length > 0 ? faction.writing.symbolSet : ['ka0', 'ru1']
    const tokenCount = faction.literacyLevel >= 4 ? 7 : faction.literacyLevel >= 3 ? 6 : 4
    const tokens: string[] = []

    for (let i = 0; i < tokenCount; i++) {
      const reason = agent.mentalState.lastReasonCodes[i % Math.max(1, agent.mentalState.lastReasonCodes.length)]
      const symbol = symbolSet[(rng.nextInt(symbolSet.length) + tick + i + this.noteCounter) % symbolSet.length] ?? 'ka0'
      const suffix = reason ? reason.slice(0, 3).toLowerCase() : 'mem'
      tokens.push(`${symbol}.${suffix}`)
    }

    return tokens.join(' ')
  }

  private itemUnitWeight(itemId: string): number {
    const normalized = normalizeItemId(itemId)
    if (!normalized) {
      return 1
    }
    if (normalized === 'writing-tablet') {
      return 1.4
    }
    const fromCatalog = this.itemCatalog?.getById(normalized)?.baseProperties.weight
    if (typeof fromCatalog === 'number' && Number.isFinite(fromCatalog) && fromCatalog > 0) {
      return fromCatalog
    }
    return 1
  }

  private clampCarryAmount(agent: Agent, itemId: string, desiredAmount: number): number {
    if (!Number.isFinite(desiredAmount) || desiredAmount <= 0) {
      return 0
    }
    this.syncAgentCarryState(agent)
    const weight = this.itemUnitWeight(itemId)
    const remaining = Math.max(0, agent.maxCarryWeight - agent.currentCarryWeight)
    const maxByWeight = Math.floor(remaining / Math.max(0.01, weight))
    return Math.max(0, Math.min(desiredAmount, maxByWeight))
  }

  private syncAgentCarryState(agent: Agent): void {
    const entries = Object.entries(agent.itemInventory)
      .filter((entry) => Number(entry[1]) > 0)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    const list: AgentInventoryEntry[] = []
    let carry = 0
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry) continue
      const itemId = normalizeItemId(entry[0])
      const quantity = Number(entry[1])
      if (!itemId || !Number.isFinite(quantity) || quantity <= 0) continue
      list.push({ itemId, quantity })
      carry += this.itemUnitWeight(itemId) * quantity
    }
    agent.inventoryItems = list
    agent.currentCarryWeight = carry
  }

  private buildAgentInventoryRows(agent: Agent): AgentInspectorData['inventoryRows'] {
    const rows: AgentInspectorData['inventoryRows'] = []
    const entries = Object.entries(agent.itemInventory)
    for (let i = 0; i < entries.length; i++) {
      const [itemIdRaw, quantityRaw] = entries[i] ?? []
      const itemId = normalizeItemId(itemIdRaw ?? '')
      const quantity = Number(quantityRaw)
      if (!itemId || !Number.isFinite(quantity) || quantity <= 0) continue
      const catalogItem = this.itemCatalog?.getById(itemId)
      rows.push({
        itemId,
        itemName: catalogItem?.name ?? itemId,
        category: catalogItem?.category ?? 'unknown',
        quantity,
        totalWeight: quantity * this.itemUnitWeight(itemId),
      })
    }
    rows.sort((a, b) => b.quantity - a.quantity || a.itemName.localeCompare(b.itemName))
    return rows
  }

  private cloneInventoryEntries(entries: AgentInventoryEntry[]): AgentInventoryEntry[] {
    const out: AgentInventoryEntry[] = []
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i]
      if (!item) continue
      out.push({ itemId: item.itemId, quantity: item.quantity })
    }
    return out
  }

  private sampleMetrics(tick: number): void {
    const populations: Record<string, number> = {}
    let spiritSum = 0
    let popDen = 0
    let hostility = 0

    for (let i = 0; i < this.factions.length; i++) {
      const faction = this.factions[i]
      if (!faction) continue
      const pop = faction.members.length
      populations[faction.id] = pop
      spiritSum += faction.cultureParams.spirituality
      popDen++

      const dip = Object.values(faction.diplomacy)
      for (let d = 0; d < dip.length; d++) {
        if (dip[d] === 'hostile') {
          hostility += 1
        }
      }
    }

    this.metrics.push({
      tick,
      populations,
      conflictIndex: hostility,
      spiritualityAverage: popDen > 0 ? spiritSum / popDen : 0,
    })

    if (this.metrics.length > 1200) {
      this.metrics.splice(0, this.metrics.length - 1200)
    }
  }

  private enqueueNarrative(request: NarrativeRequest): void {
    if (this.pendingNarrativeKeys.has(request.id)) {
      return
    }
    this.pendingNarrativeKeys.add(request.id)
    this.pendingNarratives.push(request)
  }

  private addTimeline(entry: Omit<CivTimelineEntry, 'id'>): void {
    const item: CivTimelineEntry = {
      id: `ctl-${this.seed}-${++this.timelineCounter}`,
      ...entry,
    }
    this.timeline.push(item)
    if (this.timeline.length > 800) {
      this.timeline.splice(0, this.timeline.length - 800)
    }
  }
}
