import { TileId } from '../game/enums/TileId'
import type { WorldState } from '../world/types'
import type { BuildTask, Faction, Structure, StructureType } from './types'

export type BuildResult = {
  accepted: boolean
  reason?: string
  structure?: Structure
}

export type BuildingStepResult = {
  changed: boolean
  completed: Structure[]
}

export type BuildingSystemState = {
  structures: Structure[]
  tasks: BuildTask[]
  structureCounter: number
  taskCounter: number
}

type BuildCost = {
  wood: number
  stone: number
  ore: number
}

type BuildPreset = {
  required: number
  hp: number
  cost: BuildCost
}

const BUILD_PRESETS: Record<StructureType, BuildPreset> = {
  Camp: { required: 10, hp: 40, cost: { wood: 5, stone: 1, ore: 0 } },
  House: { required: 24, hp: 80, cost: { wood: 12, stone: 6, ore: 0 } },
  FarmPlot: { required: 12, hp: 30, cost: { wood: 3, stone: 0, ore: 0 } },
  Storage: { required: 28, hp: 95, cost: { wood: 14, stone: 10, ore: 2 } },
  WatchTower: { required: 32, hp: 105, cost: { wood: 10, stone: 16, ore: 3 } },
  Road: { required: 4, hp: 20, cost: { wood: 0, stone: 2, ore: 0 } },
  Temple: { required: 42, hp: 120, cost: { wood: 18, stone: 18, ore: 6 } },
  Wall: { required: 9, hp: 70, cost: { wood: 2, stone: 6, ore: 0 } },
}

function isBlockedTile(tile: TileId): boolean {
  return tile === TileId.DeepWater || tile === TileId.ShallowWater || tile === TileId.Lava
}

/**
 * Sistema costruzioni deterministico con progress per tick.
 */
export class BuildingSystem {
  private readonly structures: Structure[] = []
  private readonly structureByPos = new Map<string, string>()
  private readonly tasks: BuildTask[] = []
  private structureCounter = 0
  private taskCounter = 0

  reset(): void {
    this.structures.length = 0
    this.structureByPos.clear()
    this.tasks.length = 0
    this.structureCounter = 0
    this.taskCounter = 0
  }

  getStructures(): readonly Structure[] {
    return this.structures
  }

  getStructureAt(x: number, y: number): Structure | null {
    const key = `${x}:${y}`
    const id = this.structureByPos.get(key)
    if (!id) {
      return null
    }
    for (let i = 0; i < this.structures.length; i++) {
      const s = this.structures[i]
      if (!s) continue
      if (s.id === id) {
        return s
      }
    }
    return null
  }

  exportState(): BuildingSystemState {
    return {
      structures: this.structures.map((row) => ({
        ...row,
        storage: { ...row.storage },
      })),
      tasks: this.tasks.map((row) => ({ ...row })),
      structureCounter: this.structureCounter,
      taskCounter: this.taskCounter,
    }
  }

  hydrateState(state: BuildingSystemState): void {
    this.reset()
    const structures = Array.isArray(state.structures) ? state.structures : []
    for (let i = 0; i < structures.length; i++) {
      const row = structures[i]
      if (!row) continue
      const structure: Structure = {
        ...row,
        x: row.x | 0,
        y: row.y | 0,
        storage: { ...row.storage },
      }
      this.structures.push(structure)
      this.structureByPos.set(`${structure.x}:${structure.y}`, structure.id)
    }

    const tasks = Array.isArray(state.tasks) ? state.tasks : []
    for (let i = 0; i < tasks.length; i++) {
      const row = tasks[i]
      if (!row) continue
      this.tasks.push({
        ...row,
        x: row.x | 0,
        y: row.y | 0,
      })
    }

    this.structureCounter = Math.max(0, state.structureCounter | 0)
    this.taskCounter = Math.max(0, state.taskCounter | 0)
  }

  requestBuild(
    faction: Faction,
    type: StructureType,
    x: number,
    y: number,
    world: WorldState,
    tick: number,
  ): BuildResult {
    const preset = BUILD_PRESETS[type]
    if (!preset) {
      return { accepted: false, reason: 'unknown_structure' }
    }

    if (!this.canPlace(type, x, y, world)) {
      return { accepted: false, reason: 'invalid_tile' }
    }

    if (
      faction.stockpile.wood < preset.cost.wood ||
      faction.stockpile.stone < preset.cost.stone ||
      faction.stockpile.ore < preset.cost.ore
    ) {
      return { accepted: false, reason: 'insufficient_materials' }
    }

    faction.stockpile.wood -= preset.cost.wood
    faction.stockpile.stone -= preset.cost.stone
    faction.stockpile.ore -= preset.cost.ore

    const structureId = `st-${faction.id}-${++this.structureCounter}`
    const structure: Structure = {
      id: structureId,
      type,
      x,
      y,
      factionId: faction.id,
      hp: preset.hp,
      storage: { food: 0, wood: 0, stone: 0, ore: 0 },
      builtAtTick: tick,
      completed: false,
      progress: 0,
    }

    this.structures.push(structure)
    this.structureByPos.set(`${x}:${y}`, structure.id)

    const task: BuildTask = {
      id: `bt-${faction.id}-${++this.taskCounter}`,
      structureId,
      type,
      factionId: faction.id,
      x,
      y,
      progress: 0,
      required: preset.required,
      startedAtTick: tick,
    }
    this.tasks.push(task)

    return { accepted: true, structure }
  }

  step(_world: WorldState, _tick: number, buildPowerBudget = 16): BuildingStepResult {
    if (this.tasks.length === 0) {
      return { changed: false, completed: [] }
    }

    const completed: Structure[] = []
    let budget = Math.max(1, buildPowerBudget)
    let changed = false

    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (budget <= 0) {
        break
      }

      const task = this.tasks[i]
      if (!task) continue

      const work = Math.min(3, budget)
      budget -= work

      task.progress += work
      changed = true

      const structure = this.findStructureById(task.structureId)
      if (!structure) {
        this.tasks.splice(i, 1)
        continue
      }

      structure.progress = Math.min(1, task.progress / Math.max(1, task.required))

      if (task.progress >= task.required) {
        structure.completed = true
        structure.progress = 1
        completed.push(structure)
        this.tasks.splice(i, 1)
      }
    }

    return {
      changed,
      completed,
    }
  }

  private canPlace(type: StructureType, x: number, y: number, world: WorldState): boolean {
    if (!world.inBounds(x, y)) {
      return false
    }

    const key = `${x}:${y}`
    if (this.structureByPos.has(key)) {
      return false
    }

    const idx = world.index(x, y)
    const tile = world.tiles[idx] as TileId
    const hazard = world.hazard[idx] ?? 0
    const fertility = world.fertility[idx] ?? 0

    if (isBlockedTile(tile)) {
      return false
    }

    if (hazard > 120) {
      return false
    }

    if (type === 'FarmPlot') {
      if (fertility < 120) {
        return false
      }
      if (tile === TileId.Rock || tile === TileId.Mountain || tile === TileId.Snow) {
        return false
      }
    }

    if (type === 'Temple' && hazard > 70) {
      return false
    }

    if (type === 'WatchTower') {
      const elevated =
        tile === TileId.Hills || tile === TileId.Mountain || tile === TileId.Rock || tile === TileId.Scorched
      if (!elevated) {
        return false
      }
    }

    return true
  }

  private findStructureById(id: string): Structure | null {
    for (let i = 0; i < this.structures.length; i++) {
      const s = this.structures[i]
      if (!s) continue
      if (s.id === id) {
        return s
      }
    }
    return null
  }
}
