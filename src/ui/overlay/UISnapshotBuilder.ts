import type {
  AgentInspectorData,
  CivItemsSnapshot,
  CivMetricsPoint,
  CivTimelineEntry,
  DialogueRecord,
  EthnicitySummary,
  FactionMemberSummary,
  FactionRelationSeries,
  FactionRelationSummary,
  FactionSummary,
  Note,
  ReligionSummary,
  Structure,
  TerritorySummary,
} from '../../civ/types'
import type { SpeciesStat } from '../../creatures/types'
import type { ActiveEvent } from '../../events/EventTypes'
import type { LogEntry as SimLogEntry } from '../../log/SimulationLog'
import type { SimTuning } from '../../sim/SimTuning'
import type { RecentEventEntry, WorldState } from '../../world/WorldState'
import type {
  AlertItem,
  DataPoint,
  EventCard,
  MaterialCatalogRow,
  NamedSeriesPoint,
  OverlayToggles,
  ResourceNodeDensity,
  ResourceNodeRow,
  SelectedAgentSummary,
  SimulationSnapshot,
  SelectedStructureSummary,
  StructureCatalogRow,
  StructureWorldRow,
  TopSpeciesItem,
  VolcanoSummary,
} from './types'

export type SnapshotBuildInput = {
  tick: number
  fps: number | null
  speed: number
  paused: boolean
  seed: number

  world: WorldState
  speciesStats: readonly SpeciesStat[]

  activeEvents: readonly ActiveEvent[]
  recentEvents: readonly RecentEventEntry[]

  logs: readonly SimLogEntry[]

  civFactions?: readonly FactionSummary[]
  civTimeline?: readonly CivTimelineEntry[]
  civDialogues?: readonly DialogueRecord[]
  civMetrics?: readonly CivMetricsPoint[]
  civItems?: CivItemsSnapshot | null
  materialsCatalog?: MaterialCatalogRow[]
  resourceNodeDensity?: ResourceNodeDensity | null
  resourceNodeRows?: ResourceNodeRow[]
  structureCatalog?: StructureCatalogRow[]
  structureWorldRows?: StructureWorldRow[]
  selectedStructure?: SelectedStructureSummary | null
  volcanoSummary?: VolcanoSummary | null
  civMembers?: readonly FactionMemberSummary[]
  civStructures?: readonly Structure[]
  civTerritories?: TerritorySummary | null
  civNotes?: readonly Note[]
  civRelations?: readonly FactionRelationSummary[]
  civRelationSeries?: readonly FactionRelationSeries[]
  civEthnicities?: readonly EthnicitySummary[]
  civReligions?: readonly ReligionSummary[]
  selectedFactionId?: string | null
  selectedSpeciesId?: string | null

  selectedAgent?: AgentInspectorData | null
  aiChat?: SimulationSnapshot['aiChat']
  worldGenesis?: SimulationSnapshot['worldGenesis']

  overlayToggles: OverlayToggles
  tuning: SimTuning
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function toSeverity(value: string): 'info' | 'warn' | 'error' {
  if (value === 'error') return 'error'
  if (value === 'warn') return 'warn'
  return 'info'
}

function parseMagnitude(message: string): number {
  const signed = message.match(/[+-]\d+(?:\.\d+)?/g)
  if (signed && signed.length > 0) {
    let sum = 0
    for (let i = 0; i < signed.length; i++) {
      const parsed = Number(signed[i])
      if (Number.isFinite(parsed)) {
        sum += Math.abs(parsed)
      }
    }
    if (sum > 0) {
      return sum
    }
  }

  const tail = message.match(/(\d+(?:\.\d+)?)\s*$/)
  if (tail && tail[1]) {
    const parsed = Number(tail[1])
    if (Number.isFinite(parsed)) {
      return Math.abs(parsed)
    }
  }

  return 1
}

function pushLimited<T>(target: T[], value: T, max: number): void {
  target.push(value)
  if (target.length > max) {
    target.splice(0, target.length - max)
  }
}

function topSpeciesTraits(stat: SpeciesStat): string {
  const avg = stat.avgGenome
  const efficiency = typeof avg.efficiency === 'number' ? ` ef:${avg.efficiency.toFixed(2)}` : ''
  return `m:${avg.metabolismRate.toFixed(2)} mv:${avg.moveCost.toFixed(2)} rt:${avg.reproductionThreshold.toFixed(2)}${efficiency}`
}

/**
 * Traduce i sistemi interni in uno snapshot UI serializzabile.
 */
export class UISnapshotBuilder {
  private readonly maxPoints: number

  private readonly populationSeries: DataPoint[] = []
  private readonly topSpeciesSeries: NamedSeriesPoint[] = []
  private readonly speciesPopulationHistory = new Map<string, DataPoint[]>()
  private readonly speciesEnergyHistory = new Map<string, DataPoint[]>()

  private readonly tempSeries: DataPoint[] = []
  private readonly humiditySeries: DataPoint[] = []
  private readonly fertilitySeries: DataPoint[] = []
  private readonly hazardSeries: DataPoint[] = []

  private readonly eventsPerMinuteSeries: DataPoint[] = []

  private previousSpeciesPopulation = new Map<string, number>()
  private extinctions = 0
  private lastTickSampled = -1

  constructor(maxPoints = 300) {
    this.maxPoints = Math.max(50, maxPoints | 0)
  }

  reset(): void {
    this.populationSeries.length = 0
    this.topSpeciesSeries.length = 0
    this.speciesPopulationHistory.clear()
    this.speciesEnergyHistory.clear()

    this.tempSeries.length = 0
    this.humiditySeries.length = 0
    this.fertilitySeries.length = 0
    this.hazardSeries.length = 0

    this.eventsPerMinuteSeries.length = 0

    this.previousSpeciesPopulation.clear()
    this.extinctions = 0
    this.lastTickSampled = -1
  }

  build(input: SnapshotBuildInput): SimulationSnapshot {
    const world = input.world
    const size = Math.max(1, world.width * world.height)

    let tempSum = 0
    let humiditySum = 0
    let fertilitySum = 0
    let hazardSum = 0
    let biomassTotal = 0

    for (let i = 0; i < size; i++) {
      tempSum += world.temperature[i] ?? 0
      humiditySum += world.humidity[i] ?? 0
      fertilitySum += world.fertility[i] ?? 0
      hazardSum += world.hazard[i] ?? 0
      biomassTotal += world.plantBiomass[i] ?? 0
    }

    const avgTemp = tempSum / size / 255
    const avgHumidity = humiditySum / size / 255
    const avgFertility = fertilitySum / size / 255
    const avgHazard = hazardSum / size / 255

    const civLinksBySpecies = new Map<string, { ids: Set<string>; names: Set<string> }>()
    const factions = input.civFactions ?? []
    for (let i = 0; i < factions.length; i++) {
      const faction = factions[i]
      if (!faction) continue
      const speciesIds = new Set<string>([faction.foundingSpeciesId, faction.dominantSpeciesId])
      for (const speciesId of speciesIds.values()) {
        if (!speciesId) continue
        const acc = civLinksBySpecies.get(speciesId) ?? { ids: new Set<string>(), names: new Set<string>() }
        acc.ids.add(faction.id)
        acc.names.add(faction.name)
        civLinksBySpecies.set(speciesId, acc)
      }
    }

    const ethnicityLinksBySpecies = new Map<string, { ids: Set<string>; names: Set<string> }>()
    const ethnicities = input.civEthnicities ?? []
    for (let i = 0; i < ethnicities.length; i++) {
      const ethnicity = ethnicities[i]
      if (!ethnicity) continue
      const acc = ethnicityLinksBySpecies.get(ethnicity.speciesId) ?? { ids: new Set<string>(), names: new Set<string>() }
      acc.ids.add(ethnicity.id)
      acc.names.add(ethnicity.name ?? ethnicity.id)
      ethnicityLinksBySpecies.set(ethnicity.speciesId, acc)
    }

    const speciesRows: TopSpeciesItem[] = input.speciesStats
      .map((stat) => ({
        speciesId: stat.speciesId,
        commonName: stat.commonName,
        name: stat.name,
        color: stat.color,
        createdAtTick: stat.createdAtTick,
        population: stat.population,
        parentSpeciesId: stat.parentSpeciesId,
        lineageIds: [...stat.lineageIds],
        lineageNames: [...stat.lineageNames],
        avgEnergy: stat.avgEnergy,
        avgHealth: stat.avgHealth,
        avgHydration: stat.avgHydration,
        avgWaterNeed: stat.avgWaterNeed,
        avgAge: stat.avgAge,
        avgGeneration: stat.avgGeneration,
        avgTempStress: stat.avgTempStress,
        avgHumidityStress: stat.avgHumidityStress,
        vitality: stat.vitality,
        traits: [...stat.traits],
        allowedBiomes: [...stat.allowedBiomes],
        habitatHint: stat.habitatHint,
        dietType: stat.dietType,
        sizeClass: stat.sizeClass,
        intelligence: stat.intelligence,
        languageLevel: stat.languageLevel,
        socialComplexity: stat.socialComplexity,
        eventPressure: stat.eventPressure,
        cognitionStage: stat.cognitionStage,
        isIntelligent: stat.isIntelligent,
        firstIntelligentTick: stat.firstIntelligentTick,
        thoughtSamples: [...stat.thoughtSamples],
        dialogueSamples: [...stat.dialogueSamples],
        avgTraits: topSpeciesTraits(stat),
        civilizationIds: [...(civLinksBySpecies.get(stat.speciesId)?.ids ?? [])].sort(),
        civilizationNames: [...(civLinksBySpecies.get(stat.speciesId)?.names ?? [])].sort(),
        ethnicityIds: [...(ethnicityLinksBySpecies.get(stat.speciesId)?.ids ?? [])].sort(),
        ethnicityNames: [...(ethnicityLinksBySpecies.get(stat.speciesId)?.names ?? [])].sort(),
      }))
      .sort((a, b) => b.population - a.population)

    let totalCreatures = 0
    for (let i = 0; i < speciesRows.length; i++) {
      totalCreatures += speciesRows[i]?.population ?? 0
    }

    let shannon = 0
    for (let i = 0; i < speciesRows.length; i++) {
      const row = speciesRows[i]
      if (!row || row.population <= 0 || totalCreatures <= 0) continue
      const p = row.population / totalCreatures
      shannon += -p * Math.log(Math.max(1e-12, p))
    }

    const biodiversity = speciesRows.filter((row) => row.population > 0).length

    const tickWindow = 1200
    const fromTick = input.tick - tickWindow
    let birthsPerMin = 0
    let deathsPerMin = 0
    let eventsPerMin = 0

    for (let i = 0; i < input.logs.length; i++) {
      const log = input.logs[i]
      if (!log || log.tick < fromTick) continue
      if (log.category === 'births') {
        birthsPerMin += parseMagnitude(log.message)
      } else if (log.category === 'deaths') {
        deathsPerMin += parseMagnitude(log.message)
      } else if (log.category === 'events') {
        eventsPerMin += 1
      }
    }

    const currentSpeciesPopulation = new Map<string, number>()
    for (let i = 0; i < speciesRows.length; i++) {
      const row = speciesRows[i]
      if (!row) continue
      currentSpeciesPopulation.set(row.speciesId, row.population)
    }

    for (const [speciesId, prevPopulation] of this.previousSpeciesPopulation.entries()) {
      if (prevPopulation <= 0) continue
      const currentPopulation = currentSpeciesPopulation.get(speciesId) ?? 0
      if (currentPopulation <= 0) {
        this.extinctions += 1
      }
    }
    this.previousSpeciesPopulation = currentSpeciesPopulation

    const shouldPushSeries = input.tick !== this.lastTickSampled
    if (shouldPushSeries) {
      this.lastTickSampled = input.tick

      pushLimited(this.populationSeries, { tick: input.tick, value: totalCreatures }, this.maxPoints)
      pushLimited(this.tempSeries, { tick: input.tick, value: avgTemp }, this.maxPoints)
      pushLimited(this.humiditySeries, { tick: input.tick, value: avgHumidity }, this.maxPoints)
      pushLimited(this.fertilitySeries, { tick: input.tick, value: avgFertility }, this.maxPoints)
      pushLimited(this.hazardSeries, { tick: input.tick, value: avgHazard }, this.maxPoints)
      pushLimited(
        this.eventsPerMinuteSeries,
        {
          tick: input.tick,
          value: eventsPerMin,
        },
        this.maxPoints,
      )

      const topSpecies = speciesRows.slice(0, 5)
      const topValues: Record<string, number> = {}
      for (let i = 0; i < topSpecies.length; i++) {
        const row = topSpecies[i]
        if (!row) continue
        topValues[row.speciesId] = row.population
      }
      pushLimited(this.topSpeciesSeries, { tick: input.tick, values: topValues }, this.maxPoints)

      for (let i = 0; i < speciesRows.length; i++) {
        const row = speciesRows[i]
        if (!row) continue

        const popHistory = this.speciesPopulationHistory.get(row.speciesId) ?? []
        pushLimited(popHistory, { tick: input.tick, value: row.population }, this.maxPoints)
        this.speciesPopulationHistory.set(row.speciesId, popHistory)

        const energyHistory = this.speciesEnergyHistory.get(row.speciesId) ?? []
        pushLimited(energyHistory, { tick: input.tick, value: row.avgEnergy }, this.maxPoints)
        this.speciesEnergyHistory.set(row.speciesId, energyHistory)
      }
    }

    const alerts: AlertItem[] = []
    if (deathsPerMin > birthsPerMin * 1.35 && totalCreatures > 40) {
      alerts.push({
        id: `alert-demographic-${input.tick}`,
        tick: input.tick,
        severity: 'warn',
        message: `Deaths/min (${deathsPerMin.toFixed(1)}) significantly above births/min (${birthsPerMin.toFixed(1)}).`,
      })
    }

    if (input.activeEvents.some((event) => event.type === 'VolcanoEruption')) {
      alerts.push({
        id: `alert-volcano-${input.tick}`,
        tick: input.tick,
        severity: 'error',
        message: 'Active volcanic eruption detected.',
      })
    }

    if (input.activeEvents.some((event) => event.type === 'Drought') && avgHumidity < 0.35) {
      alerts.push({
        id: `alert-drought-${input.tick}`,
        tick: input.tick,
        severity: 'warn',
        message: 'Dryness critical: drought combined with low humidity.',
      })
    }

    const recentErrors = input.logs.filter((log) => log.severity === 'error').slice(-2)
    for (let i = 0; i < recentErrors.length; i++) {
      const log = recentErrors[i]
      if (!log) continue
      alerts.push({
        id: `alert-log-${log.id}`,
        tick: log.tick,
        severity: 'error',
        message: log.message,
      })
    }

    const activeEvents: EventCard[] = input.activeEvents.map((event) => ({
      id: event.id,
      type: event.type,
      intensity: 'intensity' in event ? event.intensity : 1,
      remainingTicks: Math.max(0, event.durationTicks - event.elapsedTicks),
      tick: event.startTick,
      x: event.x,
      y: event.y,
      summary: `${event.type} rem=${Math.max(0, event.durationTicks - event.elapsedTicks)}`,
    }))

    const recentEvents: EventCard[] = input.recentEvents.map((event) => ({
      id: event.id,
      type: event.type,
      intensity: 1,
      remainingTicks: 0,
      tick: event.tick,
      x: event.x,
      y: event.y,
      summary: event.summary,
    }))

    const civ = this.buildCivSummary(input)
    const items = this.buildItemsSummary(input)

    const selectedAgent: SelectedAgentSummary | null = input.selectedAgent
      ? {
          agentId: input.selectedAgent.agentId,
          speciesId: input.selectedAgent.speciesId,
          civilizationId: input.selectedAgent.civilizationId,
          ethnicityId: input.selectedAgent.ethnicityId,
          name: input.selectedAgent.name,
          factionId: input.selectedAgent.factionId,
          factionName: input.selectedAgent.factionName,
          role: input.selectedAgent.role,
          currentIntent: input.selectedAgent.currentIntent,
          goal: input.selectedAgent.goal,
          activityState: input.selectedAgent.activityState,
          lastAction: input.selectedAgent.lastAction,
          proposedPlan: input.selectedAgent.proposedPlan
            ? {
                ...input.selectedAgent.proposedPlan,
              }
            : null,
          activePlan: input.selectedAgent.activePlan
            ? {
                ...input.selectedAgent.activePlan,
              }
            : null,
          energy: input.selectedAgent.energy,
          hydration: input.selectedAgent.hydration,
          age: input.selectedAgent.age,
          vitality: input.selectedAgent.vitality,
          hunger: input.selectedAgent.hunger,
          waterNeed: input.selectedAgent.waterNeed,
          hazardStress: input.selectedAgent.hazardStress,
          thought: input.selectedAgent.currentThought,
          x: input.selectedAgent.x,
          y: input.selectedAgent.y,
          inventory: {
            food: input.selectedAgent.inventory.food,
            wood: input.selectedAgent.inventory.wood,
            stone: input.selectedAgent.inventory.stone,
            ore: input.selectedAgent.inventory.ore,
          },
          itemInventory: { ...input.selectedAgent.itemInventory },
          inventoryRows: input.selectedAgent.inventoryRows.map((row) => ({
            itemId: row.itemId,
            itemName: row.itemName,
            category: row.category,
            quantity: row.quantity,
            totalWeight: row.totalWeight,
          })),
          equipmentSlots: { ...input.selectedAgent.equipmentSlots },
          equippedItemId: input.selectedAgent.equippedItemId,
          maxCarryWeight: input.selectedAgent.maxCarryWeight,
          currentCarryWeight: input.selectedAgent.currentCarryWeight,
          mentalState: {
            ...input.selectedAgent.mentalState,
            lastReasonCodes: [...input.selectedAgent.mentalState.lastReasonCodes],
          },
          latestMentalLog: input.selectedAgent.latestMentalLog
            ? {
                ...input.selectedAgent.latestMentalLog,
                reasonCodes: [...input.selectedAgent.latestMentalLog.reasonCodes],
              }
            : undefined,
          utteranceTokens: [...input.selectedAgent.lastUtteranceTokens],
          utteranceGloss: input.selectedAgent.lastUtteranceGloss,
          thoughtGloss: input.selectedAgent.thoughtGloss,
          narrativeBio: input.selectedAgent.narrativeBio,
        }
      : null

    const speciesPopulationHistoryObj: Record<string, DataPoint[]> = {}
    for (const [speciesId, history] of this.speciesPopulationHistory.entries()) {
      speciesPopulationHistoryObj[speciesId] = [...history]
    }

    const speciesEnergyHistoryObj: Record<string, DataPoint[]> = {}
    for (const [speciesId, history] of this.speciesEnergyHistory.entries()) {
      speciesEnergyHistoryObj[speciesId] = [...history]
    }

    return {
      tick: input.tick,
      fps: input.fps,
      speed: input.speed,
      paused: input.paused,
      seed: input.seed,
      world: {
        avgTemp,
        avgHumidity,
        avgFertility,
        avgHazard,
        biomassTotal,
        hazardTotal: hazardSum,
      },
      population: {
        totalCreatures,
        biodiversity,
        shannonIndex: clamp(shannon, 0, 100),
        totalBiomass: biomassTotal,
        birthsPerMin,
        deathsPerMin,
        extinctions: this.extinctions,
        topSpecies: speciesRows.slice(0, 5),
        speciesRows,
        populationSeries: [...this.populationSeries],
        topSpeciesSeries: [...this.topSpeciesSeries],
        speciesPopulationHistory: speciesPopulationHistoryObj,
        speciesEnergyHistory: speciesEnergyHistoryObj,
        alerts,
      },
      events: {
        activeEvents,
        recentEvents,
        eventsPerMinuteSeries: [...this.eventsPerMinuteSeries],
      },
      environment: {
        avgTemp,
        avgHumidity,
        avgFertility,
        avgHazard,
        tempSeries: [...this.tempSeries],
        humiditySeries: [...this.humiditySeries],
        fertilitySeries: [...this.fertilitySeries],
        hazardSeries: [...this.hazardSeries],
        overlayToggles: { ...input.overlayToggles },
        tuning: {
          plantBaseGrowth: input.tuning.plantBaseGrowth,
          plantMaxBiomass: input.tuning.plantMaxBiomass,
          plantDecay: input.tuning.plantDecay,
          baseMetabolism: input.tuning.baseMetabolism,
          reproductionThreshold: input.tuning.reproductionThreshold,
          reproductionCost: input.tuning.reproductionCost,
          mutationRate: input.tuning.mutationRate,
          eventRate: input.tuning.eventRate,
          simulationSpeed: input.tuning.simulationSpeed,
        },
      },
      civ,
      items,
      logs: {
        entries: input.logs.slice(-1200).map((entry) => ({
          id: entry.id,
          tick: entry.tick,
          category: entry.category,
          severity: toSeverity(entry.severity),
          message: entry.message,
        })),
      },
      selectedAgent,
      aiChat: input.aiChat ?? null,
      worldGenesis: input.worldGenesis
        ? {
            bestConfig: { ...input.worldGenesis.bestConfig },
            bestScores: { ...input.worldGenesis.bestScores },
            paretoFrontSample: input.worldGenesis.paretoFrontSample.map((row) => ({
              id: row.id,
              rank: row.rank,
              weightedScore: row.weightedScore,
              scores: { ...row.scores },
            })),
            reasonCodes: [...input.worldGenesis.reasonCodes],
          }
        : null,
    }
  }

  private buildItemsSummary(input: SnapshotBuildInput): SimulationSnapshot['items'] {
    const items = input.civItems
    const materialsCatalog = (input.materialsCatalog ?? []).map((row) => ({
      id: row.id,
      category: row.category,
      hardness: row.hardness,
      heatResistance: row.heatResistance,
      lavaResistance: row.lavaResistance,
      hazardResistance: row.hazardResistance,
      rarity: row.rarity,
      allowedBiomes: [...row.allowedBiomes],
    }))
    const resourcesDensity = input.resourceNodeDensity
      ? { ...input.resourceNodeDensity }
      : {
          totalNodes: 0,
          treeNodes: 0,
          stoneNodes: 0,
          ironNodes: 0,
          clayNodes: 0,
          totalRemainingAmount: 0,
        }
    const resourceNodes = (input.resourceNodeRows ?? []).map((row) => ({
      id: row.id,
      type: row.type,
      x: row.x,
      y: row.y,
      amount: row.amount,
      regenRate: row.regenRate,
      requiredToolTag: row.requiredToolTag,
      yieldsMaterialId: row.yieldsMaterialId,
    }))
    const structuresCatalog = (input.structureCatalog ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      size: { ...row.size },
      requiredTechLevel: row.requiredTechLevel,
      buildCost: row.buildCost.map((cost) => ({ ...cost })),
      utilityTags: [...row.utilityTags],
      heatResistance: row.heatResistance,
      lavaResistance: row.lavaResistance,
      hazardResistance: row.hazardResistance,
    }))
    const structuresWorld = (input.structureWorldRows ?? []).map((row) => ({
      id: row.id,
      defId: row.defId,
      name: row.name,
      factionId: row.factionId,
      x: row.x,
      y: row.y,
      w: row.w,
      h: row.h,
      state: row.state,
      hp: row.hp,
      maxHp: row.maxHp,
      builtAtTick: row.builtAtTick,
    }))
    const selectedStructure = input.selectedStructure
      ? {
          ...input.selectedStructure,
          utilityTags: [...input.selectedStructure.utilityTags],
          buildCost: input.selectedStructure.buildCost.map((row) => ({ ...row })),
        }
      : null
    const volcano = input.volcanoSummary ? { ...input.volcanoSummary } : null

    if (
      !items &&
      materialsCatalog.length === 0 &&
      structuresCatalog.length === 0 &&
      resourceNodes.length === 0 &&
      structuresWorld.length === 0
    ) {
      return null
    }

    const factionTechLevel = items?.selectedFactionTechLevel ?? 0
    const materialInventory = new Map<string, number>()
    if (items) {
      for (let i = 0; i < items.factionInventory.length; i++) {
        const row = items.factionInventory[i]
        if (!row) continue
        materialInventory.set(row.itemId, (materialInventory.get(row.itemId) ?? 0) + row.quantity)
      }
    }

    const structuresBuildable = structuresCatalog.map((structure) => {
      const unlocked = factionTechLevel >= structure.requiredTechLevel
      const missingMaterials: string[] = []
      for (let i = 0; i < structure.buildCost.length; i++) {
        const cost = structure.buildCost[i]
        if (!cost) continue
        const available = materialInventory.get(cost.materialId) ?? 0
        if (available < cost.amount) {
          missingMaterials.push(`${cost.materialId}:${Math.max(0, cost.amount - available).toFixed(0)}`)
        }
      }
      return {
        id: structure.id,
        name: structure.name,
        requiredTechLevel: structure.requiredTechLevel,
        unlocked,
        missingMaterials,
      }
    })

    return {
      catalogSeed: items?.catalogSeed ?? input.seed,
      catalogCreatedAtMs: items?.catalogCreatedAtMs ?? 0,
      selectedFactionId: items?.selectedFactionId ?? null,
      selectedFactionName: items?.selectedFactionName ?? null,
      selectedFactionTechLevel: factionTechLevel,
      catalog: items
        ? items.catalog.map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            baseProperties: { ...item.baseProperties },
            naturalSpawn: item.naturalSpawn,
            allowedBiomes: [...item.allowedBiomes],
          }))
        : [],
      craftableItems: items
        ? items.craftableItems.map((item) => ({
            id: item.id,
            requiredItems: [...item.requiredItems],
            requiredItemNames: [...item.requiredItemNames],
            requiredTechLevel: item.requiredTechLevel,
            resultItemId: item.resultItemId,
            resultItemName: item.resultItemName,
            efficiencyModifier: item.efficiencyModifier,
            unlocked: item.unlocked,
            canCraft: item.canCraft,
            newlyUnlocked: item.newlyUnlocked,
            missingItems: [...item.missingItems],
          }))
        : [],
      factionInventory: items
        ? items.factionInventory.map((item) => ({
            itemId: item.itemId,
            itemName: item.itemName,
            category: item.category,
            quantity: item.quantity,
          }))
        : [],
      groundItems: items
        ? items.groundItems.map((item) => ({
            id: item.id,
            itemId: item.itemId,
            itemName: item.itemName,
            category: item.category,
            quantity: item.quantity,
            x: item.x,
            y: item.y,
            naturalSpawn: item.naturalSpawn,
            ageTicks: item.ageTicks,
          }))
        : [],
      materialsCatalog,
      resourcesDensity,
      resourceNodes,
      structuresCatalog,
      structuresBuildable,
      structuresWorld,
      selectedStructure,
      volcano,
    }
  }

  private buildCivSummary(input: SnapshotBuildInput): SimulationSnapshot['civ'] {
    const factions = input.civFactions ?? []
    if (factions.length === 0) {
      return null
    }

    const timeline = input.civTimeline ?? []
    const dialogues = input.civDialogues ?? []
    const metrics = input.civMetrics ?? []
    const ethnicities = input.civEthnicities ?? []
    const religions = input.civReligions ?? []

    const fromTick = input.tick - 1200
    let wars = 0
    let trades = 0
    for (let i = 0; i < timeline.length; i++) {
      const entry = timeline[i]
      if (!entry || entry.tick < fromTick) continue
      if (entry.category === 'war') wars++
      if (entry.category === 'trade') trades++
    }

    const populationSeries: NamedSeriesPoint[] = metrics.map((point) => ({
      tick: point.tick,
      values: { ...point.populations },
    }))

    const relations = (input.civRelations ?? []).map((item) => ({
      fromId: item.fromId,
      toId: item.toId,
      status: item.status,
      trust: item.trust,
      tension: item.tension,
      intensity: item.intensity,
    }))

    const interactionEdges = relations.map((relation) => ({
      fromId: relation.fromId,
      toId: relation.toId,
      status: relation.status,
      weight: clamp(relation.intensity, 0.1, 1.6),
    }))

    const territories = input.civTerritories
      ? {
          width: input.civTerritories.width,
          height: input.civTerritories.height,
          factionOrder: [...input.civTerritories.factionOrder],
          claimedByFaction: { ...input.civTerritories.claimedByFaction },
          overlayCells: input.civTerritories.overlayCells.map((cell) => ({
            x: cell.x,
            y: cell.y,
            factionId: cell.factionId,
            controlLevel: cell.controlLevel,
            isBorder: cell.isBorder,
          })),
        }
      : {
          width: 0,
          height: 0,
          factionOrder: [],
          claimedByFaction: {},
          overlayCells: [],
        }

    const factionMembers = (input.civMembers ?? []).map((member) => ({
      agentId: member.agentId,
      speciesId: member.speciesId,
      civilizationId: member.civilizationId,
      ethnicityId: member.ethnicityId,
      factionId: member.factionId,
      factionName: member.factionName,
      name: member.name,
      role: member.role,
      age: member.age,
      energy: member.energy,
      hydration: member.hydration,
      x: member.x,
      y: member.y,
      currentIntent: member.currentIntent,
      goal: member.goal,
      activityState: member.activityState,
      lastAction: member.lastAction,
      activePlan: member.activePlan
        ? {
            ...member.activePlan,
          }
        : null,
      inventoryItems: member.inventoryItems.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
      equipmentSlots: { ...member.equipmentSlots },
      maxCarryWeight: member.maxCarryWeight,
      currentCarryWeight: member.currentCarryWeight,
      mentalState: {
        ...member.mentalState,
        lastReasonCodes: [...member.mentalState.lastReasonCodes],
      },
    }))

    const notes = (input.civNotes ?? []).slice(-260).map((note) => ({
      id: note.id,
      authorId: note.authorId,
      factionId: note.factionId,
      createdAtTick: note.createdAtTick,
      tokenContent: note.tokenContent,
      translatedContent: note.translatedContent,
      x: note.x,
      y: note.y,
    }))

    const relationSeries = (input.civRelationSeries ?? []).map((series) => ({
      relationKey: series.relationKey,
      fromId: series.fromId,
      toId: series.toId,
      points: series.points.map((point) => ({
        tick: point.tick,
        trust: point.trust,
        tension: point.tension,
        status: point.status,
      })),
    }))

    const speciesLinks: Record<string, { civilizationIds: string[]; ethnicityIds: string[] }> = {}
    for (let i = 0; i < factions.length; i++) {
      const faction = factions[i]
      if (!faction) continue
      const speciesIds = [faction.foundingSpeciesId, faction.dominantSpeciesId]
      for (let j = 0; j < speciesIds.length; j++) {
        const speciesId = speciesIds[j]
        if (!speciesId) continue
        const row = speciesLinks[speciesId] ?? { civilizationIds: [], ethnicityIds: [] }
        if (!row.civilizationIds.includes(faction.id)) {
          row.civilizationIds.push(faction.id)
        }
        speciesLinks[speciesId] = row
      }
    }
    for (let i = 0; i < ethnicities.length; i++) {
      const ethnicity = ethnicities[i]
      if (!ethnicity) continue
      const row = speciesLinks[ethnicity.speciesId] ?? { civilizationIds: [], ethnicityIds: [] }
      if (!row.ethnicityIds.includes(ethnicity.id)) {
        row.ethnicityIds.push(ethnicity.id)
      }
      speciesLinks[ethnicity.speciesId] = row
    }

    return {
      factions: factions.map((faction) => ({
        id: faction.id,
        name: faction.name,
        rawName: faction.rawName,
        identitySymbol: faction.identitySymbol,
        foundingSpeciesId: faction.foundingSpeciesId,
        dominantSpeciesId: faction.dominantSpeciesId,
        ethnicityId: faction.ethnicityId,
        ethnicityIds: [...faction.ethnicityIds],
        religionId: faction.religionId,
        religionName: faction.religionName,
        population: faction.population,
        techLevel: faction.techLevel,
        literacyLevel: faction.literacyLevel,
        state: faction.state,
        religion: faction.religion,
        spirituality: faction.spirituality,
        aggression: faction.aggression,
        curiosity: faction.curiosity,
        tradeAffinity: faction.tradeAffinity,
        collectivism: faction.collectivism,
        environmentalAdaptation: faction.environmentalAdaptation,
        techOrientation: faction.techOrientation,
        strategy: faction.strategy,
        dominantPractices: [...faction.dominantPractices],
        territoryTiles: faction.territoryTiles,
      })),
      wars,
      trades,
      selectedFactionId: input.selectedFactionId ?? null,
      selectedSpeciesId: input.selectedSpeciesId ?? null,
      populationSeries,
      territories,
      factionMembers,
      ethnicities: ethnicities.map((ethnicity) => ({
        id: ethnicity.id,
        speciesId: ethnicity.speciesId,
        factionId: ethnicity.factionId,
        name: ethnicity.name,
        symbol: ethnicity.symbol,
        culturalTraits: [...ethnicity.culturalTraits],
        createdAtTick: ethnicity.createdAtTick,
      })),
      religions: religions.map((religion) => ({
        id: religion.id,
        speciesId: religion.speciesId,
        ethnicityId: religion.ethnicityId,
        name: religion.name,
        coreBeliefs: [...religion.coreBeliefs],
        sacredSpeciesIds: [...religion.sacredSpeciesIds],
        createdAtTick: religion.createdAtTick,
        description: religion.description,
      })),
      notes,
      relations,
      relationSeries,
      interactionEdges,
      structures: (input.civStructures ?? []).map((structure) => ({
        id: structure.id,
        type: structure.type,
        blueprint: structure.blueprint,
        factionId: structure.factionId,
        x: structure.x,
        y: structure.y,
        completed: structure.completed,
        progress: structure.progress,
        builtAtTick: structure.builtAtTick,
      })),
      speciesLinks,
      recentDialogues: dialogues.slice(-120).map((dialogue) => ({
        id: dialogue.id,
        tick: dialogue.tick,
        factionId: dialogue.factionId,
        topic: dialogue.topic,
        lines: dialogue.lines.map((line) => `${line.speaker}: ${line.text}`),
        gloss: dialogue.glossIt,
        tone: dialogue.tone,
      })),
    }
  }
}
