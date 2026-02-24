import type { Application, Ticker } from 'pixi.js'

export type MainLoopUpdate = (deltaMs: number, ticker: Ticker) => void

export class MainLoop {
  private readonly listeners = new Set<MainLoopUpdate>()
  private app: Application | null = null

  private readonly tick = (ticker: Ticker): void => {
    for (const listener of this.listeners) {
      listener(ticker.deltaMS, ticker)
    }
  }

  add(listener: MainLoopUpdate): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  start(app: Application): void {
    this.stop()
    this.app = app
    this.app.ticker.add(this.tick)
  }

  stop(): void {
    if (!this.app) {
      return
    }

    this.app.ticker.remove(this.tick)
    this.app = null
  }
}
