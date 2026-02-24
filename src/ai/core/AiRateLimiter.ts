export type AiRateLimiterOptions = {
  minIntervalMs: number
}

/**
 * Limiter FIFO con intervallo minimo tra job asincroni.
 */
export class AiRateLimiter {
  private queue: Promise<void> = Promise.resolve()
  private nextAllowedAt = 0

  constructor(private readonly options: AiRateLimiterOptions) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const minIntervalMs = Math.max(0, Math.floor(this.options.minIntervalMs))

    const wrapped = this.queue.then(async () => {
      const now = Date.now()
      const waitMs = this.nextAllowedAt - now
      if (waitMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, waitMs)
        })
      }
      this.nextAllowedAt = Date.now() + minIntervalMs
      return task()
    })

    this.queue = wrapped.then(() => undefined).catch(() => undefined)
    return wrapped
  }
}
