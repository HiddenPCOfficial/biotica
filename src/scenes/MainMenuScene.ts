import type { StateScene } from '../core/GameStateMachine'
import { SettingsPage } from '../ui/menu/pages/SettingsPage'
import { MainMenuPage } from '../ui/menu/pages/MainMenuPage'
import { MenuRoot } from '../ui/menu/MenuRoot'
import type { SceneRuntimeContext } from './types'

type MenuPage = {
  mount(container: HTMLElement): void
  destroy(): void
}

export class MainMenuScene implements StateScene {
  private readonly menuRoot = new MenuRoot()
  private page: MenuPage | null = null
  private unsubscribeSettings: (() => void) | null = null

  constructor(private readonly ctx: SceneRuntimeContext) {}

  mount(): void {
    this.menuRoot.mount(this.ctx.host)
    this.menuRoot.setVisible(true)
    this.menuRoot.setCompact(false)
    this.menuRoot.setCanvasBlurEnabled(false, this.ctx.host)

    this.showMainPage()
  }

  update(_deltaMs: number): void {}

  destroy(): void {
    this.unsubscribeSettings?.()
    this.unsubscribeSettings = null

    this.page?.destroy()
    this.page = null

    this.menuRoot.unmount()
    this.menuRoot.setCanvasBlurEnabled(false, this.ctx.host)
  }

  private showMainPage(): void {
    this.unsubscribeSettings?.()
    this.unsubscribeSettings = null

    const page = new MainMenuPage({
      onNewWorld: () => {
        void this.ctx.navigate('worldCreate')
      },
      onLoadWorld: () => {
        void this.ctx.navigate('worldLoad', { worldLoad: { sort: 'updatedDesc' } })
      },
      onSettings: () => {
        this.showSettingsPage()
      },
      onQuit: () => {
        this.ctx.requestQuit()
      },
    })

    this.swapPage(page)
  }

  private showSettingsPage(): void {
    const page = new SettingsPage(this.ctx.settingsStore.get(), {
      onBack: () => this.showMainPage(),
      onChange: (next) => {
        this.ctx.settingsStore.replace(next)
      },
    })

    this.unsubscribeSettings = this.ctx.settingsStore.subscribe((settings) => {
      page.setSettings(settings)
    })

    this.swapPage(page)
  }

  private swapPage(next: MenuPage): void {
    this.page?.destroy()
    this.page = next
    this.page.mount(this.menuRoot.pageHost)
  }
}
