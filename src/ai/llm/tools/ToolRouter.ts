import type { CreatureSystem } from '../../../creatures/CreatureSystem'
import type { SpeciesStat } from '../../../creatures/types'
import type { CivSystem } from '../../../civ/CivSystem'
import type { EventSystem } from '../../../events/EventSystem'
import type { LogEntry } from '../../../log/SimulationLog'
import type { SimulationSnapshot } from '../../../ui/overlay/types'
import type { WorldState } from '../../../world/WorldState'
import { WorldKnowledgePack } from '../../WorldKnowledgePack'
import type { AiToolDefinition, AiToolName } from './tools'
import { AI_TOOL_DEFINITIONS } from './tools'

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function asLimit(value: unknown, fallback = 10, max = 200): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return clampInt(parsed, 1, max)
}

function asPage(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(0, Math.floor(parsed))
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export type ToolRouterProviders = {
  getWorldState: () => WorldState
  getSnapshot: () => SimulationSnapshot | null
  getSpeciesStats: () => readonly SpeciesStat[]
  getCreatureSystem: () => CreatureSystem
  getCivSystem: () => CivSystem
  getEventSystem: () => EventSystem
  getLogEntries: (limit?: number) => readonly LogEntry[]
}

export type ToolCallResult = {
  ok: boolean
  tool: AiToolName
  data: unknown
  error?: string
}

/**
 * Router centralizzato tool -> dati simulazione (read-only).
 */
export class ToolRouter {
  private readonly pack = new WorldKnowledgePack()

  constructor(private readonly providers: ToolRouterProviders) {}

  listTools(): readonly AiToolDefinition[] {
    return AI_TOOL_DEFINITIONS
  }

  async callTool(name: AiToolName, input: Record<string, unknown> = {}): Promise<ToolCallResult> {
    try {
      const data = this.dispatch(name, input)
      return { ok: true, tool: name, data }
    } catch (error) {
      return {
        ok: false,
        tool: name,
        data: null,
        error: error instanceof Error ? error.message : 'unknown tool error',
      }
    }
  }

  private dispatch(name: AiToolName, input: Record<string, unknown>): unknown {
    switch (name) {
      case 'getWorldSummary':
        return this.getWorldSummary()
      case 'getTopSpecies':
        return this.getTopSpecies(input)
      case 'getSpecies':
        return this.getSpecies(input)
      case 'getSpeciesLineage':
        return this.getSpeciesLineage(input)
      case 'getCreature':
        return this.getCreature(input)
      case 'searchCreatures':
        return this.searchCreatures(input)
      case 'getCiv':
        return this.getCiv(input)
      case 'listCivs':
        return this.listCivs(input)
      case 'getTerritory':
        return this.getTerritory(input)
      case 'listActiveEvents':
        return this.listActiveEvents()
      case 'getEvent':
        return this.getEvent(input)
      case 'listEras':
        return this.listEras()
      case 'getEra':
        return this.getEra(input)
      case 'queryRegion':
        return this.queryRegion(input)
      case 'getRecentLogs':
        return this.getRecentLogs(input)
      default:
        throw new Error(`unsupported tool: ${String(name)}`)
    }
  }

  private requireSnapshot(): SimulationSnapshot {
    const snapshot = this.providers.getSnapshot()
    if (!snapshot) {
      throw new Error('snapshot unavailable')
    }
    return snapshot
  }

  private getWorldSummary(): unknown {
    const snapshot = this.requireSnapshot()
    const base = this.pack.buildBasePack(snapshot)
    return {
      tick: base.summary.tick,
      eraId: base.summary.eraId,
      climate: base.summary.avgClimate,
      biomassTotal: base.summary.biomassTotal,
      totalPopulation: base.summary.totalPopulation,
      biodiversity: base.summary.biodiversity,
      activeEvents: base.summary.activeEvents,
      topSpecies: base.summary.topSpecies,
      topCivilizations: base.summary.topCivilizations,
      text: base.text,
      packHash: base.summary.hash,
    }
  }

  private getTopSpecies(input: Record<string, unknown>): unknown {
    const snapshot = this.requireSnapshot()
    const page = asPage(input.page, 0)
    const size = asLimit(input.size ?? input.limit, 10, 100)
    return this.pack.topSpecies(snapshot, page, size)
  }

  private getSpecies(input: Record<string, unknown>): unknown {
    const snapshot = this.requireSnapshot()
    const speciesId = asString(input.speciesId)
    if (!speciesId) {
      throw new Error('speciesId required')
    }
    const details = this.pack.speciesDetails(snapshot, speciesId)
    if (!details) {
      throw new Error(`species not found: ${speciesId}`)
    }
    return details
  }

  private getSpeciesLineage(input: Record<string, unknown>): unknown {
    const snapshot = this.requireSnapshot()
    const speciesId = asString(input.speciesId)
    if (!speciesId) {
      throw new Error('speciesId required')
    }
    const details = this.pack.speciesDetails(snapshot, speciesId)
    if (!details) {
      throw new Error(`species not found: ${speciesId}`)
    }
    return {
      speciesId: details.speciesId,
      commonName: details.commonName,
      parentSpeciesId: details.parentSpeciesId,
      lineageIds: [...details.lineageIds],
      lineageNames: [...details.lineageNames],
      createdAtTick: details.createdAtTick,
      population: details.population,
    }
  }

  private getCreature(input: Record<string, unknown>): unknown {
    const creatureId = asString(input.creatureId)
    if (!creatureId) {
      throw new Error('creatureId required')
    }
    const creatureSystem = this.providers.getCreatureSystem()
    const details = this.pack.creatureDetails(
      creatureSystem.getCreatures(),
      this.providers.getSpeciesStats(),
      creatureId,
    )
    if (details) {
      return {
        entityType: 'fauna_creature',
        ...details,
      }
    }

    const civMember = this.providers.getCivSystem().getAgentInspectorData(creatureId)
    if (civMember) {
      return {
        entityType: 'civ_member',
        id: civMember.agentId,
        speciesId: civMember.speciesId,
        civilizationId: civMember.civilizationId,
        ethnicityId: civMember.ethnicityId,
        factionId: civMember.factionId,
        factionName: civMember.factionName,
        name: civMember.name,
        role: civMember.role,
        x: civMember.x,
        y: civMember.y,
        energy: civMember.energy,
        hydration: civMember.hydration,
        age: civMember.age,
        goal: civMember.goal,
        state: civMember.activityState,
        vitality: civMember.vitality,
        hunger: civMember.hunger,
        waterNeed: civMember.waterNeed,
        hazardStress: civMember.hazardStress,
        thought: civMember.currentThought,
        thoughtGloss: civMember.thoughtGloss,
        mentalState: civMember.mentalState,
        inventoryRows: civMember.inventoryRows,
      }
    }

    throw new Error(`creature/member not found: ${creatureId}`)
  }

  private searchCreatures(input: Record<string, unknown>): unknown {
    const query = asString(input.query).toLowerCase()
    const limit = asLimit(input.limit, 20, 200)
    const creatures = this.providers.getCreatureSystem().getCreatures()
    const speciesById = new Map(this.providers.getSpeciesStats().map((item) => [item.speciesId, item]))
    const fauna = creatures
      .filter((creature) => {
        if (!query) return true
        const speciesName = speciesById.get(creature.speciesId)?.commonName ?? creature.speciesId
        const haystack = `${creature.id} ${creature.name} ${creature.speciesId} ${speciesName}`.toLowerCase()
        return haystack.includes(query)
      })
      .map((creature) => ({
        id: creature.id,
        name: creature.name,
        speciesId: creature.speciesId,
        speciesName: speciesById.get(creature.speciesId)?.commonName ?? creature.speciesId,
        x: creature.x,
        y: creature.y,
        energy: creature.energy,
        hydration: creature.hydration,
        age: creature.age,
        entityType: 'fauna_creature',
      }))

    const civMembers = this.providers
      .getCivSystem()
      .getFactionMembers(null, Math.max(limit * 3, 120))
      .filter((member) => {
        if (!query) return true
        const speciesName = speciesById.get(member.speciesId)?.commonName ?? member.speciesId
        const haystack = `${member.agentId} ${member.name} ${member.speciesId} ${speciesName} ${member.factionName} ${member.role} ${member.goal} ${member.activityState}`.toLowerCase()
        return haystack.includes(query)
      })
      .map((member) => ({
        id: member.agentId,
        name: member.name,
        speciesId: member.speciesId,
        speciesName: speciesById.get(member.speciesId)?.commonName ?? member.speciesId,
        x: member.x,
        y: member.y,
        energy: member.energy,
        hydration: member.hydration,
        age: member.age,
        factionId: member.factionId,
        factionName: member.factionName,
        role: member.role,
        state: member.activityState,
        entityType: 'civ_member',
      }))

    const filtered = [...fauna, ...civMembers].slice(0, limit)
    return {
      query,
      limit,
      count: filtered.length,
      items: filtered,
    }
  }

  private getCiv(input: Record<string, unknown>): unknown {
    const snapshot = this.requireSnapshot()
    const civId = asString(input.civId)
    if (!civId) {
      throw new Error('civId required')
    }
    const details = this.pack.civDetails(snapshot, civId)
    if (!details) {
      throw new Error(`civ not found: ${civId}`)
    }
    return details
  }

  private listCivs(input: Record<string, unknown>): unknown {
    const snapshot = this.requireSnapshot()
    const limit = asLimit(input.limit, 10, 100)
    const civ = snapshot.civ
    if (!civ) {
      return { count: 0, items: [] }
    }
    return {
      count: civ.factions.length,
      items: civ.factions.slice(0, limit),
    }
  }

  private getTerritory(input: Record<string, unknown>): unknown {
    const snapshot = this.requireSnapshot()
    const civId = asString(input.civId)
    if (!civId) {
      throw new Error('civId required')
    }
    const civ = snapshot.civ
    if (!civ) {
      throw new Error('civilization snapshot unavailable')
    }
    const claimed = civ.territories.claimedByFaction[civId] ?? 0
    const overlayCells = civ.territories.overlayCells.filter((cell) => cell.factionId === civId)
    return {
      civId,
      claimedTiles: claimed,
      cells: overlayCells,
    }
  }

  private listActiveEvents(): unknown {
    const snapshot = this.requireSnapshot()
    return {
      active: snapshot.events.activeEvents,
      recent: snapshot.events.recentEvents,
    }
  }

  private getEvent(input: Record<string, unknown>): unknown {
    const snapshot = this.requireSnapshot()
    const eventId = asString(input.eventId)
    if (!eventId) {
      throw new Error('eventId required')
    }
    const details = this.pack.eventDetails(snapshot, eventId)
    if (!details) {
      throw new Error(`event not found: ${eventId}`)
    }
    return details
  }

  private listEras(): unknown {
    const world = this.providers.getWorldState()
    const logs = this.providers.getLogEntries(5000)
    return this.buildEraRows(world.tick, logs)
  }

  private getEra(input: Record<string, unknown>): unknown {
    const eraId = asString(input.eraId)
    if (!eraId) {
      throw new Error('eraId required')
    }
    const world = this.providers.getWorldState()
    const logs = this.providers.getLogEntries(5000)
    const eras = this.buildEraRows(world.tick, logs)
    const era = eras.find((item) => item.id === eraId)
    if (!era) {
      throw new Error(`era not found: ${eraId}`)
    }
    return era
  }

  private buildEraRows(currentTick: number, logs: readonly LogEntry[]): Array<{
    id: string
    label: string
    startTick: number
    endTick: number
    eventCount: number
    warCount: number
    speciationCount: number
    civShiftCount: number
  }> {
    const eraSpan = 4000
    const eraCount = Math.max(1, Math.floor(currentTick / eraSpan) + 1)
    const rows: Array<{
      id: string
      label: string
      startTick: number
      endTick: number
      eventCount: number
      warCount: number
      speciationCount: number
      civShiftCount: number
    }> = []
    for (let i = 0; i < eraCount; i++) {
      const startTick = i * eraSpan
      const endTick = startTick + eraSpan - 1
      const id = `era-${i}`
      let eventCount = 0
      let warCount = 0
      let speciationCount = 0
      let civShiftCount = 0
      for (let j = 0; j < logs.length; j++) {
        const log = logs[j]
        if (!log) continue
        if (log.tick < startTick || log.tick > endTick) continue
        if (log.category === 'events') eventCount++
        if (log.category === 'speciation') speciationCount++
        if (log.category === 'civ_war') warCount++
        if (String(log.category).startsWith('civ_')) civShiftCount++
      }
      rows.push({
        id,
        label: `Era ${i}`,
        startTick,
        endTick,
        eventCount,
        warCount,
        speciationCount,
        civShiftCount,
      })
    }
    return rows
  }

  private queryRegion(input: Record<string, unknown>): unknown {
    const world = this.providers.getWorldState()
    const x0 = Number(input.x0)
    const y0 = Number(input.y0)
    const x1 = Number(input.x1)
    const y1 = Number(input.y1)
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
      throw new Error('x0,y0,x1,y1 required')
    }
    const minX = clampInt(Math.min(x0, x1), 0, world.width - 1)
    const maxX = clampInt(Math.max(x0, x1), 0, world.width - 1)
    const minY = clampInt(Math.min(y0, y1), 0, world.height - 1)
    const maxY = clampInt(Math.max(y0, y1), 0, world.height - 1)

    const faunaCount = this.providers
      .getCreatureSystem()
      .queryCreaturesInRect({ minX, minY, maxX, maxY }, [])
      .length
    const civCount = this.providers.getCivSystem().queryAgentsInRect({ minX, minY, maxX, maxY }, []).length

    return this.pack.mapStats(
      world,
      { x0: minX, y0: minY, x1: maxX, y1: maxY },
      faunaCount,
      civCount,
    )
  }

  private getRecentLogs(input: Record<string, unknown>): unknown {
    const limit = asLimit(input.limit, 40, 200)
    const page = asPage(input.page, 0)
    const category = asString(input.category) || undefined
    const severity = asString(input.severity) || undefined
    const entries = this.providers.getLogEntries(Math.max(limit * (page + 1), limit))
    return this.pack.recentLogs(entries, { category, severity }, page, limit)
  }
}
