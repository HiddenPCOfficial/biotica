import type { Application } from 'pixi.js'

import { GameStateMachine } from '../core/GameStateMachine'
import { MainLoop } from '../core/MainLoop'
import { createRenderer } from '../core/Renderer'
import { SaveManager } from '../save/SaveManager'
import { SettingsStore } from '../settings/SettingsStore'
import { DEFAULT_TILE_SIZE } from '../shared/constants'
import { BootScene } from '../scenes/BootScene'
import { LoadingScene } from '../scenes/LoadingScene'
import { MainMenuScene } from '../scenes/MainMenuScene'
import { WorldCreateScene } from '../scenes/WorldCreateScene'
import { WorldLoadScene } from '../scenes/WorldLoadScene'
import { WorldScene } from '../scenes/WorldScene'
import type { GameSceneId, GameScenePayload, SceneRuntimeContext } from '../scenes/types'

export class Game {
  private static readonly TILE_SIZE = DEFAULT_TILE_SIZE

  private app: Application | null = null
  private host: HTMLElement | null = null

  private readonly mainLoop = new MainLoop()
  private unsubscribeLoop: (() => void) | null = null

  private stateMachine: GameStateMachine<GameSceneId, GameScenePayload> | null = null
  private saveManager: SaveManager | null = null
  private settingsStore: SettingsStore | null = null

  async mount(container: HTMLElement): Promise<void> {
    this.host = container
    this.app = await createRenderer(container)

    this.settingsStore = new SettingsStore()
    this.saveManager = new SaveManager({
      autosaveIntervalSec: this.settingsStore.get().gameplay.autosaveIntervalSec,
    })

    this.stateMachine = new GameStateMachine<GameSceneId, GameScenePayload>((state, payload) => {
      return this.createScene(state, payload)
    })

    this.unsubscribeLoop = this.mainLoop.add((deltaMs) => {
      this.stateMachine?.update(deltaMs)
    })
    this.mainLoop.start(this.app)

    await this.stateMachine.start('boot')
  }

  destroy(): void {
    this.mainLoop.stop()
    this.unsubscribeLoop?.()
    this.unsubscribeLoop = null

    void this.stateMachine?.destroy()
    this.stateMachine = null

    this.saveManager = null
    this.settingsStore = null

    this.app?.destroy(true, { children: true })
    this.app = null
    this.host = null
  }

  private createScene(state: GameSceneId, payload?: GameScenePayload) {
    const ctx = this.buildContext()

    if (state === 'boot') {
      return new BootScene(ctx)
    }
    if (state === 'mainMenu') {
      return new MainMenuScene(ctx)
    }
    if (state === 'worldCreate') {
      return new WorldCreateScene(ctx)
    }
    if (state === 'worldLoad') {
      return new WorldLoadScene(ctx, payload)
    }
    if (state === 'loading') {
      return new LoadingScene(ctx, payload)
    }
    return new WorldScene(ctx, payload)
  }

  private buildContext(): SceneRuntimeContext {
    if (!this.app || !this.host || !this.saveManager || !this.settingsStore || !this.stateMachine) {
      throw new Error('Game context is not ready')
    }

    return {
      app: this.app,
      host: this.host,
      saveManager: this.saveManager,
      settingsStore: this.settingsStore,
      tileSize: Game.TILE_SIZE,
      navigate: async (scene, payload) => {
        await this.stateMachine?.go(scene, payload)
      },
      requestQuit: () => {
        if (typeof window !== 'undefined') {
          window.close()
        }
        void this.stateMachine?.go('mainMenu')
      },
    }
  }
}
