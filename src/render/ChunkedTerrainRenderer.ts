import { Container, Graphics } from 'pixi.js'
import { TileId } from '../game/enums/TileId'
import type { AtmosphereOverlay } from '../events/EventTypes'
import type { WorldState } from '../world/WorldState'
import { consumeDirtyChunks, markAllDirty } from '../world/WorldState'

type TileColorResolver = (tile: TileId, world: WorldState, index: number) => number

type ChunkedTerrainRendererOptions = {
  tileSize: number
  colorResolver?: TileColorResolver
}

export type HeatmapMode = 'none' | 'humidity' | 'temperature' | 'fertility' | 'hazard'

function defaultTileColor(tile: TileId): number {
  switch (tile) {
    case TileId.DeepWater:
      return 0x0b2f6b
    case TileId.ShallowWater:
      return 0x2f78c4
    case TileId.Beach:
      return 0xe9d7a0
    case TileId.Grassland:
      return 0x73b35d
    case TileId.Forest:
      return 0x2e6a3f
    case TileId.Jungle:
      return 0x1f5a2b
    case TileId.Desert:
      return 0xd9bf69
    case TileId.Savanna:
      return 0xa8b659
    case TileId.Swamp:
      return 0x4a5f3f
    case TileId.Hills:
      return 0x7c8f5a
    case TileId.Mountain:
      return 0x6f7683
    case TileId.Snow:
      return 0xf2f5f8
    case TileId.Rock:
      return 0x4f5158
    case TileId.Lava:
      return 0xff5b17
    case TileId.Scorched:
      return 0x2e2622
    default:
      return 0xff00ff
  }
}

/**
 * Renderer terrain chunk-based:
 * - world diviso in chunk (chunkSize = WorldState)
 * - aggiorna solo chunk dirty
 * - effectsLayer separato (hazard + overlay atmosferico)
 */
export class ChunkedTerrainRenderer {
  readonly root = new Container()
  readonly terrainLayer = new Container()
  readonly effectsLayer = new Container()

  private readonly chunkTerrainGraphics: Graphics[] = []
  private readonly chunkHeatmapGraphics: Graphics[] = []
  private readonly chunkHazardGraphics: Graphics[] = []
  private readonly screenOverlayGraphics = new Graphics()
  private readonly colorResolver: TileColorResolver

  private readonly tileSize: number
  private world: WorldState
  private heatmapMode: HeatmapMode = 'none'
  private eventsOverlayEnabled = true

  constructor(world: WorldState, options: ChunkedTerrainRendererOptions) {
    this.world = world
    this.tileSize = Math.max(1, options.tileSize | 0)
    this.colorResolver = options.colorResolver ?? ((tile) => defaultTileColor(tile))

    this.root.addChild(this.terrainLayer, this.effectsLayer)
    this.effectsLayer.addChild(this.screenOverlayGraphics)

    this.buildChunkLayers()
  }

  mount(parent: Container): void {
    parent.addChild(this.root)
  }

  setWorld(world: WorldState): void {
    this.world = world
    this.destroyChunkLayers()
    this.buildChunkLayers()
    markAllDirty(this.world)
  }

  renderAll(): void {
    markAllDirty(this.world)
    this.renderDirty()
  }

  renderDirty(): void {
    const dirty = consumeDirtyChunks(this.world)
    if (dirty.length === 0) {
      return
    }
    this.renderDirtyChunks(dirty)
  }

  renderDirtyChunks(dirtyChunkIndices: readonly number[]): void {
    for (let i = 0; i < dirtyChunkIndices.length; i++) {
      const chunkIndex = dirtyChunkIndices[i]
      if (chunkIndex === undefined) {
        continue
      }
      this.redrawChunk(chunkIndex)
    }
  }

  setAtmosphereOverlay(overlay: AtmosphereOverlay): void {
    if (!this.eventsOverlayEnabled) {
      this.screenOverlayGraphics.clear()
      return
    }

    const storm = Math.max(0, Math.min(1, overlay.stormAlpha))
    const heat = Math.max(0, Math.min(1, overlay.heatAlpha))
    const cold = Math.max(0, Math.min(1, overlay.coldAlpha))

    this.screenOverlayGraphics.clear()
    if (storm > 0.01) {
      this.screenOverlayGraphics
        .rect(0, 0, this.world.width * this.tileSize, this.world.height * this.tileSize)
        .fill({ color: 0x5d728d, alpha: storm })
    }
    if (heat > 0.01) {
      this.screenOverlayGraphics
        .rect(0, 0, this.world.width * this.tileSize, this.world.height * this.tileSize)
        .fill({ color: 0xff8133, alpha: heat * 0.35 })
    }
    if (cold > 0.01) {
      this.screenOverlayGraphics
        .rect(0, 0, this.world.width * this.tileSize, this.world.height * this.tileSize)
        .fill({ color: 0xa6d4ff, alpha: cold * 0.4 })
    }
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }

  setHeatmapMode(mode: HeatmapMode): void {
    if (this.heatmapMode === mode) {
      return
    }
    this.heatmapMode = mode
    markAllDirty(this.world)
  }

  setEventsOverlayEnabled(value: boolean): void {
    if (this.eventsOverlayEnabled === value) {
      return
    }
    this.eventsOverlayEnabled = value
    this.screenOverlayGraphics.clear()
    markAllDirty(this.world)
  }

  setTerrainVisible(value: boolean): void {
    this.terrainLayer.visible = value
  }

  private buildChunkLayers(): void {
    const chunkCount = this.world.chunksX * this.world.chunksY
    for (let i = 0; i < chunkCount; i++) {
      const terrain = new Graphics()
      const heatmap = new Graphics()
      const hazard = new Graphics()
      this.chunkTerrainGraphics.push(terrain)
      this.chunkHeatmapGraphics.push(heatmap)
      this.chunkHazardGraphics.push(hazard)
      this.terrainLayer.addChild(terrain)
      this.effectsLayer.addChild(heatmap)
      this.effectsLayer.addChild(hazard)
    }
  }

  private destroyChunkLayers(): void {
    for (const g of this.chunkTerrainGraphics) {
      g.destroy()
    }
    for (const g of this.chunkHeatmapGraphics) {
      g.destroy()
    }
    for (const g of this.chunkHazardGraphics) {
      g.destroy()
    }
    this.chunkTerrainGraphics.length = 0
    this.chunkHeatmapGraphics.length = 0
    this.chunkHazardGraphics.length = 0
  }

  private redrawChunk(chunkIndex: number): void {
    const chunkX = chunkIndex % this.world.chunksX
    const chunkY = (chunkIndex / this.world.chunksX) | 0
    const chunkSize = this.world.chunkSize
    const startX = chunkX * chunkSize
    const startY = chunkY * chunkSize
    const endX = Math.min(this.world.width, startX + chunkSize)
    const endY = Math.min(this.world.height, startY + chunkSize)

    const terrainGraphics = this.chunkTerrainGraphics[chunkIndex]
    const heatmapGraphics = this.chunkHeatmapGraphics[chunkIndex]
    const hazardGraphics = this.chunkHazardGraphics[chunkIndex]
    if (!terrainGraphics || !heatmapGraphics || !hazardGraphics) {
      return
    }

    terrainGraphics.clear()
    heatmapGraphics.clear()
    hazardGraphics.clear()

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = y * this.world.width + x
        const tile = this.world.tiles[idx] as TileId
        const px = x * this.tileSize
        const py = y * this.tileSize
        const color = this.colorResolver(tile, this.world, idx)

        terrainGraphics.rect(px, py, this.tileSize, this.tileSize).fill(color)

        if (this.heatmapMode !== 'none') {
          const { heatColor, heatAlpha } = this.resolveHeatmapColor(this.heatmapMode, idx)
          if (heatAlpha > 0) {
            heatmapGraphics
              .rect(px, py, this.tileSize, this.tileSize)
              .fill({ color: heatColor, alpha: heatAlpha })
          }
        }

        const hazard = this.world.hazard[idx] ?? 0
        if (this.eventsOverlayEnabled && hazard > 0) {
          const alpha = Math.min(0.7, hazard / 255 * 0.72)
          const hazardColor = tile === TileId.Lava ? 0xffaa33 : 0xb33b2a
          hazardGraphics
            .rect(px, py, this.tileSize, this.tileSize)
            .fill({ color: hazardColor, alpha })
        }
      }
    }
  }

  private resolveHeatmapColor(
    mode: HeatmapMode,
    idx: number,
  ): { heatColor: number; heatAlpha: number } {
    if (mode === 'humidity') {
      const v = (this.world.humidity[idx] ?? 0) / 255
      return {
        heatColor: v > 0.66 ? 0x47b8ff : v > 0.33 ? 0x2b6fd6 : 0x1b2b66,
        heatAlpha: 0.18 + v * 0.26,
      }
    }
    if (mode === 'temperature') {
      const v = (this.world.temperature[idx] ?? 0) / 255
      return {
        heatColor: v > 0.66 ? 0xff5533 : v > 0.33 ? 0xffb347 : 0x4fa3ff,
        heatAlpha: 0.16 + Math.abs(v - 0.5) * 0.34,
      }
    }
    if (mode === 'hazard') {
      const v = (this.world.hazard[idx] ?? 0) / 255
      return {
        heatColor: v > 0.66 ? 0xff2f17 : v > 0.33 ? 0xff8f2b : 0x882d22,
        heatAlpha: v * 0.5,
      }
    }
    if (mode === 'fertility') {
      const v = (this.world.fertility[idx] ?? 0) / 255
      return {
        heatColor: v > 0.66 ? 0x4be46b : v > 0.33 ? 0x62bb62 : 0x356c44,
        heatAlpha: 0.14 + v * 0.34,
      }
    }
    return { heatColor: 0, heatAlpha: 0 }
  }
}
