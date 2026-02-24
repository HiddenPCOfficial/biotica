import type { Application } from 'pixi.js'

import { MainLoop } from './core/mainLoop'
import { createRenderer } from './core/renderer'
import type { Scene } from './scenes/Scene'
import { TerrainScene } from './scenes/TerrainScene'
import { TerrainGenerator } from './terrain/TerrainGenerator'
import type { TerrainGenConfig, TerrainMap } from '../types/terrain'

export class Game {
  private static readonly TILE_SIZE = 8

  private app: Application | null = null
  private scene: Scene | null = null
  private readonly terrainGenerator = new TerrainGenerator()
  private terrainMap: TerrainMap | null = null
  private readonly mainLoop = new MainLoop()
  private unsubscribeLoop: (() => void) | null = null

  async mount(container: HTMLElement): Promise<void> {
    this.app = await createRenderer(container)
    const tileSize = Game.TILE_SIZE
    const seedFromQuery = (() => {
      if (typeof window === 'undefined') {
        return null
      }
      const raw = new URLSearchParams(window.location.search).get('seed')
      if (!raw) {
        return null
      }
      const value = Number(raw)
      return Number.isFinite(value) ? Math.floor(value) : null
    })()
    const worldSeed = seedFromQuery ?? Math.floor(Math.random() * 100000000)

    const terrainConfig: TerrainGenConfig = {
      width: Math.max(1, Math.floor(this.app.screen.width / tileSize)),
      height: Math.max(1, Math.floor(this.app.screen.height / tileSize)),
      seed: worldSeed,
      heightScale: 96,
      moistureScale: 78,
      tempScale: 120,
      seaLevel: 0.42,
      shallowWater: 0.48,
      beachBand: 0.03,
      mountainLevel: 0.8,
      snowTemp: 0.34,
    }

    this.terrainMap = this.terrainGenerator.generate(terrainConfig)
    const terrainScene = new TerrainScene(this.app, this.terrainMap, tileSize)
    terrainScene.mount()
    this.scene = terrainScene
    this.unsubscribeLoop = this.mainLoop.add((deltaMs) => {
      this.scene?.update(deltaMs)
    })

    this.mainLoop.start(this.app)
  }

  destroy(): void {
    this.mainLoop.stop()
    this.unsubscribeLoop?.()
    this.unsubscribeLoop = null

    this.scene?.destroy()
    this.scene = null

    this.terrainMap = null

    this.app?.destroy(true, { children: true })
    this.app = null
  }
}
