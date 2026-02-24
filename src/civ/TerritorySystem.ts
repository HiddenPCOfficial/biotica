import type { WorldState } from '../world/WorldState'
import type {
  Agent,
  Faction,
  Structure,
  StructureType,
  TerritoryFactionState,
  TerritoryMapSnapshot,
  TerritorySummary,
} from './types'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

const STRUCTURE_INFLUENCE: Record<StructureType, { radius: number; strength: number }> = {
  Camp: { radius: 5, strength: 0.95 },
  House: { radius: 4, strength: 1.1 },
  FarmPlot: { radius: 3, strength: 0.85 },
  Storage: { radius: 4, strength: 1.25 },
  WatchTower: { radius: 5, strength: 1.15 },
  Road: { radius: 2, strength: 0.42 },
  Temple: { radius: 5, strength: 1.18 },
  Wall: { radius: 3, strength: 0.58 },
}

type StepInput = {
  tick: number
  world: WorldState
  factions: readonly Faction[]
  agents: readonly Agent[]
  structures: readonly Structure[]
}

/**
 * Sistema territori deterministico:
 * - influenza per fazione su griglia parallela al mondo
 * - livello di controllo 0..1 per tile
 * - tile reclamate via bitmask
 * - ownership + bordi pronti per rendering overlay
 */
export class TerritorySystem {
  private readonly size: number
  private readonly ownerMap: Uint16Array
  private readonly controlMap: Uint8Array
  private readonly borderMap: Uint8Array
  private readonly topInfluenceMap: Float32Array
  private readonly secondInfluenceMap: Float32Array

  private version = 1
  private factionOrder: string[] = []
  private readonly factionStateById = new Map<string, TerritoryFactionState>()

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.size = Math.max(1, width * height)
    this.ownerMap = new Uint16Array(this.size)
    this.controlMap = new Uint8Array(this.size)
    this.borderMap = new Uint8Array(this.size)
    this.topInfluenceMap = new Float32Array(this.size)
    this.secondInfluenceMap = new Float32Array(this.size)
  }

  reset(factions: readonly Faction[]): void {
    this.factionStateById.clear()
    this.factionOrder = []
    this.ownerMap.fill(0)
    this.controlMap.fill(0)
    this.borderMap.fill(0)
    this.topInfluenceMap.fill(0)
    this.secondInfluenceMap.fill(0)

    for (let i = 0; i < factions.length; i++) {
      const faction = factions[i]
      if (!faction) continue
      this.factionOrder.push(faction.id)
      this.factionStateById.set(faction.id, this.createFactionState(faction))
    }

    this.version++
  }

  step(input: StepInput): void {
    this.reconcileFactions(input.factions)

    for (let i = 0; i < this.factionOrder.length; i++) {
      const factionId = this.factionOrder[i]
      if (!factionId) continue
      const state = this.factionStateById.get(factionId)
      if (!state) continue
      const faction = input.factions.find((item) => item.id === factionId)
      if (!faction) continue

      state.homeCenterX = faction.homeCenterX
      state.homeCenterY = faction.homeCenterY

      this.decayFactionInfluence(state, input.world)
      this.applyInfluenceBlob(state, faction.homeCenterX, faction.homeCenterY, 6, 1.45)
    }

    for (let i = 0; i < input.structures.length; i++) {
      const structure = input.structures[i]
      if (!structure) continue
      const state = this.factionStateById.get(structure.factionId)
      if (!state) continue

      const rule = STRUCTURE_INFLUENCE[structure.type] ?? STRUCTURE_INFLUENCE.Camp
      const completionBoost = structure.completed ? 1 : clamp(structure.progress, 0.2, 1)
      this.applyInfluenceBlob(
        state,
        structure.x,
        structure.y,
        rule.radius,
        rule.strength * completionBoost,
      )
    }

    for (let i = 0; i < input.agents.length; i++) {
      const agent = input.agents[i]
      if (!agent) continue
      const state = this.factionStateById.get(agent.factionId)
      if (!state) continue

      const activeBoost = agent.energy > 30 ? 1 : 0.6
      const roleBoost = agent.role === 'Leader' ? 1.25 : agent.role === 'Guard' ? 1.15 : 1
      this.applyInfluenceBlob(state, agent.x, agent.y, 2, 0.42 * activeBoost * roleBoost)
    }

    this.recomputeOwnership()
    this.recomputeFactionControlAndClaims()
    this.recomputeBorders()

    this.version++
  }

  getSnapshot(): TerritoryMapSnapshot {
    return {
      ownerMap: this.ownerMap,
      controlMap: this.controlMap,
      borderMap: this.borderMap,
      version: this.version,
      factionOrder: [...this.factionOrder],
    }
  }

  getFactionState(factionId: string): TerritoryFactionState | null {
    return this.factionStateById.get(factionId) ?? null
  }

  getFactionClaimCount(factionId: string): number {
    const state = this.factionStateById.get(factionId)
    return state?.claimedCount ?? 0
  }

  getOwnerFactionIdAt(tileX: number, tileY: number): string | null {
    const x = Math.floor(tileX)
    const y = Math.floor(tileY)
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null
    }
    const idx = y * this.width + x
    const marker = this.ownerMap[idx] ?? 0
    if (marker <= 0) {
      return null
    }
    return this.factionOrder[marker - 1] ?? null
  }

  buildSummary(stride = 4, maxCells = 4200): TerritorySummary {
    const safeStride = Math.max(1, stride | 0)
    const safeMax = Math.max(64, maxCells | 0)
    const overlayCells: TerritorySummary['overlayCells'] = []
    const claimedByFaction: Record<string, number> = {}

    for (let i = 0; i < this.factionOrder.length; i++) {
      const factionId = this.factionOrder[i]
      if (!factionId) continue
      claimedByFaction[factionId] = this.getFactionClaimCount(factionId)
    }

    for (let y = 0; y < this.height; y += safeStride) {
      for (let x = 0; x < this.width; x += safeStride) {
        if (overlayCells.length >= safeMax) {
          break
        }
        const idx = y * this.width + x
        const marker = this.ownerMap[idx] ?? 0
        if (marker <= 0) {
          continue
        }
        const factionId = this.factionOrder[marker - 1]
        if (!factionId) {
          continue
        }
        overlayCells.push({
          x,
          y,
          factionId,
          controlLevel: (this.controlMap[idx] ?? 0) / 255,
          isBorder: (this.borderMap[idx] ?? 0) === 1,
        })
      }
      if (overlayCells.length >= safeMax) {
        break
      }
    }

    return {
      width: this.width,
      height: this.height,
      factionOrder: [...this.factionOrder],
      claimedByFaction,
      overlayCells,
    }
  }

  private createFactionState(faction: Faction): TerritoryFactionState {
    return {
      factionId: faction.id,
      homeCenterX: faction.homeCenterX,
      homeCenterY: faction.homeCenterY,
      territoryInfluenceMap: new Float32Array(this.size),
      controlLevel: new Float32Array(this.size),
      claimedTiles: new Uint8Array(this.size),
      claimedCount: 0,
    }
  }

  private reconcileFactions(factions: readonly Faction[]): void {
    const nextOrder: string[] = []
    const alive = new Set<string>()

    for (let i = 0; i < factions.length; i++) {
      const faction = factions[i]
      if (!faction) continue
      alive.add(faction.id)
      nextOrder.push(faction.id)
      if (!this.factionStateById.has(faction.id)) {
        this.factionStateById.set(faction.id, this.createFactionState(faction))
      }
    }

    for (const [factionId] of this.factionStateById.entries()) {
      if (alive.has(factionId)) {
        continue
      }
      this.factionStateById.delete(factionId)
    }

    this.factionOrder = nextOrder
  }

  private decayFactionInfluence(state: TerritoryFactionState, world: WorldState): void {
    const map = state.territoryInfluenceMap

    for (let idx = 0; idx < this.size; idx++) {
      const current = map[idx] ?? 0
      if (current <= 0.0001) {
        if (current !== 0) {
          map[idx] = 0
        }
        continue
      }

      const hazardPenalty = ((world.hazard[idx] ?? 0) / 255) * 0.03
      const externalPressure = (() => {
        const marker = this.ownerMap[idx] ?? 0
        if (marker <= 0) return 0
        const ownerId = this.factionOrder[marker - 1]
        return ownerId && ownerId !== state.factionId ? 0.025 : 0
      })()

      const decayed = current * 0.958 - hazardPenalty - externalPressure
      map[idx] = decayed > 0.0002 ? decayed : 0
    }
  }

  private applyInfluenceBlob(
    state: TerritoryFactionState,
    cx: number,
    cy: number,
    radius: number,
    strength: number,
  ): void {
    const minX = Math.max(0, cx - radius)
    const maxX = Math.min(this.width - 1, cx + radius)
    const minY = Math.max(0, cy - radius)
    const maxY = Math.min(this.height - 1, cy + radius)
    const map = state.territoryInfluenceMap

    for (let y = minY; y <= maxY; y++) {
      const dy = y - cy
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance > radius) {
          continue
        }

        const falloff = 1 - distance / Math.max(1, radius)
        const contribution = strength * (0.45 + falloff * 0.55)
        const idx = y * this.width + x
        map[idx] = clamp((map[idx] ?? 0) + contribution, 0, 65)
      }
    }
  }

  private recomputeOwnership(): void {
    this.ownerMap.fill(0)
    this.controlMap.fill(0)
    this.topInfluenceMap.fill(0)
    this.secondInfluenceMap.fill(0)

    for (let idx = 0; idx < this.size; idx++) {
      let top = 0
      let second = 0
      let topMarker = 0

      for (let marker = 1; marker <= this.factionOrder.length; marker++) {
        const factionId = this.factionOrder[marker - 1]
        if (!factionId) continue
        const state = this.factionStateById.get(factionId)
        if (!state) continue

        const influence = state.territoryInfluenceMap[idx] ?? 0
        if (influence > top) {
          second = top
          top = influence
          topMarker = marker
        } else if (influence > second) {
          second = influence
        }
      }

      this.topInfluenceMap[idx] = top
      this.secondInfluenceMap[idx] = second

      if (top <= 0.035 || topMarker <= 0) {
        continue
      }

      const control = clamp((top - second) / Math.max(0.01, top + second), 0, 1)
      this.ownerMap[idx] = topMarker
      this.controlMap[idx] = Math.round(control * 255)
    }
  }

  private recomputeFactionControlAndClaims(): void {
    for (let marker = 1; marker <= this.factionOrder.length; marker++) {
      const factionId = this.factionOrder[marker - 1]
      if (!factionId) continue
      const state = this.factionStateById.get(factionId)
      if (!state) continue

      const influenceMap = state.territoryInfluenceMap
      const controlMap = state.controlLevel
      const claimedMap = state.claimedTiles
      let claimedCount = 0

      for (let idx = 0; idx < this.size; idx++) {
        const myInfluence = influenceMap[idx] ?? 0
        if (myInfluence <= 0.0001) {
          controlMap[idx] = 0
          claimedMap[idx] = 0
          continue
        }

        const ownerMarker = this.ownerMap[idx] ?? 0
        const top = this.topInfluenceMap[idx] ?? 0
        const second = this.secondInfluenceMap[idx] ?? 0
        const rival = ownerMarker === marker ? second : top
        const control = clamp(myInfluence / Math.max(0.01, myInfluence + rival), 0, 1)
        controlMap[idx] = control

        const claimed = ownerMarker === marker && control >= 0.5
        claimedMap[idx] = claimed ? 1 : 0
        if (claimed) {
          claimedCount++
        }
      }

      state.claimedCount = claimedCount
    }
  }

  private recomputeBorders(): void {
    this.borderMap.fill(0)

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x
        const owner = this.ownerMap[idx] ?? 0
        if (owner <= 0) {
          continue
        }

        if (x + 1 < this.width) {
          const rightIdx = idx + 1
          const rightOwner = this.ownerMap[rightIdx] ?? 0
          if (rightOwner !== owner) {
            this.borderMap[idx] = 1
            this.borderMap[rightIdx] = 1
          }
        }

        if (y + 1 < this.height) {
          const downIdx = idx + this.width
          const downOwner = this.ownerMap[downIdx] ?? 0
          if (downOwner !== owner) {
            this.borderMap[idx] = 1
            this.borderMap[downIdx] = 1
          }
        }
      }
    }
  }
}
