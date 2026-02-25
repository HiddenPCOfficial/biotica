export type BioticaEventMap = {
  structureCreated: {
    structureId: string
    defId: string
    x: number
    y: number
    factionId: string
  }
  structureRemoved: {
    structureId: string
  }
  civFounded: {
    factionId: string
    speciesId: string
    tick: number
  }
  eraChanged: {
    from: string | null
    to: string
    tick: number
  }
}

type EventListener<TPayload> = (payload: TPayload) => void

export class EventBus<TEventMap extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof TEventMap, Set<EventListener<unknown>>>()

  on<TKey extends keyof TEventMap>(
    eventName: TKey,
    listener: EventListener<TEventMap[TKey]>,
  ): () => void {
    const bucket = this.listeners.get(eventName) ?? new Set<EventListener<unknown>>()
    bucket.add(listener as EventListener<unknown>)
    this.listeners.set(eventName, bucket)

    return () => {
      bucket.delete(listener as EventListener<unknown>)
      if (bucket.size === 0) {
        this.listeners.delete(eventName)
      }
    }
  }

  emit<TKey extends keyof TEventMap>(eventName: TKey, payload: TEventMap[TKey]): void {
    const bucket = this.listeners.get(eventName)
    if (!bucket || bucket.size === 0) {
      return
    }

    for (const listener of bucket) {
      listener(payload)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

export function createBioticaEventBus(): EventBus<BioticaEventMap> {
  return new EventBus<BioticaEventMap>()
}
