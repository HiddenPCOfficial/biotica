import { TerrainGenerator } from '../game/terrain/TerrainGenerator'
import { TerrainScene } from '../game/scenes/TerrainScene'
import type { StateScene } from '../core/GameStateMachine'
import {
  deserializeRuntimeWorldState,
  serializeRuntimeWorldState,
  type RuntimeWorldStateInput,
} from '../save/SaveManager'
import type { SavePreview } from '../save/SaveTypes'
import type { GameSettings } from '../settings/SettingsStore'
import { StructureUiAdapter } from '../ui/data/StructureUiAdapter'
import { MenuRoot } from '../ui/menu/MenuRoot'
import { PauseMenuPage } from '../ui/menu/pages/PauseMenuPage'
import { SettingsPage } from '../ui/menu/pages/SettingsPage'
import { StructuresPage } from '../ui/menu/pages/StructuresPage'
import type { GameScenePayload, SceneRuntimeContext, WorldLaunchPayload } from './types'

type PausePage = {
  mount(container: HTMLElement): void
  destroy(): void
}

function safeDataUrl(canvas: HTMLCanvasElement): string | undefined {
  try {
    return canvas.toDataURL('image/webp', 0.68)
  } catch {
    try {
      return canvas.toDataURL('image/png')
    } catch {
      return undefined
    }
  }
}

export class WorldScene implements StateScene {
  private readonly terrainGenerator = new TerrainGenerator()
  private terrainScene: TerrainScene | null = null
  private launch: WorldLaunchPayload | null = null

  private readonly pauseRoot = new MenuRoot()
  private pausePage: PausePage | null = null

  private settings: GameSettings
  private unsubscribeSettings: (() => void) | null = null

  private autosaveAccumMs = 0
  private lastSeenTick = -1
  private dirtySinceSave = false
  private saving = false
  private initialAutosaveDone = false
  private lastSavedAt = 0

  private pausedByMenu = false
  private pendingExitToMenu = false

  constructor(
    private readonly ctx: SceneRuntimeContext,
    payload?: GameScenePayload,
  ) {
    this.settings = this.ctx.settingsStore.get()
    this.launch = payload && 'world' in payload ? payload.world : null
  }

  async mount(): Promise<void> {
    if (!this.launch) {
      await this.ctx.navigate('mainMenu')
      return
    }

    this.pauseRoot.mount(this.ctx.host)
    this.pauseRoot.setVisible(false)
    this.pauseRoot.setCompact(true)

    const loadedRecord = this.launch.loadedRecord
    const profile = this.launch.profile

    let terrainMap
    let restoreState: ReturnType<typeof deserializeRuntimeWorldState> | null = null

    if (loadedRecord) {
      restoreState = deserializeRuntimeWorldState(loadedRecord.state)
      terrainMap = {
        width: restoreState.width,
        height: restoreState.height,
        seed: restoreState.seed,
        tiles: new Uint8Array(restoreState.tiles),
      }
    } else {
      terrainMap = this.terrainGenerator.generate(profile.terrainConfig)
    }

    const scene = new TerrainScene(this.ctx.app, terrainMap, this.ctx.tileSize, {
      enableGeneAgent: profile.config.enableGeneAgent,
      enableCivs: profile.config.enableCivs,
      enablePredators: profile.config.enablePredators,
      profileEventRate: profile.config.eventRate,
      profileTreeDensity: profile.config.treeDensity,
      initialSimulationSpeed: profile.config.simulationSpeed,
      onManualSaveRequest: () => {
        void this.saveWorld('slot-1', 'manual')
      },
    })
    this.terrainScene = scene
    scene.mount()

    if (restoreState) {
      await scene.hydrateRuntimeState(restoreState)
      await scene.hydrateSystemsSnapshot(loadedRecord?.systems)
      this.lastSeenTick = restoreState.tick
    }

    this.applySettings(this.settings)
    this.unsubscribeSettings = this.ctx.settingsStore.subscribe((settings) => {
      this.settings = settings
      this.applySettings(settings)
    })

    window.addEventListener('keydown', this.onKeyDown)
  }

  update(deltaMs: number): void {
    if (!this.terrainScene) {
      return
    }

    this.terrainScene.update(deltaMs)

    const tick = this.terrainScene.getTick()
    if (tick !== this.lastSeenTick) {
      this.lastSeenTick = tick
      this.dirtySinceSave = true
    }

    if (!this.initialAutosaveDone && tick > 4) {
      this.initialAutosaveDone = true
      void this.saveWorld('slot-1', 'autosave')
    }

    this.autosaveAccumMs += deltaMs
    const intervalMs = Math.max(5000, this.settings.gameplay.autosaveIntervalSec * 1000)
    if (this.autosaveAccumMs >= intervalMs) {
      this.autosaveAccumMs = 0
      void this.saveWorld('slot-1', 'autosave')
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)

    this.unsubscribeSettings?.()
    this.unsubscribeSettings = null

    this.pausePage?.destroy()
    this.pausePage = null

    this.pauseRoot.unmount()
    this.pauseRoot.setCanvasBlurEnabled(false, this.ctx.host)

    this.terrainScene?.destroy()
    this.terrainScene = null
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return
    }

    if (event.code === this.settings.controls.keybinds.pause || event.code === 'Escape') {
      event.preventDefault()
      this.togglePauseMenu()
    }
  }

  private togglePauseMenu(): void {
    if (this.pausedByMenu) {
      this.closePauseMenu()
    } else {
      this.openPauseMenu()
    }
  }

  private openPauseMenu(): void {
    if (!this.terrainScene) {
      return
    }

    this.pausedByMenu = true
    this.terrainScene.setPaused(true)

    this.pauseRoot.setVisible(true)
    this.pauseRoot.setCanvasBlurEnabled(true, this.ctx.host)
    this.showPausePage('')
  }

  private closePauseMenu(): void {
    if (!this.terrainScene) {
      return
    }

    this.pausedByMenu = false
    this.pausePage?.destroy()
    this.pausePage = null

    this.pauseRoot.setVisible(false)
    this.pauseRoot.setCanvasBlurEnabled(false, this.ctx.host)

    this.terrainScene.setPaused(false)
  }

  private showPausePage(status: string): void {
    const page = new PauseMenuPage({
      onResume: () => {
        this.closePauseMenu()
      },
      onSave: () => {
        void this.saveFromPause(page)
      },
      onStructures: () => {
        this.showPauseStructuresPage()
      },
      onSettings: () => {
        this.showPauseSettingsPage()
      },
      onExitToMenu: () => {
        void this.exitToMainMenu()
      },
      onQuit: () => {
        this.ctx.requestQuit()
      },
    })

    page.setStatus(status)
    this.swapPausePage(page)
  }

  private showPauseSettingsPage(): void {
    const page = new SettingsPage(this.settings, {
      onBack: () => {
        this.showPausePage(this.getPauseStatusLabel())
      },
      onChange: (next) => {
        this.ctx.settingsStore.replace(next)
      },
    })
    this.swapPausePage(page)
  }

  private showPauseStructuresPage(): void {
    if (!this.terrainScene) {
      return
    }

    const adapter = StructureUiAdapter.fromUnknown(this.terrainScene.exportSystemsSnapshot())
    const subtitle = adapter
      ? 'Current world structure catalog and buildability context.'
      : 'Structure data unavailable for the current world.'

    const page = new StructuresPage({
      title: 'Structures',
      subtitle,
      adapter,
      emptyMessage: 'No structure catalog available for this world.',
      actions: {
        onBack: () => {
          this.showPausePage(this.getPauseStatusLabel())
        },
        onFocusInstance: (structureId) => {
          this.terrainScene?.focusStructureInstanceById(structureId)
        },
        onFocusExamples: (defId) => {
          this.terrainScene?.focusFirstStructureByDefinition(defId, 2200)
        },
        onBuildHint: (defId) => {
          return adapter?.getBuildHint(defId) ?? null
        },
      },
    })
    this.swapPausePage(page)
  }

  private getPauseStatusLabel(): string {
    return this.lastSavedAt > 0 ? `Last save: ${new Date(this.lastSavedAt).toLocaleTimeString()}` : ''
  }

  private swapPausePage(page: PausePage): void {
    this.pausePage?.destroy()
    this.pausePage = page
    this.pausePage.mount(this.pauseRoot.pageHost)
  }

  private async saveFromPause(page: PauseMenuPage): Promise<void> {
    page.setSaving(true)
    const ok = await this.saveWorld('slot-1', 'manual')
    page.setSaving(false)
    if (ok) {
      page.setStatus(`Saved at ${new Date(this.lastSavedAt).toLocaleTimeString()}`)
    } else {
      page.setStatus('Save failed. Check console for details.')
    }
  }

  private async exitToMainMenu(): Promise<void> {
    if (this.pendingExitToMenu) {
      return
    }
    this.pendingExitToMenu = true

    try {
      if (this.dirtySinceSave) {
        const leave = window.confirm('Unsaved progress detected. Save before exit?')
        if (leave) {
          const ok = await this.saveWorld('slot-1', 'manual')
          if (!ok) {
            return
          }
        }
      }
      await this.ctx.navigate('mainMenu')
    } finally {
      this.pendingExitToMenu = false
    }
  }

  private applySettings(settings: GameSettings): void {
    if (!this.terrainScene) {
      return
    }

    this.terrainScene.setHudVisible(settings.video.showHUD)

    this.ctx.app.ticker.maxFPS = Math.max(24, Math.min(240, settings.video.fpsLimit))

    const canvas = this.ctx.app.canvas
    canvas.style.imageRendering = settings.video.pixelPerfect ? 'pixelated' : 'auto'

    const renderer = this.ctx.app.renderer as {
      resolution?: number
      resize?: (width: number, height: number) => void
    }
    if (renderer && typeof renderer.resolution === 'number') {
      renderer.resolution = settings.video.renderScale
      if (typeof renderer.resize === 'function') {
        renderer.resize(this.ctx.host.clientWidth, this.ctx.host.clientHeight)
      }
    }

    this.terrainScene.setDebugOverlayFlags({
      showTerritoryOverlay: settings.debug.showTerritoryOverlay,
      showHazardOverlay: settings.debug.showHazardOverlay,
    })
  }

  private async saveWorld(slotId: string, reason: 'autosave' | 'manual'): Promise<boolean> {
    if (this.saving || !this.terrainScene || !this.launch) {
      return false
    }

    this.saving = true

    try {
      const runtimeState: RuntimeWorldStateInput = this.terrainScene.exportRuntimeStateInput()
      const state = serializeRuntimeWorldState(runtimeState)
      const preview = this.buildPreview()
      const systems = this.terrainScene.exportSystemsSnapshot()

      await this.ctx.saveManager.saveWorld({
        worldId: this.launch.worldId,
        slotId,
        name: this.launch.profile.name,
        seed: this.launch.profile.seed,
        profile: this.launch.profile,
        preview,
        state,
        systems,
      })

      this.dirtySinceSave = false
      this.lastSavedAt = Date.now()
      if (reason === 'manual') {
        console.info(`[WorldScene] manual save complete id=${this.launch.worldId} slot=${slotId}`)
      }
      return true
    } catch (error) {
      console.error('[WorldScene] save failed', error)
      return false
    } finally {
      this.saving = false
    }
  }

  private buildPreview(): SavePreview {
    const snapshot = this.terrainScene?.getLatestSnapshot()
    const thumb = safeDataUrl(this.ctx.app.canvas)

    if (!snapshot) {
      return {
        thumbnailDataUrl: thumb,
        statsSummary: {
          tick: this.terrainScene?.getTick() ?? 0,
          population: 0,
          biodiversity: 0,
          avgTemp: 0,
          avgHumidity: 0,
          avgHazard: 0,
          era: undefined,
        },
      }
    }

    return {
      thumbnailDataUrl: thumb,
      statsSummary: {
        tick: snapshot.tick,
        population: snapshot.population.totalCreatures,
        biodiversity: snapshot.population.biodiversity,
        avgTemp: snapshot.world.avgTemp,
        avgHumidity: snapshot.world.avgHumidity,
        avgHazard: snapshot.world.avgHazard,
        era: undefined,
      },
    }
  }
}
