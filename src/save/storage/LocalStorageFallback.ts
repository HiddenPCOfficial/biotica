import type { SaveStorage, WorldSaveRecord } from '../SaveTypes'

const STORAGE_KEY = 'biotica_world_saves_v1'

type StorageShape = {
  records: WorldSaveRecord[]
}

function readStorage(): StorageShape {
  if (typeof window === 'undefined') {
    return { records: [] }
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return { records: [] }
  }

  try {
    const parsed = JSON.parse(raw) as StorageShape
    if (!parsed || !Array.isArray(parsed.records)) {
      return { records: [] }
    }
    return parsed
  } catch {
    return { records: [] }
  }
}

function writeStorage(value: StorageShape): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function cloneRecord(record: WorldSaveRecord): WorldSaveRecord {
  return JSON.parse(JSON.stringify(record)) as WorldSaveRecord
}

export class LocalStorageFallback implements SaveStorage {
  async list(): Promise<WorldSaveRecord[]> {
    return readStorage().records.map((row) => cloneRecord(row))
  }

  async get(id: string): Promise<WorldSaveRecord | null> {
    const row = readStorage().records.find((item) => item.id === id)
    return row ? cloneRecord(row) : null
  }

  async put(record: WorldSaveRecord): Promise<void> {
    const storage = readStorage()
    const idx = storage.records.findIndex((item) => item.id === record.id)
    if (idx >= 0) {
      storage.records[idx] = cloneRecord(record)
    } else {
      storage.records.push(cloneRecord(record))
    }
    writeStorage(storage)
  }

  async delete(id: string): Promise<void> {
    const storage = readStorage()
    storage.records = storage.records.filter((row) => row.id !== id)
    writeStorage(storage)
  }
}
