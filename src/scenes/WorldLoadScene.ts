import type { StateScene } from '../core/GameStateMachine'
import type { SaveSort } from '../save/SaveTypes'
import { MenuRoot } from '../ui/menu/MenuRoot'
import { WorldLoadPage } from '../ui/menu/pages/WorldLoadPage'
import type { GameScenePayload, SceneRuntimeContext } from './types'

type MenuPage = {
  mount(container: HTMLElement): void
  destroy(): void
}

export class WorldLoadScene implements StateScene {
  private readonly menuRoot = new MenuRoot()
  private page: MenuPage | null = null
  private worldLoadPage: WorldLoadPage | null = null
  private sort: SaveSort = 'updatedDesc'

  constructor(private readonly ctx: SceneRuntimeContext, payload?: GameScenePayload) {
    const requestedSort = payload && 'worldLoad' in payload ? payload.worldLoad?.sort : undefined
    if (requestedSort) {
      this.sort = requestedSort
    }
  }

  mount(): void {
    this.menuRoot.mount(this.ctx.host)
    this.menuRoot.setVisible(true)
    this.menuRoot.setCanvasBlurEnabled(false, this.ctx.host)
    this.showLoadPage()
    void this.refresh(this.sort)
  }

  update(_deltaMs: number): void {}

  destroy(): void {
    this.page?.destroy()
    this.page = null
    this.worldLoadPage = null

    this.menuRoot.unmount()
    this.menuRoot.setCanvasBlurEnabled(false, this.ctx.host)
  }

  private async refresh(sort = this.sort): Promise<void> {
    this.sort = sort
    const rows = await this.ctx.saveManager.listWorlds(this.sort)
    this.worldLoadPage?.setSort(this.sort)
    this.worldLoadPage?.setRows(rows)
  }

  private showLoadPage(): void {
    const page = new WorldLoadPage({
      onBack: () => {
        void this.ctx.navigate('mainMenu')
      },
      onRefresh: (sort) => {
        void this.refresh(sort)
      },
      onLoad: (id) => {
        void this.loadWorld(id)
      },
      onDelete: (id) => {
        void this.deleteWorld(id)
      },
      onDuplicate: (id) => {
        void this.duplicateWorld(id)
      },
    })
    this.worldLoadPage = page
    this.worldLoadPage.setSort(this.sort)
    this.swapPage(page)
  }

  private async loadWorld(id: string): Promise<void> {
    await this.ctx.navigate('loading', {
      loading: {
        title: 'Loading World',
        subtitle: id,
        task: async ({ setProgress, setLabel }) => {
          setProgress(0.2)
          setLabel('Reading save record...')
          const record = await this.ctx.saveManager.loadWorld(id)
          if (!record) {
            return {
              next: 'worldLoad',
              payload: {
                worldLoad: {
                  sort: this.sort,
                },
              },
            }
          }

          setProgress(0.6)
          setLabel('Applying migrations and preparing world profile...')
          await Promise.resolve()

          setProgress(1)
          setLabel('Launching world scene...')
          return {
            next: 'world',
            payload: {
              world: {
                worldId: record.id.split('::')[0] ?? `world-${record.profile.id}`,
                profile: record.profile,
                loadedRecord: record,
              },
            },
          }
        },
      },
    })
  }

  private async deleteWorld(id: string): Promise<void> {
    const ok = window.confirm('Delete this save permanently?')
    if (!ok) {
      return
    }
    await this.ctx.saveManager.deleteWorld(id)
    await this.refresh(this.sort)
  }

  private async duplicateWorld(id: string): Promise<void> {
    await this.ctx.saveManager.duplicateWorld(id)
    await this.refresh(this.sort)
  }

  private swapPage(next: MenuPage): void {
    this.page?.destroy()
    this.page = next
    this.page.mount(this.menuRoot.pageHost)
  }
}
