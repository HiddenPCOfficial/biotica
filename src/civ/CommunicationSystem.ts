import type { SeededRng } from '../core/SeededRng'
import type {
  CommunicationState,
  CommunicationSummary,
  Concept,
  Faction,
  Lexicon,
  Utterance,
} from './types'

const CONCEPTS: Concept[] = [
  'FOOD',
  'WATER',
  'DANGER',
  'SHELTER',
  'TRADE',
  'MATE',
  'GOD',
  'LAW',
  'FIRE',
  'EARTH',
]

const SYLLABLES_A = ['ka', 'zu', 'na', 'ti', 'mu', 'ra', 'ko', 'se', 'vi', 'lo']
const SYLLABLES_B = ['ar', 'un', 'ek', 'os', 'im', 'ta', 'el', 'or', 'il', 'an']

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function mutateToken(token: string, rng: SeededRng): string {
  if (token.length <= 1) {
    return token
  }

  const mode = rng.nextInt(3)
  if (mode === 0) {
    // replace one char
    const index = rng.nextInt(token.length)
    const alphabet = 'aeioukstnrlmzvh'
    const repl = alphabet[rng.nextInt(alphabet.length)] ?? 'a'
    return `${token.slice(0, index)}${repl}${token.slice(index + 1)}`
  }

  if (mode === 1 && token.length < 7) {
    // insert char
    const index = rng.nextInt(token.length + 1)
    const alphabet = 'aeioukstnrlmzvh'
    const repl = alphabet[rng.nextInt(alphabet.length)] ?? 'a'
    return `${token.slice(0, index)}${repl}${token.slice(index)}`
  }

  // delete char
  const index = rng.nextInt(token.length)
  return `${token.slice(0, index)}${token.slice(index + 1)}` || token
}

/**
 * Comunicazione evolutiva deterministica:
 * - lessico concept->token
 * - deriva lessicale
 * - borrowing tra fazioni in contatto
 * - composizione utterance con grammar level
 */
export class CommunicationSystem {
  createInitialState(seed: number, rng: SeededRng): CommunicationState {
    const lexicon = {} as Lexicon

    for (let i = 0; i < CONCEPTS.length; i++) {
      const concept = CONCEPTS[i]
      if (!concept) continue
      const a = SYLLABLES_A[(seed + i + rng.nextInt(SYLLABLES_A.length)) % SYLLABLES_A.length] ?? 'ka'
      const b = SYLLABLES_B[(seed * 3 + i + rng.nextInt(SYLLABLES_B.length)) % SYLLABLES_B.length] ?? 'ar'
      lexicon[concept] = `${a}${b}`
    }

    return {
      lexicon,
      grammarLevel: 0,
      lastDriftTick: 0,
      lastBorrowTick: 0,
    }
  }

  stepFactionCommunication(faction: Faction, tick: number, rng: SeededRng): void {
    // crescita grammaticale lenta con popolazione + stabilita
    if (tick % 120 === 0) {
      const pop = faction.members.length
      const stability = 1 - faction.stress
      const targetLevel = pop > 90 ? 3 : pop > 45 ? 2 : pop > 18 ? 1 : 0
      if (faction.communication.grammarLevel < targetLevel && stability > 0.5 && rng.chance(0.2)) {
        faction.communication.grammarLevel += 1
      }
      if (faction.communication.grammarLevel > targetLevel && faction.stress > 0.75 && rng.chance(0.15)) {
        faction.communication.grammarLevel -= 1
      }
      faction.communication.grammarLevel = clamp(faction.communication.grammarLevel, 0, 3)
    }

    // deriva lessicale
    if (tick - faction.communication.lastDriftTick >= 260) {
      faction.communication.lastDriftTick = tick
      for (let i = 0; i < CONCEPTS.length; i++) {
        const concept = CONCEPTS[i]
        if (!concept) continue
        if (!rng.chance(0.08)) {
          continue
        }
        const oldToken = faction.communication.lexicon[concept]
        if (!oldToken) continue
        faction.communication.lexicon[concept] = mutateToken(oldToken, rng)
      }
    }
  }

  borrowTokens(
    receiver: Faction,
    donor: Faction,
    tick: number,
    rng: SeededRng,
    intensity = 0.12,
  ): number {
    if (tick - receiver.communication.lastBorrowTick < 60) {
      return 0
    }

    receiver.communication.lastBorrowTick = tick
    let borrowed = 0

    for (let i = 0; i < CONCEPTS.length; i++) {
      const concept = CONCEPTS[i]
      if (!concept) continue
      if (!rng.chance(intensity)) {
        continue
      }
      const donorToken = donor.communication.lexicon[concept]
      if (!donorToken) {
        continue
      }
      receiver.communication.lexicon[concept] = donorToken
      borrowed++
    }

    return borrowed
  }

  buildUtterance(
    faction: Faction,
    concepts: Concept[],
    rng: SeededRng,
  ): Utterance {
    const tokens: string[] = []

    for (let i = 0; i < concepts.length; i++) {
      const concept = concepts[i]
      if (!concept) continue
      const token = faction.communication.lexicon[concept]
      if (token) {
        tokens.push(token)
      }
    }

    if (tokens.length === 0) {
      tokens.push(faction.communication.lexicon.FOOD)
    }

    // grammar level influenza lunghezza/ordine
    const level = faction.communication.grammarLevel
    if (level >= 1 && rng.chance(0.4)) {
      tokens.push(faction.communication.lexicon.LAW)
    }
    if (level >= 2 && rng.chance(0.35)) {
      tokens.unshift(faction.communication.lexicon.GOD)
    }
    if (level >= 3 && rng.chance(0.25)) {
      tokens.push(faction.communication.lexicon.SHELTER)
    }

    if (level === 0 && tokens.length > 2) {
      tokens.length = 2
    } else if (level === 1 && tokens.length > 3) {
      tokens.length = 3
    }

    return {
      tokens,
      grammarLevel: level,
    }
  }

  summarize(faction: Faction): CommunicationSummary {
    return {
      grammarLevel: faction.communication.grammarLevel,
      lexicon: { ...faction.communication.lexicon },
    }
  }

  pickCoreConcepts(faction: Faction, scarcity: number, hazard: number, rng: SeededRng): Concept[] {
    const out: Concept[] = []

    out.push('FOOD')
    if (scarcity > 0.45) {
      out.push('TRADE')
    }
    if (hazard > 0.35 || faction.cultureParams.tabooHazard > 0.5) {
      out.push('DANGER')
    }
    if (faction.cultureParams.spirituality > 0.55 && rng.chance(0.65)) {
      out.push('GOD')
    }
    if (faction.cultureParams.collectivism > 0.55 && rng.chance(0.4)) {
      out.push('LAW')
    }

    return out
  }
}
