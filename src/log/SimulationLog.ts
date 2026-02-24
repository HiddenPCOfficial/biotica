export type LogLevel = 'info' | 'warn' | 'error'

export type LogCategory =
  | 'events'
  | 'env'
  | 'creatures'
  | 'births'
  | 'deaths'
  | 'speciation'
  | 'population'
  | 'info'
  | 'civ_foundation'
  | 'civ_split'
  | 'civ_build'
  | 'civ_trade'
  | 'civ_war'
  | 'civ_talk'
  | 'civ_religion'
  | 'civ_law'

export type LogEntry = {
  id: number
  tick: number
  time: number
  level: LogLevel
  severity: LogLevel
  category: LogCategory
  message: string
  position?: { x: number; y: number }
  subjectId?: string
  factionId?: string
  payload?: unknown
  meta?: Record<string, unknown>
}

export type LogDetails = {
  position?: { x: number; y: number }
  subjectId?: string
  factionId?: string
  payload?: unknown
  meta?: Record<string, unknown>
}

export type SimulationLogState = {
  entries: LogEntry[]
  nextId: number
}

/**
 * Ring buffer per log simulazione.
 */
export class SimulationLog {
  private readonly buffer: Array<LogEntry | undefined>
  private cursor = 0
  private size = 0
  private nextId = 1

  constructor(private readonly capacity = 5000) {
    this.buffer = new Array<LogEntry | undefined>(Math.max(32, capacity))
  }

  clear(): void {
    this.cursor = 0
    this.size = 0
    this.nextId = 1
    this.buffer.fill(undefined)
  }

  add(
    category: LogCategory,
    tick: number,
    message: string,
    level: LogLevel = 'info',
    details?: LogDetails,
  ): LogEntry {
    const entry: LogEntry = {
      id: this.nextId++,
      tick,
      time: Date.now(),
      level,
      severity: level,
      category,
      message,
      position: details?.position,
      subjectId: details?.subjectId,
      factionId: details?.factionId,
      payload: details?.payload,
      meta: details?.meta,
    }

    this.buffer[this.cursor] = entry
    this.cursor = (this.cursor + 1) % this.buffer.length
    this.size = Math.min(this.buffer.length, this.size + 1)
    return entry
  }

  addEvent(tick: number, message: string, payload?: Record<string, unknown>): LogEntry {
    return this.add('events', tick, message, 'info', { payload })
  }

  addEnv(tick: number, message: string, payload?: Record<string, unknown>): LogEntry {
    return this.add('env', tick, message, 'info', { payload })
  }

  addCreature(tick: number, message: string, payload?: Record<string, unknown>): LogEntry {
    return this.add('creatures', tick, message, 'info', { payload })
  }

  addBirth(tick: number, message: string, payload?: Record<string, unknown>): LogEntry {
    return this.add('births', tick, message, 'info', { payload })
  }

  addDeath(tick: number, message: string, payload?: Record<string, unknown>): LogEntry {
    return this.add('deaths', tick, message, 'info', { payload })
  }

  addSpeciation(tick: number, message: string, payload?: Record<string, unknown>): LogEntry {
    return this.add('speciation', tick, message, 'info', { payload })
  }

  addInfo(tick: number, message: string, payload?: Record<string, unknown>): LogEntry {
    return this.add('info', tick, message, 'info', { payload })
  }

  addCiv(
    category:
      | 'civ_foundation'
      | 'civ_split'
      | 'civ_build'
      | 'civ_trade'
      | 'civ_war'
      | 'civ_talk'
      | 'civ_religion'
      | 'civ_law',
    tick: number,
    message: string,
    details?: LogDetails,
  ): LogEntry {
    return this.add(category, tick, message, 'info', details)
  }

  getEntries(
    limit = 300,
    categories?: ReadonlySet<LogCategory>,
  ): LogEntry[] {
    const safeLimit = Math.max(1, limit | 0)
    const out: LogEntry[] = []
    const total = this.size

    for (let i = 0; i < total; i++) {
      const idx = (this.cursor - 1 - i + this.buffer.length) % this.buffer.length
      const entry = this.buffer[idx]
      if (!entry) continue
      if (categories && !categories.has(entry.category)) continue
      out.push(entry)
      if (out.length >= safeLimit) break
    }

    out.reverse()
    return out
  }

  exportState(limit = this.buffer.length): SimulationLogState {
    return {
      entries: this.getEntries(limit).map((entry) => ({
        ...entry,
        position: entry.position ? { ...entry.position } : undefined,
        meta: entry.meta ? { ...entry.meta } : undefined,
      })),
      nextId: this.nextId,
    }
  }

  hydrateState(input: unknown): void {
    const rows = Array.isArray(input)
      ? input
      : input && typeof input === 'object' && Array.isArray((input as SimulationLogState).entries)
        ? (input as SimulationLogState).entries
        : null

    if (!rows) {
      return
    }

    const nextIdHint =
      input && typeof input === 'object' && Number.isFinite((input as SimulationLogState).nextId)
        ? (input as SimulationLogState).nextId
        : 1

    this.clear()
    let maxSeenId = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Partial<LogEntry> | undefined
      if (!row || typeof row.message !== 'string' || !row.category) continue
      const rowId = row.id
      const rowTick = row.tick
      const rowTime = row.time
      if (
        typeof rowId !== 'number' ||
        typeof rowTick !== 'number' ||
        typeof rowTime !== 'number' ||
        !Number.isFinite(rowId) ||
        !Number.isFinite(rowTick) ||
        !Number.isFinite(rowTime)
      ) {
        continue
      }

      const entry: LogEntry = {
        id: Math.max(1, Math.floor(rowId)),
        tick: Math.max(0, Math.floor(rowTick)),
        time: Math.floor(rowTime),
        level: row.level ?? 'info',
        severity: row.severity ?? row.level ?? 'info',
        category: row.category,
        message: row.message,
        position: row.position
          ? { x: Math.floor(row.position.x), y: Math.floor(row.position.y) }
          : undefined,
        subjectId: typeof row.subjectId === 'string' ? row.subjectId : undefined,
        factionId: typeof row.factionId === 'string' ? row.factionId : undefined,
        payload: row.payload,
        meta: row.meta ? { ...row.meta } : undefined,
      }

      maxSeenId = Math.max(maxSeenId, entry.id)
      this.buffer[this.cursor] = entry
      this.cursor = (this.cursor + 1) % this.buffer.length
      this.size = Math.min(this.buffer.length, this.size + 1)
    }

    this.nextId = Math.max(1, Math.floor(nextIdHint), maxSeenId + 1)
  }
}
