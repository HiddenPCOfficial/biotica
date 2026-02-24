import type { TileId } from '../game/enums/TileId'

export type AgentRole =
  | 'Scout'
  | 'Farmer'
  | 'Builder'
  | 'Leader'
  | 'Scribe'
  | 'Guard'
  | 'Trader'
  | 'Elder'

export type AgentGoal =
  | 'Explore'
  | 'Gather'
  | 'Build'
  | 'Farm'
  | 'Defend'
  | 'Trade'
  | 'Talk'
  | 'Worship'
  | 'PickItem'
  | 'UseItem'
  | 'CraftItem'
  | 'EquipItem'
  | 'Write'

export type AgentIntent =
  | 'explore'
  | 'gather'
  | 'hunt'
  | 'build'
  | 'fortify'
  | 'migrate'
  | 'farm'
  | 'trade'
  | 'defend'
  | 'invent'
  | 'write'
  | 'negotiate'
  | 'expand_territory'
  | 'domesticate_species'

export type PlanActionType =
  | 'move_to'
  | 'observe'
  | 'gather_resource'
  | 'hunt_prey'
  | 'construct'
  | 'fortify_border'
  | 'farm_plot'
  | 'trade_exchange'
  | 'defend_area'
  | 'invent_tool'
  | 'write_record'
  | 'negotiate_terms'
  | 'claim_territory'
  | 'domesticate'
  | 'relocate_home'

export type StructureBlueprint =
  | 'hut'
  | 'storage'
  | 'palisade'
  | 'shrine'
  | 'farm_plot'
  | 'watch_tower'

export type PlanStatus = 'draft' | 'active' | 'completed' | 'failed'

export type PlanActionStep = {
  id: string
  actionType: PlanActionType
  goal: AgentGoal
  description: string
  targetX: number
  targetY: number
  targetLabel: string
  requiredTicks: number
  elapsedTicks: number
  completed: boolean
  structureBlueprint?: StructureBlueprint
}

export type AgentPlan = {
  id: string
  intent: AgentIntent
  status: PlanStatus
  createdAtTick: number
  reasonCodes: ReasonCode[]
  steps: PlanActionStep[]
  currentStepIndex: number
  progress01: number
}

export type AgentPlanSummary = {
  id: string
  intent: AgentIntent
  status: PlanStatus
  currentStepIndex: number
  totalSteps: number
  progress01: number
  currentStepDescription: string
  currentStepActionType: PlanActionType | null
  currentStepTargetLabel: string
}

export type AgentActivityState =
  | 'idle'
  | 'moving'
  | 'building'
  | 'writing'
  | 'hunting'
  | 'talking'
  | 'gathering'
  | 'farming'
  | 'crafting'
  | 'trading'
  | 'defending'
  | 'worshipping'

export type ReasonCode =
  | 'SEEK_FOOD'
  | 'SEEK_WATER'
  | 'AVOID_HAZARD'
  | 'DEFEND_TERRITORY'
  | 'FOLLOW_LEADER'
  | 'EXPLORE_FRONTIER'
  | 'COLLECT_RESOURCES'
  | 'BUILD_INFRA'
  | 'SOCIAL_COHESION'
  | 'TRADE_OPPORTUNITY'
  | 'RITUAL_NEED'
  | 'CRAFT_UPGRADE'
  | 'EQUIP_TOOL'
  | 'WRITE_RECORD'
  | 'MIGRATE_PRESSURE'
  | 'FORTIFY_BORDER'
  | 'INVENT_TECH'
  | 'NEGOTIATE_RELATION'
  | 'EXPAND_INFLUENCE'
  | 'DOMESTICATE_NEED'
  | 'PLAN_CONTINUITY'

export type MentalState = {
  currentGoal: AgentGoal
  lastAction: AgentActivityState
  lastReasonCodes: ReasonCode[]
  perceivedFoodLevel: number
  perceivedThreatLevel: number
  stressLevel: number
  loyaltyToFaction: number
  targetX: number
  targetY: number
  targetLabel: string
  emotionalTone: 'calm' | 'focused' | 'urgent' | 'alarmed'
}

export type MentalLog = {
  tick: number
  thought: string
  reasonCodes: ReasonCode[]
  linkedIntent: AgentIntent
}

export type StructureType =
  | 'Camp'
  | 'House'
  | 'FarmPlot'
  | 'Storage'
  | 'WatchTower'
  | 'Road'
  | 'Temple'
  | 'Wall'

export type Inventory = {
  food: number
  wood: number
  stone: number
  ore: number
}

export type ItemInventory = Record<string, number>

export type AgentInventoryEntry = {
  itemId: string
  quantity: number
}

export type EquipmentSlots = {
  mainHand: string | null
  offHand: string | null
  body: string | null
  utility: string | null
}

export type Concept =
  | 'FOOD'
  | 'WATER'
  | 'DANGER'
  | 'SHELTER'
  | 'TRADE'
  | 'MATE'
  | 'GOD'
  | 'LAW'
  | 'FIRE'
  | 'EARTH'

export type Lexicon = Record<Concept, string>

export type Utterance = {
  tokens: string[]
  grammarLevel: number
}

export type CommunicationState = {
  lexicon: Lexicon
  grammarLevel: number
  lastDriftTick: number
  lastBorrowTick: number
}

export type CommunicationSummary = {
  lexicon: Lexicon
  grammarLevel: number
}

export type Relations = {
  trust: Record<string, number>
}

export type AgentTraits = {
  intelligence: number
  sociability: number
  spirituality: number
  bravery: number
  diligence: number
}

export type AgentKnowledge = {
  discoveredCount: number
  lastSharedTick: number
  hazardEstimate: number
  fertilityEstimate: number
  discoveredBiomes: Partial<Record<TileId, number>>
}

export type Agent = {
  id: string
  speciesId: string
  civilizationId: string | null
  ethnicityId: string | null
  factionId: string
  x: number
  y: number
  energy: number
  hydration: number
  age: number
  role: AgentRole
  traits: AgentTraits
  knowledge: AgentKnowledge
  inventory: Inventory
  itemInventory: ItemInventory
  inventoryItems: AgentInventoryEntry[]
  equipmentSlots: EquipmentSlots
  equippedItemId: string | null
  maxCarryWeight: number
  currentCarryWeight: number
  relations: Relations
  lastTalkTick: number
  lastDecisionTick: number
  lastActionTick: number
  currentIntent: AgentIntent
  currentGoal: AgentGoal
  proposedPlan: AgentPlan | null
  activePlan: AgentPlan | null
  lastAction: string
  activityState: AgentActivityState
  goalTargetX: number
  goalTargetY: number
  generation: number
  name: string
  vitality: number
  hunger: number
  waterNeed: number
  hazardStress: number
  currentThought: string
  thoughtGloss?: string
  mentalState: MentalState
  mentalLogs: MentalLog[]
  dialogueMemory: string[]
  lastUtteranceTokens: string[]
  lastUtteranceGloss?: string
}

export type CultureParams = {
  collectivism: number
  aggression: number
  spirituality: number
  curiosity: number
  tradition: number
  tradeAffinity: number
  tabooHazard: number
  sacredBiomes: TileId[]
  hierarchyLevel: number
  environmentalAdaptation: number
  techOrientation: number
}

export type DiplomacyStatus = 'neutral' | 'ally' | 'trade' | 'hostile'

export type KnowledgeMap = {
  discovered: Uint8Array
  fertilityModel: Uint8Array
  hazardModel: Uint8Array
}

export type FactionNarrative = {
  name: string
  motto: string
  religion: string
  coreLaws: string[]
}

export type LiteracyLevel = 0 | 1 | 2 | 3 | 4 | 5

export type WritingSystem = {
  literacyLevel: LiteracyLevel
  symbolSet: string[]
  writingArtifacts: string[]
}

export type Ethnicity = {
  id: string
  speciesId: string
  factionId: string
  name: string | null
  symbol: string
  culturalTraits: string[]
  createdAtTick: number
}

export type Religion = {
  id: string
  speciesId: string
  ethnicityId: string | null
  name: string | null
  coreBeliefs: string[]
  sacredSpeciesIds: string[]
  createdAtTick: number
  description: string | null
}

export type CivStateLabel = 'tribe' | 'society' | 'state'

export type CultureStrategy = 'defensive' | 'offensive' | 'balanced' | 'migration' | 'nomadic'

export type CultureHistoryPoint = {
  tick: number
  collectivism: number
  aggression: number
  spirituality: number
  curiosity: number
  environmentalAdaptation: number
  techOrientation: number
  strategy: CultureStrategy
  practices: string[]
}

export type FactionRelationState = {
  status: DiplomacyStatus
  trust: number
  tension: number
  intensity: number
  lastTick: number
}

export type RelationHistoryPoint = {
  tick: number
  trust: number
  tension: number
  status: DiplomacyStatus
}

export type Faction = {
  id: string
  name: string | null
  identitySymbol: string | null
  foundingSpeciesId: string
  dominantSpeciesId: string
  ethnicityId: string | null
  ethnicityIds: string[]
  religionId: string | null
  ideology: string
  religion: string | null
  laws: string[]
  techLevel: number
  literacyLevel: LiteracyLevel
  state: CivStateLabel
  writing: WritingSystem
  adaptationStrategy: CultureStrategy
  dominantPractices: string[]
  cultureHistory: CultureHistoryPoint[]
  cultureParams: CultureParams
  homeCenterX: number
  homeCenterY: number
  members: string[]
  diplomacy: Record<string, DiplomacyStatus>
  relations: Record<string, FactionRelationState>
  relationHistory: Record<string, RelationHistoryPoint[]>
  knowledgeMap: KnowledgeMap
  stockpile: Inventory
  itemInventory: ItemInventory
  stress: number
  culturalIdentityLevel: number
  significantEvents: number
  foundedAtTick: number
  lastDialogueTick: number
  lastChronicleTick: number
  lastCultureShiftTick: number
  communication: CommunicationState
  narrative?: FactionNarrative
}

export type TerritoryFactionState = {
  factionId: string
  homeCenterX: number
  homeCenterY: number
  territoryInfluenceMap: Float32Array
  controlLevel: Float32Array
  claimedTiles: Uint8Array
  claimedCount: number
}

export type TerritoryMapSnapshot = {
  ownerMap: Uint16Array
  controlMap: Uint8Array
  borderMap: Uint8Array
  version: number
  factionOrder: string[]
}

export type TerritoryOverlayCell = {
  x: number
  y: number
  factionId: string
  controlLevel: number
  isBorder: boolean
}

export type TerritorySummary = {
  width: number
  height: number
  factionOrder: string[]
  claimedByFaction: Record<string, number>
  overlayCells: TerritoryOverlayCell[]
}

export type Note = {
  id: string
  authorId: string
  factionId: string
  createdAtTick: number
  tokenContent: string
  translatedContent?: string
  x: number
  y: number
}

export type StructureStorage = {
  food: number
  wood: number
  stone: number
  ore: number
}

export type Structure = {
  id: string
  type: StructureType
  blueprint?: StructureBlueprint
  x: number
  y: number
  factionId: string
  hp: number
  storage: StructureStorage
  builtAtTick: number
  completed: boolean
  progress: number
}

export type ResourceNode = {
  id: string
  type: 'Tree' | 'Stone' | 'Ore' | 'Berry'
  x: number
  y: number
  amount: number
}

export type BuildTask = {
  id: string
  structureId: string
  type: StructureType
  factionId: string
  x: number
  y: number
  progress: number
  required: number
  startedAtTick: number
}

export type DialogueLine = {
  speaker: string
  text: string
}

export type DialogueBeliefUpdate = {
  spirituality_delta?: number
  taboo_hazard?: boolean
}

export type DialoguePayload = {
  topic: 'discovery' | 'trade' | 'war' | 'religion' | 'law' | 'fear' | 'hope'
  lines: DialogueLine[]
  new_terms: string[]
  belief_update?: DialogueBeliefUpdate
}

export type UtteranceTranslation = {
  gloss_it: string
  tone: string
  new_terms: string[]
}

export type DialogueRecord = {
  id: string
  tick: number
  factionId: string
  speakerAId: string
  speakerBId: string
  topic: string
  utteranceA: string[]
  utteranceB: string[]
  actionContext: string
  lines: DialogueLine[]
  newTerms: string[]
  glossIt?: string
  tone?: string
  narrativeApplied: boolean
}

export type CivTimelineCategory =
  | 'foundation'
  | 'split'
  | 'build'
  | 'trade'
  | 'war'
  | 'talk'
  | 'religion'
  | 'law'

export type CivTimelineEntry = {
  id: string
  tick: number
  category: CivTimelineCategory
  factionId: string
  message: string
  x?: number
  y?: number
}

export type FactionSummary = {
  id: string
  name: string
  rawName: string | null
  identitySymbol: string | null
  foundingSpeciesId: string
  dominantSpeciesId: string
  ethnicityId: string | null
  ethnicityIds: string[]
  religionId: string | null
  religionName: string | null
  population: number
  techLevel: number
  literacyLevel: number
  state: CivStateLabel
  religion: string | null
  spirituality: number
  aggression: number
  curiosity: number
  tradeAffinity: number
  collectivism: number
  environmentalAdaptation: number
  techOrientation: number
  strategy: CultureStrategy
  dominantPractices: string[]
  grammarLevel: number
  foundedAtTick: number
  homeCenterX: number
  homeCenterY: number
  territoryTiles: number
  diplomacy?: Record<string, DiplomacyStatus>
}

export type FactionMemberSummary = {
  agentId: string
  speciesId: string
  civilizationId: string | null
  ethnicityId: string | null
  factionId: string
  factionName: string
  name: string
  role: AgentRole
  age: number
  energy: number
  hydration: number
  x: number
  y: number
  currentIntent: AgentIntent
  goal: AgentGoal
  activityState: AgentActivityState
  lastAction: string
  activePlan: AgentPlanSummary | null
  inventoryItems: AgentInventoryEntry[]
  equipmentSlots: EquipmentSlots
  maxCarryWeight: number
  currentCarryWeight: number
  mentalState: MentalState
}

export type FactionRelationSummary = {
  fromId: string
  toId: string
  status: DiplomacyStatus
  trust: number
  tension: number
  intensity: number
}

export type FactionRelationSeries = {
  relationKey: string
  fromId: string
  toId: string
  points: RelationHistoryPoint[]
}

export type CivMetricsPoint = {
  tick: number
  populations: Record<string, number>
  conflictIndex: number
  spiritualityAverage: number
}

export type EthnicitySummary = {
  id: string
  speciesId: string
  factionId: string
  name: string | null
  symbol: string
  culturalTraits: string[]
  createdAtTick: number
}

export type ReligionSummary = {
  id: string
  speciesId: string
  ethnicityId: string | null
  name: string | null
  coreBeliefs: string[]
  sacredSpeciesIds: string[]
  createdAtTick: number
  description: string | null
}

export type NarrativeRequest =
  | {
      id: string
      type: 'faction_identity'
      tick: number
      factionId: string
      payload: {
        worldSummary: string
      }
    }
  | {
      id: string
      type: 'dialogue'
      tick: number
      factionId: string
      payload: {
        dialogueId: string
        speakerAName: string
        speakerBName: string
        contextSummary: string
        actionContext: string
        utteranceTokens: string[]
        recentFactionUtterances: string[]
        communication: CommunicationSummary
      }
    }
  | {
      id: string
      type: 'chronicle'
      tick: number
      factionId: string
      payload: {
        recentLogs: string[]
      }
    }

export type CivStepResult = {
  changed: boolean
  births: number
  deaths: number
  newFactions: number
  talks: number
  completedBuildings: number
  notesWritten: number
}

export type GroundItemStack = {
  id: string
  itemId: string
  quantity: number
  x: number
  y: number
  spawnedAtTick: number
  naturalSpawn: boolean
}

export type CivItemCategory =
  | 'resource'
  | 'tool'
  | 'weapon'
  | 'food'
  | 'component'
  | 'structure_part'
  | 'artifact'

export type CivItemCatalogRow = {
  id: string
  name: string
  category: CivItemCategory
  baseProperties: {
    nutrition?: number
    durability?: number
    damage?: number
    buildValue?: number
    storage?: number
    weight: number
  }
  naturalSpawn: boolean
  allowedBiomes: number[]
}

export type CivCraftableItemRow = {
  id: string
  requiredItems: string[]
  requiredItemNames: string[]
  requiredTechLevel: number
  resultItemId: string
  resultItemName: string
  efficiencyModifier: number
  unlocked: boolean
  canCraft: boolean
  newlyUnlocked: boolean
  missingItems: string[]
}

export type CivFactionInventoryRow = {
  itemId: string
  itemName: string
  category: CivItemCategory
  quantity: number
}

export type CivGroundItemRow = {
  id: string
  itemId: string
  itemName: string
  category: CivItemCategory
  quantity: number
  x: number
  y: number
  naturalSpawn: boolean
  ageTicks: number
}

export type CivItemsSnapshot = {
  catalogSeed: number
  catalogCreatedAtMs: number
  catalog: CivItemCatalogRow[]
  selectedFactionId: string | null
  selectedFactionName: string | null
  selectedFactionTechLevel: number
  craftableItems: CivCraftableItemRow[]
  factionInventory: CivFactionInventoryRow[]
  groundItems: CivGroundItemRow[]
}

export type AgentInspectorInventoryRow = {
  itemId: string
  itemName: string
  category: CivItemCategory | 'unknown'
  quantity: number
  totalWeight: number
}

export type AgentInspectorData = {
  agentId: string
  speciesId: string
  civilizationId: string | null
  ethnicityId: string | null
  name: string
  factionId: string
  factionName: string
  role: AgentRole
  age: number
  energy: number
  hydration: number
  x: number
  y: number
  inventory: Inventory
  itemInventory: ItemInventory
  inventoryRows: AgentInspectorInventoryRow[]
  equipmentSlots: EquipmentSlots
  equippedItemId: string | null
  maxCarryWeight: number
  currentCarryWeight: number
  relationsCount: number
  currentIntent: AgentIntent
  goal: AgentGoal
  activityState: AgentActivityState
  lastAction: string
  proposedPlan: AgentPlanSummary | null
  activePlan: AgentPlanSummary | null
  vitality: number
  hunger: number
  waterNeed: number
  hazardStress: number
  currentThought: string
  thoughtGloss?: string
  latestMentalLog?: MentalLog
  mentalState: MentalState
  narrativeBio?: string
  lastUtteranceTokens: string[]
  lastUtteranceGloss?: string
}
