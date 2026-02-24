import type { Application } from 'pixi.js'

import type { StateScene } from '../core/GameStateMachine'
import type { SaveManager } from '../save/SaveManager'
import type { SaveSort, WorldProfile, WorldSaveRecord } from '../save/SaveTypes'
import type { SettingsStore } from '../settings/SettingsStore'

export type GameSceneId = 'boot' | 'mainMenu' | 'worldCreate' | 'worldLoad' | 'loading' | 'world'

export type WorldLaunchPayload = {
  worldId: string
  profile: WorldProfile
  loadedRecord?: WorldSaveRecord | null
}

export type LoadingTaskResult = {
  next: GameSceneId
  payload?: GameScenePayload
}

export type LoadingTask = (helpers: {
  setProgress: (value: number) => void
  setLabel: (text: string) => void
}) => Promise<LoadingTaskResult>

export type LoadingScenePayload = {
  title: string
  subtitle?: string
  task: LoadingTask
}

export type GameScenePayload =
  | {
      worldLoad?: {
        sort?: SaveSort
      }
    }
  | {
      loading: LoadingScenePayload
    }
  | {
      world: WorldLaunchPayload
    }
  | undefined

export type SceneRuntimeContext = {
  app: Application
  host: HTMLElement
  saveManager: SaveManager
  settingsStore: SettingsStore
  tileSize: number
  navigate: (scene: GameSceneId, payload?: GameScenePayload) => Promise<void>
  requestQuit: () => void
}

export type SceneFactory = (ctx: SceneRuntimeContext, payload?: GameScenePayload) => StateScene
