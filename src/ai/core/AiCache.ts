export type AiCacheOptions = {
  maxEntries: number
  ttlMs: number
}

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

/**
 * Cache in-memory TTL + eviction LRU.
 */
export class AiCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>()
  private readonly maxEntries: number
  private readonly ttlMs: number

  constructor(options: AiCacheOptions) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries))
    this.ttlMs = Math.max(1, Math.floor(options.ttlMs))
  }

  get(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return null
    }

    // Touch per ordine LRU.
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: string, value: T): void {
    const expiresAt = Date.now() + this.ttlMs
    if (this.store.has(key)) {
      this.store.delete(key)
    }
    this.store.set(key, { value, expiresAt })
    this.evictIfNeeded()
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  private evictIfNeeded(): void {
    if (this.store.size <= this.maxEntries) {
      return
    }

    const overflow = this.store.size - this.maxEntries
    let removed = 0
    for (const key of this.store.keys()) {
      this.store.delete(key)
      removed += 1
      if (removed >= overflow) {
        break
      }
    }
  }
}
