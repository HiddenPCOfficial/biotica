import type { Container } from 'pixi.js'

/**
 * Converte coordinate schermo (clientX/clientY) in coordinate mondo
 * basandosi su position/scale del worldContainer.
 */
export function screenToWorld(
  canvas: HTMLCanvasElement,
  worldContainer: Container,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const localX = screenX - rect.left
  const localY = screenY - rect.top
  const scaleX = worldContainer.scale.x || 1
  const scaleY = worldContainer.scale.y || 1

  return {
    x: (localX - worldContainer.position.x) / scaleX,
    y: (localY - worldContainer.position.y) / scaleY,
  }
}
