export type StateScene = {
  mount(): void | Promise<void>
  update(deltaMs: number): void
  destroy(): void | Promise<void>
}

export type SceneFactory<TState extends string, TPayload> = (
  state: TState,
  payload: TPayload | undefined,
) => StateScene

/**
 * State machine minimal per scene di gioco.
 * Gestisce transizioni serializzate e cleanup della scena precedente.
 */
export class GameStateMachine<TState extends string, TPayload = unknown> {
  private currentState: TState | null = null
  private currentScene: StateScene | null = null
  private transitionToken = 0
  private transitioning = false

  constructor(private readonly factory: SceneFactory<TState, TPayload>) {}

  getState(): TState | null {
    return this.currentState
  }

  isTransitioning(): boolean {
    return this.transitioning
  }

  async start(state: TState, payload?: TPayload): Promise<void> {
    await this.go(state, payload)
  }

  async go(state: TState, payload?: TPayload): Promise<void> {
    const token = ++this.transitionToken
    this.transitioning = true

    const previous = this.currentScene
    this.currentScene = null
    this.currentState = null

    if (previous) {
      await Promise.resolve(previous.destroy())
      if (token !== this.transitionToken) {
        return
      }
    }

    const next = this.factory(state, payload)
    this.currentScene = next
    this.currentState = state

    await Promise.resolve(next.mount())
    if (token !== this.transitionToken) {
      await Promise.resolve(next.destroy())
      return
    }

    this.transitioning = false
  }

  update(deltaMs: number): void {
    if (this.transitioning) {
      return
    }
    this.currentScene?.update(deltaMs)
  }

  async destroy(): Promise<void> {
    this.transitionToken += 1
    this.transitioning = false
    const current = this.currentScene
    this.currentScene = null
    this.currentState = null
    if (current) {
      await Promise.resolve(current.destroy())
    }
  }
}
