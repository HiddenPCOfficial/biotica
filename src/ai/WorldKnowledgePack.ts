import { TileId } from '../game/enums/TileId'
import type { LogEntry } from '../log/SimulationLog'
import type { SimulationSnapshot } from '../ui/overlay/types'
import type { WorldState } from '../world/types'
import type { SpeciesStat, Creature } from '../sim/types'

type CivSnapshot = NonNullable<SimulationSnapshot['civ']>

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function hashText(value: string): string {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

function tileName(tile: number): string {
  return TileId[tile] ?? `Tile-${tile}`
}

function asPage(page: number | undefined): number {
  if (!Number.isFinite(page)) return 0
  return Math.max(0, Math.floor(page as number))
}

function asSize(size: number | undefined, min = 1, max = 100): number {
  if (!Number.isFinite(size)) return clampInt(20, min, max)
  return clampInt(size as number, min, max)
}

export type WorldKnowledgeSummary = {
  tick: number
  eraId: string
  avgClimate: {
    temperature: number
    humidity: number
    fertility: number
    hazard: number
  }
  biomassTotal: number
  totalPopulation: number
  biodiversity: number
  activeEvents: Array<{
    id: string
    type: string
    x: number
    y: number
    remainingTicks: number
    intensity: number
  }>
  topSpecies: Array<{
    speciesId: string
    name: string
    population: number
    intelligence: number
    vitality: number
  }>
  topCivilizations: Array<{
    id: string
    name: string
    population: number
    techLevel: number
    literacyLevel: number
    state: string
  }>
  hash: string
}

export type BasePackOutput = {
  text: string
  summary: WorldKnowledgeSummary
}

export type RegionRect = {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type RecentLogsFilter = {
  category?: string
  severity?: string
}

/**
 * Costruisce un pack sintetico, paginabile e stabile per Q&A LLM.
 * Non esporta liste massive complete (es. tutte le creature).
 */
export class WorldKnowledgePack {
  buildBasePack(snapshot: SimulationSnapshot): BasePackOutput {
    const tick = snapshot.tick
    const eraId = `era-${Math.floor(tick / 4000)}`
    const topSpecies = snapshot.population.speciesRows
      .slice(0, 10)
      .map((row) => ({
        speciesId: row.speciesId,
        name: row.commonName || row.name,
        population: row.population,
        intelligence: row.intelligence,
        vitality: row.vitality,
      }))
    const topCivilizations = (snapshot.civ?.factions ?? [])
      .slice()
      .sort((a, b) => b.population - a.population)
      .slice(0, 5)
      .map((faction) => ({
        id: faction.id,
        name: faction.name,
        population: faction.population,
        techLevel: faction.techLevel,
        literacyLevel: faction.literacyLevel,
        state: faction.state,
      }))
    const activeEvents = snapshot.events.activeEvents.slice(0, 12).map((event) => ({
      id: event.id,
      type: event.type,
      x: event.x,
      y: event.y,
      remainingTicks: event.remainingTicks,
      intensity: event.intensity,
    }))

    const summary: WorldKnowledgeSummary = {
      tick,
      eraId,
      avgClimate: {
        temperature: snapshot.world.avgTemp,
        humidity: snapshot.world.avgHumidity,
        fertility: snapshot.world.avgFertility,
        hazard: snapshot.world.avgHazard,
      },
      biomassTotal: snapshot.world.biomassTotal,
      totalPopulation: snapshot.population.totalCreatures + (snapshot.civ?.factionMembers.length ?? 0),
      biodiversity: snapshot.population.biodiversity,
      activeEvents,
      topSpecies,
      topCivilizations,
      hash: '',
    }
    summary.hash = hashText(JSON.stringify(summary))

    const text = [
      `Tick ${summary.tick} (${summary.eraId})`,
      `Clima medio: temp=${summary.avgClimate.temperature.toFixed(3)} hum=${summary.avgClimate.humidity.toFixed(3)} fert=${summary.avgClimate.fertility.toFixed(3)} hazard=${summary.avgClimate.hazard.toFixed(3)}`,
      `Biomassa=${summary.biomassTotal.toFixed(1)} popolazioneTot=${summary.totalPopulation} biodiversita=${summary.biodiversity}`,
      `Eventi attivi: ${summary.activeEvents.map((e) => `${e.type}[${e.id}]`).join(', ') || 'nessuno'}`,
      `Top specie: ${summary.topSpecies.map((s) => `${s.name}(${s.population})`).join(', ') || 'nessuna'}`,
      `Top civ: ${summary.topCivilizations.map((c) => `${c.name}(${c.population})`).join(', ') || 'nessuna'}`,
    ].join('\n')

    return { text, summary }
  }

  topSpecies(snapshot: SimulationSnapshot, page = 0, size = 10): {
    page: number
    size: number
    total: number
    items: SimulationSnapshot['population']['speciesRows']
  } {
    const all = snapshot.population.speciesRows
    const p = asPage(page)
    const s = asSize(size, 1, 100)
    const from = p * s
    return {
      page: p,
      size: s,
      total: all.length,
      items: all.slice(from, from + s),
    }
  }

  speciesDetails(snapshot: SimulationSnapshot, speciesId: string): SimulationSnapshot['population']['speciesRows'][number] | null {
    return snapshot.population.speciesRows.find((item) => item.speciesId === speciesId) ?? null
  }

  creatureDetails(creatures: readonly Creature[], speciesStats: readonly SpeciesStat[], creatureId: string): {
    id: string
    speciesId: string
    speciesName: string
    x: number
    y: number
    energy: number
    health: number
    hydration: number
    waterNeed: number
    age: number
    generation: number
    tempStress: number
    humidityStress: number
    genome: Creature['genome']
  } | null {
    const creature = creatures.find((item) => item.id === creatureId)
    if (!creature) return null
    const species = speciesStats.find((item) => item.speciesId === creature.speciesId)
    return {
      id: creature.id,
      speciesId: creature.speciesId,
      speciesName: species?.commonName ?? species?.name ?? creature.speciesId,
      x: creature.x,
      y: creature.y,
      energy: creature.energy,
      health: creature.health,
      hydration: creature.hydration,
      waterNeed: creature.waterNeed,
      age: creature.age,
      generation: creature.generation,
      tempStress: creature.tempStress,
      humidityStress: creature.humidityStress,
      genome: creature.genome,
    }
  }

  civDetails(snapshot: SimulationSnapshot, civId: string): {
    faction: CivSnapshot['factions'][number]
    members: CivSnapshot['factionMembers']
    territories: CivSnapshot['territories']['overlayCells']
    ethnicities: CivSnapshot['ethnicities']
    religions: CivSnapshot['religions']
  } | null {
    const civ = snapshot.civ
    if (!civ) return null
    const faction = civ.factions.find((item) => item.id === civId)
    if (!faction) return null
    return {
      faction,
      members: civ.factionMembers.filter((item) => item.factionId === civId),
      territories: civ.territories.overlayCells.filter((item) => item.factionId === civId),
      ethnicities: civ.ethnicities.filter((item) => item.factionId === civId),
      religions: civ.religions.filter((item) => faction.religionId === item.id),
    }
  }

  eventDetails(snapshot: SimulationSnapshot, eventId: string): SimulationSnapshot['events']['activeEvents'][number] | SimulationSnapshot['events']['recentEvents'][number] | null {
    return (
      snapshot.events.activeEvents.find((item) => item.id === eventId) ??
      snapshot.events.recentEvents.find((item) => item.id === eventId) ??
      null
    )
  }

  mapStats(world: WorldState, rect: RegionRect, speciesPopulation: number, civPopulation: number): {
    rect: RegionRect
    areaTiles: number
    avgBiomass: number
    avgHazard: number
    avgFertility: number
    avgTemperature: number
    avgHumidity: number
    dominantTiles: Array<{ tile: string; ratio: number }>
    approxPopulationDensity: number
  } {
    const xMin = clampInt(Math.min(rect.x0, rect.x1), 0, world.width - 1)
    const xMax = clampInt(Math.max(rect.x0, rect.x1), 0, world.width - 1)
    const yMin = clampInt(Math.min(rect.y0, rect.y1), 0, world.height - 1)
    const yMax = clampInt(Math.max(rect.y0, rect.y1), 0, world.height - 1)
    const tileCounts = new Map<number, number>()
    let n = 0
    let biomass = 0
    let hazard = 0
    let fertility = 0
    let temperature = 0
    let humidity = 0
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const idx = world.index(x, y)
        n += 1
        biomass += world.plantBiomass[idx] ?? 0
        hazard += world.hazard[idx] ?? 0
        fertility += world.fertility[idx] ?? 0
        temperature += world.temperature[idx] ?? 0
        humidity += world.humidity[idx] ?? 0
        const tile = world.tiles[idx] ?? 0
        tileCounts.set(tile, (tileCounts.get(tile) ?? 0) + 1)
      }
    }
    const areaTiles = Math.max(1, n)
    const dominantTiles = [...tileCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tile, count]) => ({ tile: tileName(tile), ratio: count / areaTiles }))

    return {
      rect: { x0: xMin, y0: yMin, x1: xMax, y1: yMax },
      areaTiles,
      avgBiomass: biomass / areaTiles / 255,
      avgHazard: hazard / areaTiles / 255,
      avgFertility: fertility / areaTiles / 255,
      avgTemperature: temperature / areaTiles / 255,
      avgHumidity: humidity / areaTiles / 255,
      dominantTiles,
      approxPopulationDensity: (speciesPopulation + civPopulation) / areaTiles,
    }
  }

  recentLogs(
    entries: readonly LogEntry[],
    filter: RecentLogsFilter = {},
    page = 0,
    size = 20,
  ): {
    page: number
    size: number
    total: number
    items: Array<{
      id: number
      tick: number
      category: string
      severity: string
      message: string
      subjectId?: string
      factionId?: string
      position?: { x: number; y: number }
    }>
  } {
    const category = filter.category?.trim().toLowerCase()
    const severity = filter.severity?.trim().toLowerCase()
    const filtered = entries.filter((entry) => {
      if (category && String(entry.category).toLowerCase() !== category) {
        return false
      }
      if (severity && String(entry.severity).toLowerCase() !== severity) {
        return false
      }
      return true
    })

    const p = asPage(page)
    const s = asSize(size, 1, 100)
    const from = p * s
    return {
      page: p,
      size: s,
      total: filtered.length,
      items: filtered.slice(from, from + s).map((entry) => ({
        id: entry.id,
        tick: entry.tick,
        category: String(entry.category),
        severity: String(entry.severity),
        message: entry.message,
        subjectId: entry.subjectId,
        factionId: entry.factionId,
        position: entry.position,
      })),
    }
  }
}
