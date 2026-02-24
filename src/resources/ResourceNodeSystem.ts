import { TileId } from '../game/enums/TileId'
import type { MaterialCatalog } from '../materials/MaterialCatalog'
import type { WorldState } from '../world/WorldState'

export type ToolTag = 'axe' | 'pickaxe' | 'hammer' | 'shovel'

export type ResourceNodeType = 'tree' | 'stone_vein' | 'iron_vein' | 'clay_patch'

export type ResourceNode = {
  id: string
  type: ResourceNodeType
  x: number
  y: number
  amount: number
  regenRate: number
  requiredToolTag?: ToolTag
  yieldsMaterialId: string
}

type MutableResourceNode = ResourceNode & {
  maxAmount: number
  regenAccumulator: number
}

export type ResourceNodeSystemState = {
  nodes: Array<{
    id: string
    type: ResourceNodeType
    x: number
    y: number
    amount: number
    maxAmount: number
    regenRate: number
    regenAccumulator: number
    requiredToolTag?: ToolTag
    yieldsMaterialId: string
  }>
  regenCursor: number
  nodeCounter: number
}

export type ResourceHarvestResult = {
  ok: boolean
  reason?: 'no_node' | 'depleted' | 'tool_required'
  requiredToolTag?: ToolTag
  nodeId?: string
  nodeType?: ResourceNodeType
  materialId?: string
  harvestedAmount: number
}

export type ResourceNodeDensitySummary = {
  totalNodes: number
  treeNodes: number
  stoneNodes: number
  ironNodes: number
  clayNodes: number
  totalRemainingAmount: number
}

export type ResourceNodeGenerationOptions = {
  treeDensityMultiplier?: number
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function hash2D(seed: number, x: number, y: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1)
  h ^= Math.imul(x | 0, 0x85ebca6b)
  h ^= Math.imul(y | 0, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function tileKey(x: number, y: number): string {
  return `${x}:${y}`
}

function isLandTile(tile: TileId): boolean {
  return tile !== TileId.DeepWater && tile !== TileId.ShallowWater && tile !== TileId.Lava
}

function isForestLike(tile: TileId): boolean {
  return (
    tile === TileId.Forest ||
    tile === TileId.Jungle ||
    tile === TileId.Grassland ||
    tile === TileId.Savanna ||
    tile === TileId.Swamp
  )
}

function isRockLike(tile: TileId): boolean {
  return (
    tile === TileId.Rock ||
    tile === TileId.Hills ||
    tile === TileId.Mountain ||
    tile === TileId.Snow ||
    tile === TileId.Scorched
  )
}

function isClayLike(tile: TileId): boolean {
  return tile === TileId.Swamp || tile === TileId.Beach || tile === TileId.Grassland
}

/**
 * Nodi risorsa deterministici con tool-gating.
 */
export class ResourceNodeSystem {
  private readonly nodes: MutableResourceNode[] = []
  private readonly nodeIndexByTile = new Map<string, number>()
  private regenCursor = 0
  private nodeCounter = 0
  private hasIron = false

  constructor(
    private readonly seed: number,
    private readonly materialCatalog: MaterialCatalog,
  ) {
    this.hasIron = this.materialCatalog.has('iron_ore')
  }

  reset(world: WorldState, options: ResourceNodeGenerationOptions = {}): void {
    this.nodes.length = 0
    this.nodeIndexByTile.clear()
    this.regenCursor = 0
    this.nodeCounter = 0

    const treeDensityMultiplier = clamp(options.treeDensityMultiplier ?? 1, 0.6, 2.1)

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const idx = world.index(x, y)
        const tile = world.tiles[idx] as TileId
        if (!isLandTile(tile)) {
          continue
        }

        const hazard = (world.hazard[idx] ?? 0) / 255
        if (hazard > 0.7) {
          continue
        }

        const roll = hash2D(this.seed ^ 0x736f7572, x, y)

        if (isForestLike(tile)) {
          const threshold =
            tile === TileId.Forest || tile === TileId.Jungle
              ? 0.23 * treeDensityMultiplier
              : tile === TileId.Grassland
                ? 0.13 * treeDensityMultiplier
                : 0.1 * treeDensityMultiplier
          if (roll < threshold) {
            this.addNode({
              type: 'tree',
              x,
              y,
              amount: 120 + Math.floor(hash2D(this.seed ^ 0xa11ce001, x, y) * 110),
              regenRate: 0.06,
              requiredToolTag: 'axe',
              yieldsMaterialId: 'wood',
            })
            continue
          }
        }

        if (isRockLike(tile)) {
          if (roll < 0.085) {
            this.addNode({
              type: 'stone_vein',
              x,
              y,
              amount: 100 + Math.floor(hash2D(this.seed ^ 0x570ae001, x, y) * 120),
              regenRate: 0,
              requiredToolTag: 'pickaxe',
              yieldsMaterialId: 'stone',
            })
            continue
          }

          if (this.hasIron) {
            const ironRoll = hash2D(this.seed ^ 0x1a0ae0ee, x, y)
            if (ironRoll < 0.024) {
              this.addNode({
                type: 'iron_vein',
                x,
                y,
                amount: 80 + Math.floor(hash2D(this.seed ^ 0x1f0a0001, x, y) * 100),
                regenRate: 0,
                requiredToolTag: 'pickaxe',
                yieldsMaterialId: 'iron_ore',
              })
              continue
            }
          }
        }

        if (isClayLike(tile) && roll < 0.045) {
          this.addNode({
            type: 'clay_patch',
            x,
            y,
            amount: 60 + Math.floor(hash2D(this.seed ^ 0xc1a7001, x, y) * 80),
            regenRate: 0.015,
            yieldsMaterialId: 'clay',
          })
        }
      }
    }

    console.info(
      `[ResourceNodeSystem] seed=${this.seed | 0} nodes=${this.nodes.length} trees=${this.countByType('tree')} stone=${this.countByType('stone_vein')} iron=${this.countByType('iron_vein')} clay=${this.countByType('clay_patch')}`,
    )
  }

  step(_tick: number, budget = 220): void {
    if (this.nodes.length === 0) {
      return
    }

    const max = Math.max(1, budget | 0)
    for (let i = 0; i < max; i++) {
      const node = this.nodes[this.regenCursor % this.nodes.length]
      this.regenCursor = (this.regenCursor + 1) % this.nodes.length
      if (!node) continue
      if (node.regenRate <= 0) continue
      if (node.amount >= node.maxAmount) {
        node.regenAccumulator = 0
        continue
      }

      node.regenAccumulator += node.regenRate
      if (node.regenAccumulator < 1) {
        continue
      }

      const whole = Math.floor(node.regenAccumulator)
      node.regenAccumulator -= whole
      node.amount = Math.min(node.maxAmount, node.amount + whole)
    }
  }

  getNodeAt(x: number, y: number): ResourceNode | null {
    const index = this.nodeIndexByTile.get(tileKey(x | 0, y | 0))
    if (index === undefined) {
      return null
    }
    const node = this.nodes[index]
    if (!node) {
      return null
    }
    return {
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      amount: node.amount,
      regenRate: node.regenRate,
      requiredToolTag: node.requiredToolTag,
      yieldsMaterialId: node.yieldsMaterialId,
    }
  }

  getNodes(limit = 5000): ResourceNode[] {
    const max = Math.max(1, limit | 0)
    const out: ResourceNode[] = []
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i]
      if (!node) continue
      out.push({
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        amount: node.amount,
        regenRate: node.regenRate,
        requiredToolTag: node.requiredToolTag,
        yieldsMaterialId: node.yieldsMaterialId,
      })
      if (out.length >= max) {
        break
      }
    }
    return out
  }

  queryInRect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    target: ResourceNode[] = [],
  ): ResourceNode[] {
    target.length = 0
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i]
      if (!node) continue
      if (node.x < minX || node.y < minY || node.x > maxX || node.y > maxY) {
        continue
      }
      target.push({
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        amount: node.amount,
        regenRate: node.regenRate,
        requiredToolTag: node.requiredToolTag,
        yieldsMaterialId: node.yieldsMaterialId,
      })
    }
    return target
  }

  harvestAt(
    x: number,
    y: number,
    toolTags: readonly string[] = [],
    harvestPower = 1,
  ): ResourceHarvestResult {
    const index = this.nodeIndexByTile.get(tileKey(x | 0, y | 0))
    if (index === undefined) {
      return { ok: false, reason: 'no_node', harvestedAmount: 0 }
    }

    const node = this.nodes[index]
    if (!node) {
      return { ok: false, reason: 'no_node', harvestedAmount: 0 }
    }
    if (node.amount <= 0) {
      return {
        ok: false,
        reason: 'depleted',
        nodeId: node.id,
        nodeType: node.type,
        materialId: node.yieldsMaterialId,
        harvestedAmount: 0,
      }
    }

    if (node.requiredToolTag && !toolTags.includes(node.requiredToolTag)) {
      return {
        ok: false,
        reason: 'tool_required',
        requiredToolTag: node.requiredToolTag,
        nodeId: node.id,
        nodeType: node.type,
        materialId: node.yieldsMaterialId,
        harvestedAmount: 0,
      }
    }

    const normalizedPower = clamp(harvestPower, 0.1, 5)
    const base =
      node.type === 'tree'
        ? 2.4
        : node.type === 'clay_patch'
          ? 1.6
          : node.type === 'stone_vein'
            ? 1.8
            : 1.4

    const amount = Math.max(1, Math.floor(base * normalizedPower))
    const harvestedAmount = Math.min(node.amount, amount)
    node.amount -= harvestedAmount

    return {
      ok: harvestedAmount > 0,
      nodeId: node.id,
      nodeType: node.type,
      materialId: node.yieldsMaterialId,
      harvestedAmount,
    }
  }

  getDensitySummary(): ResourceNodeDensitySummary {
    let treeNodes = 0
    let stoneNodes = 0
    let ironNodes = 0
    let clayNodes = 0
    let totalRemainingAmount = 0

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i]
      if (!node) continue
      totalRemainingAmount += node.amount
      if (node.type === 'tree') treeNodes += 1
      else if (node.type === 'stone_vein') stoneNodes += 1
      else if (node.type === 'iron_vein') ironNodes += 1
      else if (node.type === 'clay_patch') clayNodes += 1
    }

    return {
      totalNodes: this.nodes.length,
      treeNodes,
      stoneNodes,
      ironNodes,
      clayNodes,
      totalRemainingAmount,
    }
  }

  exportState(): ResourceNodeSystemState {
    return {
      nodes: this.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        amount: node.amount,
        maxAmount: node.maxAmount,
        regenRate: node.regenRate,
        regenAccumulator: node.regenAccumulator,
        requiredToolTag: node.requiredToolTag,
        yieldsMaterialId: node.yieldsMaterialId,
      })),
      regenCursor: this.regenCursor,
      nodeCounter: this.nodeCounter,
    }
  }

  hydrateState(state: ResourceNodeSystemState): void {
    this.nodes.length = 0
    this.nodeIndexByTile.clear()

    const rows = Array.isArray(state.nodes) ? state.nodes : []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      const node: MutableResourceNode = {
        id: row.id,
        type: row.type,
        x: row.x | 0,
        y: row.y | 0,
        amount: clamp(Math.floor(row.amount), 0, 255),
        maxAmount: clamp(Math.floor(row.maxAmount), 1, 255),
        regenRate: clamp(row.regenRate, 0, 1),
        regenAccumulator: Math.max(0, row.regenAccumulator || 0),
        requiredToolTag: row.requiredToolTag,
        yieldsMaterialId: row.yieldsMaterialId,
      }
      this.nodeIndexByTile.set(tileKey(node.x, node.y), this.nodes.length)
      this.nodes.push(node)
    }

    this.regenCursor = Math.max(0, Math.min(this.nodes.length, state.regenCursor | 0))
    this.nodeCounter = Math.max(0, state.nodeCounter | 0)
  }

  private addNode(node: {
    type: ResourceNodeType
    x: number
    y: number
    amount: number
    regenRate: number
    requiredToolTag?: ToolTag
    yieldsMaterialId: string
  }): void {
    const key = tileKey(node.x, node.y)
    if (this.nodeIndexByTile.has(key)) {
      return
    }

    const clampedAmount = clamp(Math.floor(node.amount), 1, 255)
    const created: MutableResourceNode = {
      id: `rn-${++this.nodeCounter}`,
      type: node.type,
      x: node.x | 0,
      y: node.y | 0,
      amount: clampedAmount,
      maxAmount: clampedAmount,
      regenAccumulator: 0,
      regenRate: clamp(node.regenRate, 0, 1),
      requiredToolTag: node.requiredToolTag,
      yieldsMaterialId: node.yieldsMaterialId,
    }

    this.nodeIndexByTile.set(key, this.nodes.length)
    this.nodes.push(created)
  }

  private countByType(type: ResourceNodeType): number {
    let total = 0
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i]?.type === type) total += 1
    }
    return total
  }
}
