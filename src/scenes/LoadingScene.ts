import type { StateScene } from '../core/GameStateMachine'
import { MenuRoot } from '../ui/menu/MenuRoot'
import type { GameScenePayload, LoadingScenePayload, SceneRuntimeContext } from './types'

export class LoadingScene implements StateScene {
  private readonly menuRoot = new MenuRoot()
  private readonly root = document.createElement('section')
  private readonly titleEl = document.createElement('h1')
  private readonly subtitleEl = document.createElement('p')
  private readonly labelEl = document.createElement('p')
  private readonly progressTrack = document.createElement('div')
  private readonly progressBar = document.createElement('div')

  private payload: LoadingScenePayload | null
  private cancelled = false

  constructor(
    private readonly ctx: SceneRuntimeContext,
    payload?: GameScenePayload,
  ) {
    this.payload = payload && 'loading' in payload ? payload.loading : null
  }

  mount(): void {
    if (!this.payload) {
      void this.ctx.navigate('mainMenu')
      return
    }

    this.menuRoot.mount(this.ctx.host)
    this.menuRoot.setVisible(true)
    this.menuRoot.setCanvasBlurEnabled(false, this.ctx.host)

    this.root.className = 'bi-menu-page'

    this.titleEl.className = 'bi-menu-title'
    this.titleEl.textContent = this.payload.title

    this.subtitleEl.className = 'bi-menu-subtitle'
    this.subtitleEl.textContent = this.payload.subtitle ?? 'Preparing scene...'

    this.labelEl.className = 'bi-menu-status'
    this.labelEl.textContent = 'Starting...'

    this.progressTrack.className = 'bi-menu-progress-track'
    this.progressBar.className = 'bi-menu-progress-bar'
    this.progressTrack.appendChild(this.progressBar)

    this.root.append(this.titleEl, this.subtitleEl, this.labelEl, this.progressTrack)

    this.menuRoot.pageHost.innerHTML = ''
    this.menuRoot.pageHost.appendChild(this.root)

    void this.runTask()
  }

  update(_deltaMs: number): void {}

  destroy(): void {
    this.cancelled = true
    this.root.remove()
    this.menuRoot.unmount()
    this.menuRoot.setCanvasBlurEnabled(false, this.ctx.host)
  }

  private async runTask(): Promise<void> {
    const payload = this.payload
    if (!payload) {
      return
    }

    try {
      const result = await payload.task({
        setProgress: (value) => {
          this.setProgress(value)
        },
        setLabel: (text) => {
          this.labelEl.textContent = text
        },
      })

      if (this.cancelled) {
        return
      }

      await this.ctx.navigate(result.next, result.payload)
    } catch (error) {
      if (this.cancelled) {
        return
      }
      this.labelEl.textContent = error instanceof Error ? error.message : 'Loading failed'

      const actions = document.createElement('div')
      actions.className = 'bi-menu-actions bi-menu-actions-inline'
      const backBtn = document.createElement('button')
      backBtn.type = 'button'
      backBtn.className = 'bi-menu-btn is-ghost'
      backBtn.textContent = 'Back to Menu'
      backBtn.addEventListener('click', () => {
        void this.ctx.navigate('mainMenu')
      })
      actions.appendChild(backBtn)
      this.root.appendChild(actions)
    }
  }

  private setProgress(value: number): void {
    const clamped = Math.max(0, Math.min(1, value))
    this.progressBar.style.width = `${(clamped * 100).toFixed(1)}%`
  }
}
