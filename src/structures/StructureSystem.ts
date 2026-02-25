import { TileId } from '../game/enums/TileId'
import type { WorldState } from '../world/types'
import type { FrozenStructureDefinition, StructureCatalog, StructureBuildCost } from './StructureCatalog'

export type StructureState = 'building' | 'active' | 'damaged' | 'abandoned'

export type StructureInstance = {
  id: string
  defId: string
  x: number
  y: number
  w: number
  h: number
  factionId: string
  builtAtTick: number
  hp: number
  maxHp: number
  state: StructureState
}

export type PlaceStructureInput = {
  defId: string
  x: number
  y: number
  factionId: string
  builtAtTick: number
  idOverride?: string
  startState?: StructureState
  initialHp01?: number
}

export type DismantleResult = {
  removed: boolean
  reason?: 'not_found'
  structureId?: string
  returnedMaterials?: Array<{ materialId: string; amount: number }>
}

export type StructureInspectorData = {
  instance: StructureInstance
  definition: FrozenStructureDefinition
  ownerFactionId: string
  buildCost: StructureBuildCost[]
}

export type StructureSystemState = {
  instances: StructureInstance[]
  structureCounter: number
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function tileKey(x: number, y: number): string {
  return `${x}:${y}`
}

function isBlocked(tile: TileId): boolean {
  return tile === TileId.DeepWater || tile === TileId.ShallowWater
}

/**
 * Sistema strutture world-level tile anchored.
 */
export class StructureSystem {
  private readonly instances: StructureInstance[] = []
  private readonly byId = new Map<string, StructureInstance>()
  private readonly tileToStructureId = new Map<string, string>()
  private structureCounter = 0

  constructor(
    private readonly catalog: StructureCatalog,
    private readonly world: WorldState,
  ) {}

  clear(): void {
    this.instances.length = 0
    this.byId.clear()
    this.tileToStructureId.clear()
    this.structureCounter = 0
  }

  getCatalog(): StructureCatalog {
    return this.catalog
  }

  getAll(): readonly StructureInstance[] {
    return this.instances
  }

  getById(id: string): StructureInstance | null {
    return this.byId.get(id) ?? null
  }

  getAt(x: number, y: number): StructureInstance | null {
    const structureId = this.tileToStructureId.get(tileKey(x | 0, y | 0))
    if (!structureId) {
      return null
    }
    return this.byId.get(structureId) ?? null
  }

  queryInRect(minX: number, minY: number, maxX: number, maxY: number, target: StructureInstance[] = []): StructureInstance[] {
    target.length = 0
    for (let i = 0; i < this.instances.length; i++) {
      const item = this.instances[i]
      if (!item) continue
      const right = item.x + item.w - 1
      const bottom = item.y + item.h - 1
      if (right < minX || bottom < minY || item.x > maxX || item.y > maxY) {
        continue
      }
      target.push(item)
    }
    return target
  }

  place(input: PlaceStructureInput): { placed: boolean; reason?: string; structure?: StructureInstance } {
    const def = this.catalog.getById(input.defId)
    if (!def) {
      return { placed: false, reason: 'unknown_definition' }
    }

    const x = input.x | 0
    const y = input.y | 0
    if (!this.canPlace(def, x, y)) {
      return { placed: false, reason: 'invalid_tile' }
    }

    const id = input.idOverride ?? `ws-${++this.structureCounter}`
    const hpRatio = clamp(input.initialHp01 ?? 1, 0.05, 1)
    const maxHp = this.computeMaxHp(def)
    const structure: StructureInstance = {
      id,
      defId: def.id,
      x,
      y,
      w: def.size.w,
      h: def.size.h,
      factionId: input.factionId,
      builtAtTick: input.builtAtTick,
      maxHp,
      hp: Math.max(1, Math.floor(maxHp * hpRatio)),
      state: input.startState ?? 'active',
    }

    this.instances.push(structure)
    this.byId.set(id, structure)
    this.claimArea(id, x, y, def.size.w, def.size.h)

    return { placed: true, structure }
  }

  upsertExternal(input: PlaceStructureInput): StructureInstance | null {
    const existing = input.idOverride ? this.byId.get(input.idOverride) : null
    if (existing) {
      existing.x = input.x | 0
      existing.y = input.y | 0
      existing.factionId = input.factionId
      existing.state = input.startState ?? existing.state
      return existing
    }

    const placed = this.place(input)
    return placed.structure ?? null
  }

  removeMissingExternal(externalIds: ReadonlySet<string>): void {
    for (let i = this.instances.length - 1; i >= 0; i--) {
      const instance = this.instances[i]
      if (!instance) continue
      if (!instance.id.startsWith('civ-')) {
        continue
      }
      if (externalIds.has(instance.id)) {
        continue
      }
      this.removeById(instance.id)
    }
  }

  dismantle(structureId: string): DismantleResult {
    const instance = this.byId.get(structureId)
    if (!instance) {
      return { removed: false, reason: 'not_found' }
    }

    const definition = this.catalog.getById(instance.defId)
    if (!definition) {
      this.removeById(structureId)
      return { removed: true, structureId, returnedMaterials: [] }
    }

    const hpFactor = clamp(instance.hp / Math.max(1, instance.maxHp), 0, 1)
    const salvageRatio = definition.salvageRatio * (0.45 + hpFactor * 0.55)
    const returnedMaterials = definition.buildCost.map((row) => ({
      materialId: row.materialId,
      amount: Math.max(0, Math.floor(row.amount * salvageRatio)),
    }))

    this.removeById(structureId)

    return {
      removed: true,
      structureId,
      returnedMaterials,
    }
  }

  step(tick: number): void {
    if (this.instances.length === 0) {
      return
    }

    for (let i = this.instances.length - 1; i >= 0; i--) {
      const instance = this.instances[i]
      if (!instance) continue
      const def = this.catalog.getById(instance.defId)
      if (!def) continue

      let damage = 0
      for (let oy = 0; oy < instance.h; oy++) {
        for (let ox = 0; ox < instance.w; ox++) {
          const tx = instance.x + ox
          const ty = instance.y + oy
          if (!this.world.inBounds(tx, ty)) {
            continue
          }
          const idx = this.world.index(tx, ty)
          const tile = this.world.tiles[idx] as TileId
          const hazard = (this.world.hazard[idx] ?? 0) / 255

          if (tile === TileId.Lava) {
            damage += (1 - def.lavaResistance) * 1.3
          }

          if (hazard > 0.2) {
            damage += Math.max(0, hazard - def.hazardResistance) * 0.45
          }

          const temp = (this.world.temperature[idx] ?? 0) / 255
          if (temp > 0.75) {
            damage += Math.max(0, temp - def.heatResistance) * 0.24
          }
        }
      }

      if (damage > 0) {
        instance.hp = Math.max(0, instance.hp - damage)
      } else if (tick % 90 === 0 && instance.hp < instance.maxHp) {
        instance.hp = Math.min(instance.maxHp, instance.hp + 1)
      }

      const hp01 = instance.hp / Math.max(1, instance.maxHp)
      if (hp01 <= 0) {
        instance.state = 'abandoned'
      } else if (hp01 < 0.36) {
        instance.state = 'damaged'
      } else if (instance.state !== 'building') {
        instance.state = 'active'
      }
    }
  }

  getInspectorData(structureId: string): StructureInspectorData | null {
    const instance = this.byId.get(structureId)
    if (!instance) {
      return null
    }
    const definition = this.catalog.getById(instance.defId)
    if (!definition) {
      return null
    }

    return {
      instance,
      definition,
      ownerFactionId: instance.factionId,
      buildCost: definition.buildCost.map((row) => ({ ...row })),
    }
  }

  exportState(): StructureSystemState {
    return {
      instances: this.instances.map((row) => ({ ...row })),
      structureCounter: this.structureCounter,
    }
  }

  hydrateState(state: StructureSystemState): void {
    this.clear()
    const rows = Array.isArray(state.instances) ? state.instances : []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      if (!this.catalog.has(row.defId)) continue
      const structure: StructureInstance = {
        id: row.id,
        defId: row.defId,
        x: row.x | 0,
        y: row.y | 0,
        w: row.w | 0,
        h: row.h | 0,
        factionId: row.factionId,
        builtAtTick: row.builtAtTick | 0,
        hp: Math.max(0, row.hp),
        maxHp: Math.max(1, row.maxHp),
        state: row.state,
      }
      this.instances.push(structure)
      this.byId.set(structure.id, structure)
      this.claimArea(structure.id, structure.x, structure.y, structure.w, structure.h)
    }
    this.structureCounter = Math.max(0, state.structureCounter | 0)
  }

  private canPlace(def: FrozenStructureDefinition, x: number, y: number): boolean {
    for (let oy = 0; oy < def.size.h; oy++) {
      for (let ox = 0; ox < def.size.w; ox++) {
        const tx = x + ox
        const ty = y + oy
        if (!this.world.inBounds(tx, ty)) {
          return false
        }

        const tile = this.world.tiles[this.world.index(tx, ty)] as TileId
        if (isBlocked(tile)) {
          return false
        }

        const key = tileKey(tx, ty)
        if (this.tileToStructureId.has(key)) {
          return false
        }
      }
    }

    return true
  }

  private claimArea(structureId: string, x: number, y: number, w: number, h: number): void {
    for (let oy = 0; oy < h; oy++) {
      for (let ox = 0; ox < w; ox++) {
        this.tileToStructureId.set(tileKey(x + ox, y + oy), structureId)
      }
    }
  }

  private releaseArea(instance: StructureInstance): void {
    for (let oy = 0; oy < instance.h; oy++) {
      for (let ox = 0; ox < instance.w; ox++) {
        this.tileToStructureId.delete(tileKey(instance.x + ox, instance.y + oy))
      }
    }
  }

  private removeById(structureId: string): void {
    const instance = this.byId.get(structureId)
    if (!instance) {
      return
    }

    this.releaseArea(instance)
    this.byId.delete(structureId)

    const index = this.instances.findIndex((row) => row.id === structureId)
    if (index >= 0) {
      this.instances.splice(index, 1)
    }
  }

  private computeMaxHp(def: FrozenStructureDefinition): number {
    const base = 80
    const costScore = def.buildCost.reduce((acc, row) => acc + row.amount, 0) * 1.8
    const resistanceScore = (def.heatResistance + def.lavaResistance + def.hazardResistance) * 44
    return Math.max(20, Math.floor(base + costScore + resistanceScore))
  }
}
