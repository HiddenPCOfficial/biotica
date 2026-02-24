import type { SaveStorage, WorldSaveRecord } from '../SaveTypes'

const DB_NAME = 'biotica_saves'
const DB_VERSION = 1
const STORE_NAME = 'world_records'

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
}

function cloneRecord(record: WorldSaveRecord): WorldSaveRecord {
  return JSON.parse(JSON.stringify(record)) as WorldSaveRecord
}

export class IndexedDbStorage implements SaveStorage {
  private dbPromise: Promise<IDBDatabase>

  constructor() {
    if (!hasIndexedDb()) {
      throw new Error('IndexedDB not available')
    }
    this.dbPromise = this.openDb()
  }

  async list(): Promise<WorldSaveRecord[]> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const rows = (req.result as WorldSaveRecord[] | undefined) ?? []
        resolve(rows.map((row) => cloneRecord(row)))
      }
      req.onerror = () => reject(req.error ?? new Error('IndexedDB list failed'))
    })
  }

  async get(id: string): Promise<WorldSaveRecord | null> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(id)
      req.onsuccess = () => {
        resolve(req.result ? cloneRecord(req.result as WorldSaveRecord) : null)
      }
      req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'))
    })
  }

  async put(record: WorldSaveRecord): Promise<void> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(cloneRecord(record))
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error ?? new Error('IndexedDB put failed'))
    })
  }

  async delete(id: string): Promise<void> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'))
    })
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('updatedAt', 'updatedAt', { unique: false })
          store.createIndex('name', 'name', { unique: false })
          store.createIndex('seed', 'seed', { unique: false })
        }
      }

      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => {
          db.close()
        }
        resolve(db)
      }

      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    })
  }
}
