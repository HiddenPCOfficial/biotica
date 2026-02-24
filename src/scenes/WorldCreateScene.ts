import type { TerrainGenConfig } from '../types/terrain'
import { hashSeedToInt, makeWorldProfile } from '../save/SaveManager'
import { WorldCreatePage, type WorldCreateFormValue } from '../ui/menu/pages/WorldCreatePage'
import { MenuRoot } from '../ui/menu/MenuRoot'
import type { StateScene } from '../core/GameStateMachine'
import type { SceneRuntimeContext } from './types'

type MenuPage = {
  mount(container: HTMLElement): void
  destroy(): void
}

const SIZE_TO_DIMENSIONS: Record<WorldCreateFormValue['worldSize'], { width: number; height: number }> = {
  S: { width: 160, height: 100 },
  M: { width: 220, height: 140 },
  L: { width: 320, height: 200 },
}

function buildTerrainConfig(value: WorldCreateFormValue, numericSeed: number): TerrainGenConfig {
  const size = SIZE_TO_DIMENSIONS[value.worldSize]

  const base: TerrainGenConfig = {
    width: size.width,
    height: size.height,
    seed: numericSeed,
    heightScale: 96,
    moistureScale: 78,
    tempScale: 120,
    seaLevel: 0.42,
    shallowWater: 0.48,
    beachBand: 0.03,
    mountainLevel: 0.8,
    snowTemp: 0.34,
  }

  switch (value.preset) {
    case 'Lush Forest':
      return {
        ...base,
        moistureScale: 64,
        seaLevel: 0.39,
        mountainLevel: 0.74,
      }
    case 'Harsh Desert':
      return {
        ...base,
        moistureScale: 130,
        tempScale: 95,
        seaLevel: 0.36,
      }
    case 'Volcanic':
      return {
        ...base,
        mountainLevel: 0.72,
        tempScale: 102,
      }
    case 'Ice Age':
      return {
        ...base,
        tempScale: 145,
        snowTemp: 0.52,
      }
    case 'Balanced':
    default:
      return base
  }
}

export class WorldCreateScene implements StateScene {
  private readonly menuRoot = new MenuRoot()
  private page: MenuPage | null = null
  private createPage: WorldCreatePage | null = null

  constructor(private readonly ctx: SceneRuntimeContext) {}

  mount(): void {
    this.menuRoot.mount(this.ctx.host)
    this.menuRoot.setVisible(true)
    this.menuRoot.setCanvasBlurEnabled(false, this.ctx.host)
    this.showCreatePage()
  }

  update(_deltaMs: number): void {}

  destroy(): void {
    this.page?.destroy()
    this.page = null
    this.createPage = null

    this.menuRoot.unmount()
    this.menuRoot.setCanvasBlurEnabled(false, this.ctx.host)
  }

  private async createWorld(value: WorldCreateFormValue): Promise<void> {
    this.createPage?.setBusy(true)

    const numericSeed = hashSeedToInt(value.seed)
    const terrainConfig = buildTerrainConfig(value, numericSeed)

    const profile = makeWorldProfile({
      name: value.name,
      seed: value.seed,
      numericSeed,
      preset: value.preset,
      terrainConfig,
      config: {
        worldSize: value.worldSize,
        eventRate: value.eventRate,
        treeDensity: value.treeDensity,
        volcanoCount: value.volcanoCount,
        simulationSpeed: value.simulationSpeed,
        enableGeneAgent: value.enableGeneAgent,
        enableCivs: value.enableCivs,
        enablePredators: value.enablePredators,
      },
    })

    const worldId = `world-${profile.id}`

    try {
      await this.ctx.navigate('loading', {
        loading: {
          title: 'Generating World',
          subtitle: `${profile.name} • seed ${profile.seed}`,
          task: async ({ setProgress, setLabel }) => {
            setProgress(0.2)
            setLabel('Building world profile...')
            await Promise.resolve()

            setProgress(0.55)
            setLabel('Preparing deterministic seed and terrain config...')
            await Promise.resolve()

            setProgress(1)
            setLabel('Launching world scene...')
            return {
              next: 'world',
              payload: {
                world: {
                  worldId,
                  profile,
                },
              },
            }
          },
        },
      })
    } finally {
      this.createPage?.setBusy(false)
    }
  }

  private showCreatePage(): void {
    const page = this.buildCreatePage()
    this.swapPage(page, page)
  }

  private buildCreatePage(): WorldCreatePage {
    return new WorldCreatePage({
      onBack: () => {
        void this.ctx.navigate('mainMenu')
      },
      onCreate: (value) => {
        void this.createWorld(value)
      },
    })
  }

  private swapPage(next: MenuPage, createPage: WorldCreatePage | null): void {
    this.page?.destroy()
    this.createPage = createPage
    next.mount(this.menuRoot.pageHost)
    this.page = next
  }
}
