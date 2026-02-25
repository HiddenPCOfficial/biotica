import { Container, Graphics } from 'pixi.js'
import { resolveCreatureLod } from './LOD'
import type { TileBounds } from './types'
import { CreatureSystem } from '../sim/CreatureSystem'
import type { Creature } from '../sim/types'

function toHexColor(color: string): number {
  const normalized = color.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  return Number.isFinite(value) ? value : 0xffffff
}

type RenderOptions = {
  zoom: number
  bounds?: TileBounds
}

/**
 * Renderer creature con LOD:
 * - zoom < 1.5: heatmap densità
 * - 1.5 <= zoom < 3: blocchi
 * - zoom >= 3: blocchi + dettagli energia
 */
export class CreatureRenderer {
  readonly creatureLayer = new Container()

  private readonly densityGraphics = new Graphics()
  private readonly baseGraphics = new Graphics()
  private readonly detailGraphics = new Graphics()
  private readonly queryScratch: Creature[] = []

  private detailForced = false
  private readonly heatCellTiles = 8

  constructor(
    private readonly creatureSystem: CreatureSystem,
    private readonly tileSize: number,
  ) {
    this.creatureLayer.addChild(this.densityGraphics, this.baseGraphics, this.detailGraphics)
    this.detailGraphics.visible = false
  }

  mount(parent: Container): void {
    parent.addChild(this.creatureLayer)
  }

  renderCreatures(options?: RenderOptions): void {
    const zoom = options?.zoom ?? 2
    const lod = resolveCreatureLod(zoom, this.detailForced)
    this.detailGraphics.visible = lod === 'details'

    if (lod === 'density') {
      this.renderDensity(options?.bounds)
      this.baseGraphics.clear()
      this.detailGraphics.clear()
      return
    }

    this.densityGraphics.clear()
    this.baseGraphics.clear()
    this.detailGraphics.clear()

    const list = options?.bounds
      ? this.creatureSystem.queryCreaturesInRect(options.bounds, this.queryScratch)
      : this.creatureSystem.getCreatures()

    for (let i = 0; i < list.length; i++) {
      const creature = list[i]
      if (!creature) continue

      const species = this.creatureSystem.getSpeciesById(creature.speciesId)
      const baseColor = toHexColor(species?.color ?? '#ffffff')
      const px = creature.x * this.tileSize
      const py = creature.y * this.tileSize
      const margin = Math.max(1, this.tileSize * 0.15)
      const size = Math.max(1, this.tileSize - margin * 2)

      this.baseGraphics.rect(px + margin, py + margin, size, size).fill(baseColor)

      if (lod === 'details') {
        this.detailGraphics
          .rect(px + margin, py + margin, size, size)
          .stroke({ color: 0x0d0d0d, width: 1, alpha: 0.9 })

        const marker = Math.max(1, this.tileSize * 0.25)
        const markerOffset = (this.tileSize - marker) * 0.5
        const eNorm = Math.max(0, Math.min(1, creature.energy / 120))
        const energyColor = eNorm > 0.66 ? 0x7dff63 : eNorm > 0.33 ? 0xffdd66 : 0xff7a66
        this.detailGraphics
          .rect(px + markerOffset, py + markerOffset, marker, marker)
          .fill({ color: energyColor, alpha: 0.72 })
      }
    }
  }

  setVisible(value: boolean): void {
    this.creatureLayer.visible = value
  }

  setDetailVisible(value: boolean): void {
    this.detailForced = value
    this.detailGraphics.visible = value
  }

  pickCreatureAtWorld(worldX: number, worldY: number): Creature | null {
    const tileX = worldX / this.tileSize
    const tileY = worldY / this.tileSize
    return this.creatureSystem.getCreatureAtWorld(tileX, tileY)
  }

  private renderDensity(bounds?: TileBounds): void {
    this.densityGraphics.clear()
    this.queryScratch.length = 0

    const list = bounds
      ? this.creatureSystem.queryCreaturesInRect(bounds, this.queryScratch)
      : this.creatureSystem.getCreatures()

    const countByCell = new Map<number, number>()
    let maxCount = 1

    for (let i = 0; i < list.length; i++) {
      const creature = list[i]
      if (!creature) continue
      const cx = Math.floor(creature.x / this.heatCellTiles)
      const cy = Math.floor(creature.y / this.heatCellTiles)
      const key = cy * 4096 + cx
      const next = (countByCell.get(key) ?? 0) + 1
      countByCell.set(key, next)
      if (next > maxCount) {
        maxCount = next
      }
    }

    const cellSizePx = this.heatCellTiles * this.tileSize
    for (const [key, value] of countByCell.entries()) {
      const cx = key % 4096
      const cy = Math.floor(key / 4096)
      const alpha = Math.min(0.75, value / maxCount * 0.78)
      const color = value > maxCount * 0.6 ? 0xff8b50 : 0x7fd0ff
      this.densityGraphics
        .rect(cx * cellSizePx, cy * cellSizePx, cellSizePx, cellSizePx)
        .fill({ color, alpha })
    }
  }
}
