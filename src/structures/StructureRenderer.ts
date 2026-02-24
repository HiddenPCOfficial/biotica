import { Container, Graphics } from 'pixi.js'

import type { StructureCatalog } from './StructureCatalog'
import type { StructureInstance, StructureSystem } from './StructureSystem'

export type StructureRenderBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function colorForStructure(instance: StructureInstance, utilityTags: readonly string[]): number {
  if (instance.state === 'damaged') return 0xff9666
  if (instance.state === 'abandoned') return 0x666666
  if (utilityTags.includes('smelting')) return 0xc98354
  if (utilityTags.includes('crafting')) return 0xd6ba7a
  if (utilityTags.includes('storage')) return 0x88a3c7
  if (utilityTags.includes('defense')) return 0x8a8f9a
  if (utilityTags.includes('farming')) return 0x73b95f
  return 0xb59a72
}

/**
 * Renderer Pixi dedicato alle strutture world-level.
 */
export class StructureRenderer {
  private readonly graphics = new Graphics()
  private mounted = false
  private highlightedId: string | null = null

  constructor(
    private readonly structureSystem: StructureSystem,
    private readonly structureCatalog: StructureCatalog,
    private readonly tileSize: number,
  ) {
    this.graphics.zIndex = 27
  }

  mount(container: Container): void {
    if (this.mounted) {
      return
    }
    this.mounted = true
    container.addChild(this.graphics)
  }

  setHighlight(structureId: string | null): void {
    this.highlightedId = structureId
  }

  render(bounds: StructureRenderBounds, zoom: number): void {
    if (!this.mounted) {
      return
    }

    this.graphics.clear()
    const rows = this.structureSystem.queryInRect(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)

    for (let i = 0; i < rows.length; i++) {
      const instance = rows[i]
      if (!instance) continue
      const def = this.structureCatalog.getById(instance.defId)
      if (!def) continue

      const color = colorForStructure(instance, def.utilityTags)
      const hp01 = instance.hp / Math.max(1, instance.maxHp)
      const alpha = instance.state === 'building' ? 0.5 : 0.62 + hp01 * 0.32

      const px = instance.x * this.tileSize
      const py = instance.y * this.tileSize
      const w = instance.w * this.tileSize
      const h = instance.h * this.tileSize

      this.graphics.rect(px + 1, py + 1, Math.max(1, w - 2), Math.max(1, h - 2)).fill({ color, alpha })

      if (zoom >= 2.1 || this.highlightedId === instance.id) {
        const borderColor = this.highlightedId === instance.id ? 0xf8fcff : 0x1a1f29
        const borderAlpha = this.highlightedId === instance.id ? 0.95 : 0.58
        const borderWidth = this.highlightedId === instance.id ? 2 : 1
        this.graphics
          .rect(px + 0.5, py + 0.5, Math.max(1, w - 1), Math.max(1, h - 1))
          .stroke({ color: borderColor, alpha: borderAlpha, width: borderWidth })
      }
    }
  }

  destroy(): void {
    if (this.graphics.parent) {
      this.graphics.parent.removeChild(this.graphics)
    }
    this.graphics.destroy()
    this.mounted = false
  }
}
