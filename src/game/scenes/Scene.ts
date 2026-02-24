export interface Scene {
  mount(): void
  update(deltaMs: number): void
  destroy(): void
}
