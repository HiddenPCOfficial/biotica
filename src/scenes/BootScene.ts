import type { StateScene } from '../core/GameStateMachine'
import type { SceneRuntimeContext } from './types'

export class BootScene implements StateScene {
  private cancelled = false

  constructor(private readonly ctx: SceneRuntimeContext) {}

  mount(): void {
    void this.runBoot()
  }

  update(_deltaMs: number): void {}

  destroy(): void {
    this.cancelled = true
  }

  private async runBoot(): Promise<void> {
    await Promise.resolve()
    if (this.cancelled) {
      return
    }
    await this.ctx.navigate('mainMenu')
  }
}
