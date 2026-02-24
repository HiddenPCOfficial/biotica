import type { AgentIntent } from './types'

type CooldownState = Partial<Record<AgentIntent, number>>

const BASE_COOLDOWN_TICKS: Record<AgentIntent, number> = {
  explore: 18,
  gather: 14,
  hunt: 20,
  build: 48,
  fortify: 62,
  migrate: 120,
  farm: 34,
  trade: 30,
  defend: 38,
  invent: 44,
  write: 54,
  negotiate: 34,
  expand_territory: 80,
  domesticate_species: 72,
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Evita loop monotoni sugli intenti:
 * - assegna cooldown per intent
 * - restituisce penalita da applicare allo score
 */
export class CooldownIntentManager {
  private readonly stateByAgent = new Map<string, CooldownState>()

  getPenalty(agentId: string, intent: AgentIntent, tick: number): number {
    const state = this.stateByAgent.get(agentId)
    if (!state) {
      return 0
    }
    const until = state[intent] ?? 0
    if (tick >= until) {
      return 0
    }
    const total = BASE_COOLDOWN_TICKS[intent] ?? 24
    const remaining = clamp(until - tick, 0, total)
    if (remaining <= 0 || total <= 0) {
      return 0
    }
    return clamp(remaining / total, 0, 1)
  }

  markUsed(agentId: string, intent: AgentIntent, tick: number, intensity = 1): void {
    const state = this.stateByAgent.get(agentId) ?? {}
    const base = BASE_COOLDOWN_TICKS[intent] ?? 20
    const duration = Math.max(3, Math.floor(base * clamp(intensity, 0.35, 2.5)))
    state[intent] = tick + duration
    this.stateByAgent.set(agentId, state)
  }

  clear(agentId: string): void {
    this.stateByAgent.delete(agentId)
  }

  clearAll(): void {
    this.stateByAgent.clear()
  }

  exportState(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {}
    for (const [agentId, state] of this.stateByAgent.entries()) {
      const row: Record<string, number> = {}
      const entries = Object.entries(state)
      for (let i = 0; i < entries.length; i++) {
        const [intent, tick] = entries[i] ?? []
        if (!intent || typeof tick !== 'number' || !Number.isFinite(tick)) continue
        row[intent] = tick
      }
      out[agentId] = row
    }
    return out
  }

  hydrateState(input: Record<string, Record<string, number>> | null | undefined): void {
    this.stateByAgent.clear()
    if (!input) {
      return
    }
    const entries = Object.entries(input)
    for (let i = 0; i < entries.length; i++) {
      const [agentId, row] = entries[i] ?? []
      if (!agentId || !row) continue
      const state: CooldownState = {}
      const cooldowns = Object.entries(row)
      for (let j = 0; j < cooldowns.length; j++) {
        const [intent, tick] = cooldowns[j] ?? []
        if (!intent || typeof tick !== 'number' || !Number.isFinite(tick)) continue
        ;(state as Record<string, number>)[intent] = tick
      }
      this.stateByAgent.set(agentId, state)
    }
  }
}
