import {
  SAVE_SCHEMA_VERSION,
  type SaveManagerConfig,
  type SaveSort,
  type SaveStorage,
  type SaveWorldInput,
  type WorldSaveListItem,
  type WorldSaveRecord,
  type WorldStateSerialized,
  type WorldProfile,
} from './SaveTypes'
import { IndexedDbStorage } from './storage/IndexedDbStorage'
import { LocalStorageFallback } from './storage/LocalStorageFallback'

const DEFAULT_CONFIG: SaveManagerConfig = {
  autosaveIntervalSec: 20,
  maxSlotsPerWorld: 4,
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(value)
  if (n < min) return min
  if (n > max) return max
  return n
}

function cloneRecord(record: WorldSaveRecord): WorldSaveRecord {
  return JSON.parse(JSON.stringify(record)) as WorldSaveRecord
}

function cloneSystems<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sortRecords(records: WorldSaveRecord[], sort: SaveSort): WorldSaveRecord[] {
  const out = [...records]
  if (sort === 'nameAsc') {
    out.sort((a, b) => a.name.localeCompare(b.name) || b.updatedAt - a.updatedAt)
  } else if (sort === 'seedAsc') {
    out.sort((a, b) => a.seed.localeCompare(b.seed) || b.updatedAt - a.updatedAt)
  } else {
    out.sort((a, b) => b.updatedAt - a.updatedAt)
  }
  return out
}

function applyMigrations(record: WorldSaveRecord): WorldSaveRecord {
  const migrated = cloneRecord(record)

  if (!migrated.schemaVersion || migrated.schemaVersion < 1) {
    migrated.schemaVersion = 1
    migrated.preview = migrated.preview ?? {
      statsSummary: {
        tick: 0,
        population: 0,
        biodiversity: 0,
        avgTemp: 0,
        avgHumidity: 0,
        avgHazard: 0,
      },
    }
    if (!migrated.slotId) {
      migrated.slotId = 'slot-1'
    }
  }

  if (migrated.schemaVersion < SAVE_SCHEMA_VERSION) {
    migrated.schemaVersion = SAVE_SCHEMA_VERSION
  }

  return migrated
}

function ensureWorldId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return `world-${Date.now().toString(36)}`
  }
  return trimmed
}

function ensureSlotId(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) {
    return 'slot-1'
  }
  return trimmed
}

export function hashSeedToInt(seed: string | number): number {
  const text = String(seed)
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) | 0
}

export function encodeUint8ArrayToBase64(data: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.subarray(i, i + CHUNK)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function decodeBase64ToUint8Array(raw: string): Uint8Array {
  const binary = atob(raw)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

export type RuntimeWorldStateInput = {
  width: number
  height: number
  seed: number
  tick: number
  tiles: Uint8Array
  humidity: Uint8Array
  temperature: Uint8Array
  fertility: Uint8Array
  hazard: Uint8Array
  plantBiomass: Uint8Array
  volcano: WorldStateSerialized['volcano']
  simTuning: WorldStateSerialized['simTuning']
}

export function serializeRuntimeWorldState(input: RuntimeWorldStateInput): WorldStateSerialized {
  return {
    width: input.width,
    height: input.height,
    seed: input.seed | 0,
    tick: input.tick | 0,
    tilesB64: encodeUint8ArrayToBase64(input.tiles),
    humidityB64: encodeUint8ArrayToBase64(input.humidity),
    temperatureB64: encodeUint8ArrayToBase64(input.temperature),
    fertilityB64: encodeUint8ArrayToBase64(input.fertility),
    hazardB64: encodeUint8ArrayToBase64(input.hazard),
    plantBiomassB64: encodeUint8ArrayToBase64(input.plantBiomass),
    volcano: {
      anchor: { ...input.volcano.anchor },
      minIntervalTicks: input.volcano.minIntervalTicks,
      maxIntervalTicks: input.volcano.maxIntervalTicks,
      maxLavaTiles: input.volcano.maxLavaTiles,
      nextEruptionTick: input.volcano.nextEruptionTick,
      activeEruptionId: input.volcano.activeEruptionId,
    },
    simTuning: { ...input.simTuning },
  }
}

export type RuntimeWorldStateDecoded = {
  width: number
  height: number
  seed: number
  tick: number
  tiles: Uint8Array
  humidity: Uint8Array
  temperature: Uint8Array
  fertility: Uint8Array
  hazard: Uint8Array
  plantBiomass: Uint8Array
  volcano: WorldStateSerialized['volcano']
  simTuning: WorldStateSerialized['simTuning']
}

export function deserializeRuntimeWorldState(state: WorldStateSerialized): RuntimeWorldStateDecoded {
  return {
    width: state.width,
    height: state.height,
    seed: state.seed,
    tick: state.tick,
    tiles: decodeBase64ToUint8Array(state.tilesB64),
    humidity: decodeBase64ToUint8Array(state.humidityB64),
    temperature: decodeBase64ToUint8Array(state.temperatureB64),
    fertility: decodeBase64ToUint8Array(state.fertilityB64),
    hazard: decodeBase64ToUint8Array(state.hazardB64),
    plantBiomass: decodeBase64ToUint8Array(state.plantBiomassB64),
    volcano: {
      anchor: { ...state.volcano.anchor },
      minIntervalTicks: state.volcano.minIntervalTicks,
      maxIntervalTicks: state.volcano.maxIntervalTicks,
      maxLavaTiles: state.volcano.maxLavaTiles,
      nextEruptionTick: state.volcano.nextEruptionTick,
      activeEruptionId: state.volcano.activeEruptionId,
    },
    simTuning: { ...state.simTuning },
  }
}

export function makeWorldProfile(input: {
  name: string
  seed: string
  numericSeed: number
  preset: WorldProfile['preset']
  terrainConfig: WorldProfile['terrainConfig']
  config: WorldProfile['config']
}): WorldProfile {
  const createdAt = Date.now()
  const profileId = `wp-${createdAt.toString(36)}-${Math.abs(input.numericSeed).toString(36)}`
  return {
    id: profileId,
    name: input.name,
    seed: input.seed,
    numericSeed: input.numericSeed,
    preset: input.preset,
    createdAt,
    terrainConfig: { ...input.terrainConfig },
    config: { ...input.config },
  }
}

export class SaveManager {
  private readonly config: SaveManagerConfig
  private readonly storage: SaveStorage

  constructor(config: Partial<SaveManagerConfig> = {}) {
    this.config = {
      autosaveIntervalSec: clampInt(
        config.autosaveIntervalSec ?? DEFAULT_CONFIG.autosaveIntervalSec,
        5,
        300,
      ),
      maxSlotsPerWorld: clampInt(config.maxSlotsPerWorld ?? DEFAULT_CONFIG.maxSlotsPerWorld, 1, 12),
    }

    try {
      this.storage = new IndexedDbStorage()
      console.info('[SaveManager] storage=IndexedDB')
    } catch (error) {
      this.storage = new LocalStorageFallback()
      console.warn(
        `[SaveManager] IndexedDB unavailable, fallback=LocalStorage (${error instanceof Error ? error.message : 'unknown'})`,
      )
    }
  }

  getConfig(): SaveManagerConfig {
    return { ...this.config }
  }

  async listWorlds(sort: SaveSort = 'updatedDesc'): Promise<WorldSaveListItem[]> {
    const records = (await this.storage.list()).map((row) => applyMigrations(row))
    const ordered = sortRecords(records, sort)
    return ordered.map((record) => ({
      id: record.id,
      slotId: record.slotId,
      name: record.name,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
      seed: record.seed,
      preview: { ...record.preview, statsSummary: { ...record.preview.statsSummary } },
      schemaVersion: record.schemaVersion,
    }))
  }

  async loadWorld(id: string): Promise<WorldSaveRecord | null> {
    const row = await this.storage.get(id)
    if (!row) {
      return null
    }
    const migrated = applyMigrations(row)
    if (migrated.schemaVersion !== row.schemaVersion) {
      await this.storage.put(migrated)
    }
    return migrated
  }

  async saveWorld(input: SaveWorldInput): Promise<WorldSaveRecord> {
    const now = Date.now()
    const worldId = ensureWorldId(input.worldId)
    const slotId = ensureSlotId(input.slotId)
    const id = `${worldId}::${slotId}`

    const existing = await this.storage.get(id)

    const record: WorldSaveRecord = {
      id,
      slotId,
      name: input.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      seed: input.seed,
      schemaVersion: SAVE_SCHEMA_VERSION,
      profile: { ...input.profile, terrainConfig: { ...input.profile.terrainConfig }, config: { ...input.profile.config } },
      preview: {
        thumbnailDataUrl: input.preview.thumbnailDataUrl,
        statsSummary: { ...input.preview.statsSummary },
      },
      state: {
        ...input.state,
        volcano: {
          ...input.state.volcano,
          anchor: { ...input.state.volcano.anchor },
        },
        simTuning: { ...input.state.simTuning },
      },
      systems: cloneSystems(input.systems),
    }

    await this.storage.put(record)
    await this.trimSlots(worldId)
    return record
  }

  async deleteWorld(id: string): Promise<void> {
    await this.storage.delete(id)
  }

  async duplicateWorld(id: string): Promise<WorldSaveRecord | null> {
    const existing = await this.loadWorld(id)
    if (!existing) {
      return null
    }

    const worldId = existing.id.split('::')[0] ?? existing.profile.id
    const slotId = `slot-${Date.now().toString(36)}`
    const duplicate: SaveWorldInput = {
      worldId,
      slotId,
      name: `${existing.name} (Copy)`,
      seed: existing.seed,
      profile: {
        ...existing.profile,
        name: `${existing.profile.name} (Copy)`,
      },
      preview: {
        thumbnailDataUrl: existing.preview.thumbnailDataUrl,
        statsSummary: { ...existing.preview.statsSummary },
      },
      state: {
        ...existing.state,
        volcano: {
          ...existing.state.volcano,
          anchor: { ...existing.state.volcano.anchor },
        },
        simTuning: { ...existing.state.simTuning },
      },
      systems: cloneRecord(existing).systems,
    }
    return this.saveWorld(duplicate)
  }

  async createInitialAutosave(input: SaveWorldInput): Promise<WorldSaveRecord> {
    return this.saveWorld({ ...input, slotId: input.slotId ?? 'slot-1' })
  }

  private async trimSlots(worldId: string): Promise<void> {
    const all = await this.storage.list()
    const sameWorld = all
      .filter((record) => record.id.startsWith(`${worldId}::`))
      .sort((a, b) => b.updatedAt - a.updatedAt)

    if (sameWorld.length <= this.config.maxSlotsPerWorld) {
      return
    }

    const toDelete = sameWorld.slice(this.config.maxSlotsPerWorld)
    for (let i = 0; i < toDelete.length; i++) {
      const row = toDelete[i]
      if (!row) continue
      await this.storage.delete(row.id)
    }
  }
}
