import type { Container } from 'pixi.js'
import { clampInt } from '../shared/math'
import type { WorldState } from '../world/types'

export function worldToTile(worldX: number, worldY: number, tileSize: number): { x: number; y: number } {
  const safeTileSize = Math.max(1, tileSize)
  return {
    x: Math.floor(worldX / safeTileSize),
    y: Math.floor(worldY / safeTileSize),
  }
}

export function clampTileToWorld(
  tileX: number,
  tileY: number,
  world: WorldState,
): { x: number; y: number } {
  return {
    x: clampInt(tileX, 0, Math.max(0, world.width - 1)),
    y: clampInt(tileY, 0, Math.max(0, world.height - 1)),
  }
}

export function worldPointFromScreen(
  screenX: number,
  screenY: number,
  worldContainer: Container,
): { x: number; y: number } {
  const scale = worldContainer.scale.x || 1
  return {
    x: (screenX - worldContainer.position.x) / scale,
    y: (screenY - worldContainer.position.y) / scale,
  }
}

export function screenToWorldPoint(
  canvas: HTMLCanvasElement,
  worldContainer: Container,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const localX = clientX - rect.left
  const localY = clientY - rect.top
  return worldPointFromScreen(localX, localY, worldContainer)
}
