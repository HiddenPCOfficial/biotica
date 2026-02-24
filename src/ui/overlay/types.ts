export type OverlayTabId =
  | 'overview'
  | 'events'
  | 'species'
  | 'environment'
  | 'worldGenesis'
  | 'structures'
  | 'civilizations'
  | 'individuals'
  | 'items'
  | 'aiChat'
  | 'logs'

export type OverlayToggleType = 'temperature' | 'humidity' | 'fertility' | 'hazard' | 'biomes'

export type OverlayToggles = Record<OverlayToggleType, boolean>

export type Severity = 'info' | 'warn' | 'error'

export type DataPoint = {
  tick: number
  value: number
}

export type NamedSeriesPoint = {
  tick: number
  values: Record<string, number>
}

export type TopSpeciesItem = {
  speciesId: string
  commonName: string
  name: string
  color: string
  createdAtTick: number
  population: number
  parentSpeciesId: string | null
  lineageIds: string[]
  lineageNames: string[]
  avgEnergy: number
  avgHealth: number
  avgHydration: number
  avgWaterNeed: number
  avgAge: number
  avgGeneration: number
  avgTempStress: number
  avgHumidityStress: number
  vitality: number
  traits: string[]
  allowedBiomes: number[]
  habitatHint: string
  dietType: 0 | 1 | 2
  sizeClass: 'small' | 'medium' | 'large'
  intelligence: number
  languageLevel: number
  socialComplexity: number
  eventPressure: number
  cognitionStage: string
  isIntelligent: boolean
  firstIntelligentTick: number | null
  thoughtSamples: string[]
  dialogueSamples: string[]
  avgTraits: string
  civilizationIds: string[]
  civilizationNames: string[]
  ethnicityIds: string[]
  ethnicityNames: string[]
}

export type AlertItem = {
  id: string
  tick: number
  severity: Severity
  message: string
}

export type WorldSummary = {
  avgTemp: number
  avgHumidity: number
  avgFertility: number
  avgHazard: number
  biomassTotal: number
  hazardTotal: number
}

export type PopulationSummary = {
  totalCreatures: number
  biodiversity: number
  shannonIndex: number
  totalBiomass: number
  birthsPerMin: number
  deathsPerMin: number
  extinctions: number
  topSpecies: TopSpeciesItem[]
  speciesRows: TopSpeciesItem[]
  populationSeries: DataPoint[]
  topSpeciesSeries: NamedSeriesPoint[]
  speciesPopulationHistory: Record<string, DataPoint[]>
  speciesEnergyHistory: Record<string, DataPoint[]>
  alerts: AlertItem[]
}

export type EventCard = {
  id: string
  type: string
  intensity: number
  remainingTicks: number
  tick: number
  x: number
  y: number
  summary?: string
}

export type EventsSummary = {
  activeEvents: EventCard[]
  recentEvents: EventCard[]
  eventsPerMinuteSeries: DataPoint[]
}

export type EnvironmentSummary = {
  avgTemp: number
  avgHumidity: number
  avgFertility: number
  avgHazard: number
  tempSeries: DataPoint[]
  humiditySeries: DataPoint[]
  fertilitySeries: DataPoint[]
  hazardSeries: DataPoint[]
  overlayToggles: OverlayToggles
  tuning: Record<string, number>
}

export type CivFactionRow = {
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
  state: 'tribe' | 'society' | 'state'
  religion: string | null
  spirituality: number
  aggression: number
  curiosity: number
  tradeAffinity: number
  collectivism: number
  environmentalAdaptation: number
  techOrientation: number
  strategy: 'defensive' | 'offensive' | 'balanced' | 'migration' | 'nomadic'
  dominantPractices: string[]
  territoryTiles: number
}

export type CivDialogueRow = {
  id: string
  tick: number
  factionId: string
  topic: string
  lines: string[]
  gloss?: string
  tone?: string
}

export type CivInteractionEdge = {
  fromId: string
  toId: string
  status: 'neutral' | 'ally' | 'trade' | 'hostile'
  weight: number
}

export type CivMentalState = {
  currentGoal: string
  lastAction: string
  lastReasonCodes: string[]
  perceivedFoodLevel: number
  perceivedThreatLevel: number
  stressLevel: number
  loyaltyToFaction: number
  targetX: number
  targetY: number
  targetLabel: string
  emotionalTone: 'calm' | 'focused' | 'urgent' | 'alarmed'
}

export type CivPlanSummary = {
  id: string
  intent: string
  status: string
  currentStepIndex: number
  totalSteps: number
  progress01: number
  currentStepDescription: string
  currentStepActionType: string | null
  currentStepTargetLabel: string
}

export type CivMentalLog = {
  tick: number
  thought: string
  reasonCodes: string[]
  linkedIntent: string
}

export type CivMemberInventoryRow = {
  itemId: string
  quantity: number
}

export type CivEquipmentSlots = {
  mainHand: string | null
  offHand: string | null
  body: string | null
  utility: string | null
}

export type CivMemberRow = {
  agentId: string
  speciesId: string
  civilizationId: string | null
  ethnicityId: string | null
  factionId: string
  factionName: string
  name: string
  role: string
  age: number
  energy: number
  hydration: number
  x: number
  y: number
  currentIntent: string
  goal: string
  activityState: string
  lastAction: string
  activePlan: CivPlanSummary | null
  inventoryItems: CivMemberInventoryRow[]
  equipmentSlots: CivEquipmentSlots
  maxCarryWeight: number
  currentCarryWeight: number
  mentalState: CivMentalState
}

export type CivEthnicityRow = {
  id: string
  speciesId: string
  factionId: string
  name: string | null
  symbol: string
  culturalTraits: string[]
  createdAtTick: number
}

export type CivReligionRow = {
  id: string
  speciesId: string
  ethnicityId: string | null
  name: string | null
  coreBeliefs: string[]
  sacredSpeciesIds: string[]
  createdAtTick: number
  description: string | null
}

export type CivTerritoryCell = {
  x: number
  y: number
  factionId: string
  controlLevel: number
  isBorder: boolean
}

export type CivTerritorySummary = {
  width: number
  height: number
  factionOrder: string[]
  claimedByFaction: Record<string, number>
  overlayCells: CivTerritoryCell[]
}

export type CivNoteRow = {
  id: string
  authorId: string
  factionId: string
  createdAtTick: number
  tokenContent: string
  translatedContent?: string
  x: number
  y: number
}

export type CivRelationRow = {
  fromId: string
  toId: string
  status: 'neutral' | 'ally' | 'trade' | 'hostile'
  trust: number
  tension: number
  intensity: number
}

export type CivRelationSeriesPoint = {
  tick: number
  trust: number
  tension: number
  status: 'neutral' | 'ally' | 'trade' | 'hostile'
}

export type CivRelationSeries = {
  relationKey: string
  fromId: string
  toId: string
  points: CivRelationSeriesPoint[]
}

export type CivStructureRow = {
  id: string
  type: string
  blueprint?: string
  factionId: string
  x: number
  y: number
  completed: boolean
  progress: number
  builtAtTick: number
}

export type CivSummary = {
  factions: CivFactionRow[]
  wars: number
  trades: number
  selectedFactionId: string | null
  selectedSpeciesId: string | null
  populationSeries: NamedSeriesPoint[]
  recentDialogues: CivDialogueRow[]
  territories: CivTerritorySummary
  factionMembers: CivMemberRow[]
  ethnicities: CivEthnicityRow[]
  religions: CivReligionRow[]
  notes: CivNoteRow[]
  relations: CivRelationRow[]
  relationSeries: CivRelationSeries[]
  interactionEdges: CivInteractionEdge[]
  structures: CivStructureRow[]
  speciesLinks: Record<
    string,
    {
      civilizationIds: string[]
      ethnicityIds: string[]
    }
  >
}

export type ItemCategory =
  | 'resource'
  | 'tool'
  | 'weapon'
  | 'food'
  | 'component'
  | 'structure_part'
  | 'artifact'

export type ItemCatalogRow = {
  id: string
  name: string
  category: ItemCategory
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

export type CraftableItemRow = {
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

export type FactionInventoryItemRow = {
  itemId: string
  itemName: string
  category: ItemCategory
  quantity: number
}

export type GroundItemRow = {
  id: string
  itemId: string
  itemName: string
  category: ItemCategory
  quantity: number
  x: number
  y: number
  naturalSpawn: boolean
  ageTicks: number
}

export type MaterialCatalogRow = {
  id: string
  category: 'raw' | 'processed'
  hardness: number
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
  rarity: number
  allowedBiomes: number[]
}

export type ResourceNodeDensity = {
  totalNodes: number
  treeNodes: number
  stoneNodes: number
  ironNodes: number
  clayNodes: number
  totalRemainingAmount: number
}

export type ResourceNodeRow = {
  id: string
  type: 'tree' | 'stone_vein' | 'iron_vein' | 'clay_patch'
  x: number
  y: number
  amount: number
  regenRate: number
  requiredToolTag?: string
  yieldsMaterialId: string
}

export type StructureCatalogCostRow = {
  materialId: string
  amount: number
}

export type StructureCatalogRow = {
  id: string
  name: string
  size: { w: number; h: number }
  requiredTechLevel: number
  buildCost: StructureCatalogCostRow[]
  utilityTags: string[]
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
}

export type StructureBuildableRow = {
  id: string
  name: string
  requiredTechLevel: number
  unlocked: boolean
  missingMaterials: string[]
}

export type StructureWorldRow = {
  id: string
  defId: string
  name: string
  factionId: string
  x: number
  y: number
  w: number
  h: number
  state: 'building' | 'active' | 'damaged' | 'abandoned'
  hp: number
  maxHp: number
  builtAtTick: number
}

export type SelectedStructureSummary = {
  id: string
  defId: string
  name: string
  ownerFactionId: string
  x: number
  y: number
  w: number
  h: number
  state: 'building' | 'active' | 'damaged' | 'abandoned'
  hp: number
  maxHp: number
  utilityTags: string[]
  buildCost: StructureCatalogCostRow[]
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
}

export type VolcanoSummary = {
  anchorX: number
  anchorY: number
  nextEruptionTick: number
  activeEruptionId: string | null
  minIntervalTicks: number
  maxIntervalTicks: number
}

export type ItemsSummary = {
  catalogSeed: number
  catalogCreatedAtMs: number
  selectedFactionId: string | null
  selectedFactionName: string | null
  selectedFactionTechLevel: number
  catalog: ItemCatalogRow[]
  craftableItems: CraftableItemRow[]
  factionInventory: FactionInventoryItemRow[]
  groundItems: GroundItemRow[]
  materialsCatalog: MaterialCatalogRow[]
  resourcesDensity: ResourceNodeDensity
  resourceNodes: ResourceNodeRow[]
  structuresCatalog: StructureCatalogRow[]
  structuresBuildable: StructureBuildableRow[]
  structuresWorld: StructureWorldRow[]
  selectedStructure: SelectedStructureSummary | null
  volcano: VolcanoSummary | null
}

export type LogEntry = {
  id: number
  tick: number
  category: string
  severity: Severity
  message: string
}

export type LogsSummary = {
  entries: LogEntry[]
}

export type SelectedAgentSummary = {
  agentId: string
  speciesId: string
  civilizationId: string | null
  ethnicityId: string | null
  name: string
  factionId: string
  factionName: string
  role: string
  currentIntent: string
  goal: string
  activityState: string
  lastAction: string
  proposedPlan: CivPlanSummary | null
  activePlan: CivPlanSummary | null
  energy: number
  hydration: number
  age: number
  vitality: number
  hunger: number
  waterNeed: number
  hazardStress: number
  thought: string
  x: number
  y: number
  inventory: {
    food: number
    wood: number
    stone: number
    ore: number
  }
  itemInventory: Record<string, number>
  inventoryRows: Array<{
    itemId: string
    itemName: string
    category: ItemCategory | 'unknown'
    quantity: number
    totalWeight: number
  }>
  equipmentSlots: CivEquipmentSlots
  equippedItemId: string | null
  maxCarryWeight: number
  currentCarryWeight: number
  mentalState: CivMentalState
  latestMentalLog?: CivMentalLog
  utteranceTokens: string[]
  utteranceGloss?: string
  thoughtGloss?: string
  narrativeBio?: string
}

export type AiChatReference = {
  type: string
  id: string
  label: string
}

export type AiChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  tick: number
  createdAtMs: number
  content: string
  pending: boolean
  error?: string
  references: AiChatReference[]
  suggestedQuestions: string[]
}

export type AiChatContextInspector = {
  selectionType: string | null
  selectionId: string | null
  title: string
  lines: string[]
  payloadPreview: string
}

export type AiChatSummary = {
  provider: 'ollama' | 'llamaCpp' | 'openai' | 'offline'
  busy: boolean
  followSelection: boolean
  explainMode: boolean
  maxMessages: number
  quickPrompts: string[]
  messages: AiChatMessage[]
  contextInspector: AiChatContextInspector
}

export type WorldGenesisScores = {
  survivalScore: number
  biodiversityScore: number
  stabilityScore: number
  resourceBalanceScore: number
  catastropheTolerance: number
}

export type WorldGenesisParetoSample = {
  id: string
  rank: number
  weightedScore: number
  scores: WorldGenesisScores
}

export type WorldGenesisSummary = {
  bestConfig: Record<string, number>
  bestScores: WorldGenesisScores
  paretoFrontSample: WorldGenesisParetoSample[]
  reasonCodes: string[]
}

export type SimulationSnapshot = {
  tick: number
  fps: number | null
  speed: number
  paused: boolean
  seed: number
  world: WorldSummary
  population: PopulationSummary
  events: EventsSummary
  environment: EnvironmentSummary
  civ: CivSummary | null
  items: ItemsSummary | null
  logs: LogsSummary
  selectedAgent: SelectedAgentSummary | null
  aiChat: AiChatSummary | null
  worldGenesis: WorldGenesisSummary | null
}

export type OverlayActionName =
  | 'playPause'
  | 'speedDown'
  | 'speedUp'
  | 'saveWorld'
  | 'reset'
  | 'toggleOverlay'
  | 'setTuningParam'
  | 'focusWorldPoint'
  | 'setTab'
  | 'inspectCivAgent'
  | 'selectCivFaction'
  | 'filterCivBySpecies'
  | 'selectCivNote'
  | 'requestAgentThoughtGloss'
  | 'requestNoteTranslation'
  | 'aiChatSendMessage'
  | 'aiChatSetFollowSelection'
  | 'aiChatSetExplainMode'
  | 'aiChatJumpToReference'
  | 'dismantleStructure'

export type OverlayActionPayload =
  | undefined
  | {
      seed: number
    }
  | {
      type: OverlayToggleType
      enabled: boolean
    }
  | {
      name: string
      value: number
    }
  | {
      tab: OverlayTabId
    }
  | {
      x: number
      y: number
    }
  | {
      factionId: string
    }
  | {
      speciesId: string
    }
  | {
      agentId: string
    }
  | {
      noteId: string
    }
  | {
      text: string
    }
  | {
      enabled: boolean
    }
  | {
      referenceType: string
      id: string
    }
  | {
      structureId: string
    }

export type OverlayActionHandler = (
  actionName: OverlayActionName,
  payload?: OverlayActionPayload,
) => void

export type OverlayPage = {
  readonly id: OverlayTabId
  readonly title: string
  mount: (container: HTMLElement) => void
  setVisible: (visible: boolean) => void
  update: (snapshot: SimulationSnapshot) => void
  destroy: () => void
}
