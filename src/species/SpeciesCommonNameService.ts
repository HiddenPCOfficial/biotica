import { SeededRng } from '../core/SeededRng'

export type SpeciesHabitatHint =
  | 'river'
  | 'marsh'
  | 'forest'
  | 'grassland'
  | 'desert'
  | 'mountain'
  | 'coast'

export type SpeciesDietKind = 'herbivore' | 'predator' | 'omnivore'
export type SpeciesSizeClass = 'small' | 'medium' | 'large'

export type SpeciesCommonNameInput = {
  speciesId: string
  seed?: number
  habitatHint: SpeciesHabitatHint | string
  dietType: SpeciesDietKind
  sizeClass: SpeciesSizeClass
  keyTraits: readonly string[]
  usedNames?: ReadonlySet<string> | readonly string[]
}

const DESCRIPTORS = [
  'Grayleaf',
  'Redcrest',
  'Pale',
  'Dappled',
  'Spotted',
  'Shadow',
  'Bright',
  'Mossy',
  'Rust',
  'Silver',
  'Slate',
  'Golden',
  'Dusky',
  'Amber',
  'Frost',
  'Ashen',
] as const

const HABITAT_WORDS: Record<SpeciesHabitatHint, readonly string[]> = {
  river: ['River', 'Brook', 'Reed', 'Ford'],
  marsh: ['Marsh', 'Fen', 'Bog', 'Mire'],
  forest: ['Forest', 'Pine', 'Grove', 'Thorn'],
  grassland: ['Meadow', 'Vale', 'Field', 'Prairie'],
  desert: ['Dune', 'Dust', 'Canyon', 'Sun'],
  mountain: ['Ridge', 'Stone', 'Crag', 'Highland'],
  coast: ['Coast', 'Salt', 'Tide', 'Cliff'],
}

const BODY_WORDS = [
  'Stoneback',
  'Longtail',
  'Swiftfoot',
  'Broadwing',
  'Needlebeak',
  'Thickhide',
  'Softfur',
  'Sharpclaw',
] as const

const TRAIT_WORDS: Record<string, readonly string[]> = {
  fast: ['Swiftfoot', 'Fleet', 'Quick'],
  nocturnal: ['Shadow', 'Dusky', 'Night'],
  burrower: ['Hollow', 'Burrow', 'Deepden'],
  flocking: ['Cloud', 'Dappled', 'Silver'],
  territorial: ['Thorn', 'Stoneback', 'Iron'],
  'cold-hardy': ['Frost', 'Slate', 'Ashen'],
  'heat-tolerant': ['Amber', 'Rust', 'Suncrest'],
}

const ANIMAL_NOUNS: Record<SpeciesDietKind, Record<SpeciesSizeClass, readonly string[]>> = {
  herbivore: {
    small: ['Finch', 'Dove', 'Hare', 'Moth'],
    medium: ['Deer', 'Hare', 'Grazer', 'Tortoise'],
    large: ['Antelope', 'Deer', 'Grazer', 'Tortoise'],
  },
  predator: {
    small: ['Viper', 'Owl', 'Hawk', 'Lizard'],
    medium: ['Fox', 'Hawk', 'Lynx', 'Stalker'],
    large: ['Lynx', 'Hawk', 'Stalker', 'Viper'],
  },
  omnivore: {
    small: ['Crow', 'Gull', 'Raccoon', 'Lizard'],
    medium: ['Boar', 'Crow', 'Raccoon', 'Badger'],
    large: ['Boar', 'Badger', 'Raccoon', 'Gull'],
  },
}

const HABITAT_ALLOWED_ANIMALS: Record<SpeciesHabitatHint, ReadonlySet<string>> = {
  river: new Set(['Finch', 'Dove', 'Pike', 'Gull', 'Crow', 'Hare', 'Fox', 'Badger', 'Deer', 'Boar', 'Raccoon', 'Viper', 'Tortoise', 'Moth', 'Lizard']),
  marsh: new Set(['Hare', 'Finch', 'Dove', 'Pike', 'Gull', 'Crow', 'Viper', 'Boar', 'Badger', 'Raccoon', 'Tortoise', 'Lizard', 'Moth']),
  forest: new Set(['Deer', 'Hare', 'Finch', 'Dove', 'Fox', 'Hawk', 'Lynx', 'Owl', 'Viper', 'Boar', 'Crow', 'Raccoon', 'Badger', 'Moth', 'Lizard']),
  grassland: new Set(['Deer', 'Hare', 'Finch', 'Dove', 'Antelope', 'Grazer', 'Fox', 'Hawk', 'Owl', 'Boar', 'Crow', 'Badger', 'Stalker', 'Moth']),
  desert: new Set(['Hare', 'Antelope', 'Tortoise', 'Viper', 'Fox', 'Hawk', 'Lynx', 'Boar', 'Badger', 'Stalker', 'Lizard', 'Moth', 'Grazer']),
  mountain: new Set(['Deer', 'Hare', 'Fox', 'Hawk', 'Lynx', 'Owl', 'Boar', 'Badger', 'Stalker', 'Crow', 'Viper', 'Antelope']),
  coast: new Set(['Gull', 'Crow', 'Pike', 'Dove', 'Fox', 'Boar', 'Raccoon', 'Badger', 'Tortoise', 'Finch', 'Hawk']),
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function normalizeHabitatHint(value: string): SpeciesHabitatHint {
  const v = value.trim().toLowerCase()
  if (v.includes('river') || v.includes('stream') || v.includes('brook')) return 'river'
  if (v.includes('marsh') || v.includes('swamp') || v.includes('bog') || v.includes('fen')) return 'marsh'
  if (v.includes('forest') || v.includes('jungle') || v.includes('grove') || v.includes('pine')) return 'forest'
  if (v.includes('desert') || v.includes('dune') || v.includes('canyon')) return 'desert'
  if (v.includes('mount') || v.includes('ridge') || v.includes('rock') || v.includes('snow') || v.includes('hill')) return 'mountain'
  if (v.includes('coast') || v.includes('beach') || v.includes('shore') || v.includes('sea') || v.includes('ocean')) return 'coast'
  return 'grassland'
}

function asUsedNameSet(value?: ReadonlySet<string> | readonly string[]): Set<string> {
  if (!value) {
    return new Set<string>()
  }
  if (value instanceof Set) {
    return new Set<string>(value)
  }
  return new Set<string>(value)
}

function normalizeTrait(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

function pickDeterministic<T>(items: readonly T[], rng: SeededRng): T | undefined {
  if (items.length === 0) return undefined
  return items[rng.nextInt(items.length)]
}

function deterministicOrder<T>(items: readonly T[], rng: SeededRng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1)
    const tmp = out[i]
    out[i] = out[j]!
    out[j] = tmp!
  }
  return out
}

function pushUnique(target: string[], values: readonly string[]): void {
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (!value) continue
    if (!target.includes(value)) {
      target.push(value)
    }
  }
}

function buildTraitWordPool(
  traits: readonly string[],
  dietType: SpeciesDietKind,
  sizeClass: SpeciesSizeClass,
): string[] {
  const out: string[] = []
  for (let i = 0; i < traits.length; i++) {
    const key = normalizeTrait(traits[i] ?? '')
    const mapped = TRAIT_WORDS[key]
    if (mapped) {
      pushUnique(out, mapped)
    }
  }

  if (dietType === 'predator') {
    pushUnique(out, ['Sharpclaw', 'Shadow'])
  } else if (dietType === 'herbivore') {
    pushUnique(out, ['Softfur', 'Dappled'])
  } else {
    pushUnique(out, ['Thickhide', 'Slate'])
  }

  if (sizeClass === 'small') {
    pushUnique(out, ['Swiftfoot', 'Longtail', 'Needlebeak'])
  } else if (sizeClass === 'large') {
    pushUnique(out, ['Stoneback', 'Broadwing', 'Thickhide'])
  }

  return out
}

function buildAnimalPool(
  habitatHint: SpeciesHabitatHint,
  dietType: SpeciesDietKind,
  sizeClass: SpeciesSizeClass,
  rng: SeededRng,
): string[] {
  const perSize = ANIMAL_NOUNS[dietType][sizeClass]
  const fallbackMedium = ANIMAL_NOUNS[dietType].medium
  const fallbackGeneral = ANIMAL_NOUNS.omnivore.medium
  const raw: string[] = []
  pushUnique(raw, perSize)
  pushUnique(raw, fallbackMedium)
  pushUnique(raw, fallbackGeneral)

  const allowed = HABITAT_ALLOWED_ANIMALS[habitatHint]
  const filtered = raw.filter((noun) => allowed.has(noun))
  const effective = filtered.length > 0 ? filtered : raw
  return deterministicOrder(effective, rng)
}

function isValidName(name: string): boolean {
  const parts = name.trim().split(/\s+/g)
  if (parts.length < 2 || parts.length > 3) {
    return false
  }

  const seen = new Set<string>()
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part || part.length > 24) {
      return false
    }
    if (!/^[A-Za-z][A-Za-z-]*$/.test(part)) {
      return false
    }
    const lower = part.toLowerCase()
    if (seen.has(lower)) {
      return false
    }
    seen.add(lower)
  }

  return true
}

/**
 * Generatore locale di nomi comuni realistici (deterministico).
 * Esempi target: "Grayleaf Deer", "River Finch", "Stoneback Boar".
 */
export class SpeciesCommonNameService {
  generateCommonName(input: SpeciesCommonNameInput): string {
    const habitatHint = normalizeHabitatHint(input.habitatHint)
    const usedNames = asUsedNameSet(input.usedNames)
    const seedInput = `${input.speciesId}|${habitatHint}|${input.dietType}|${input.sizeClass}|${input.keyTraits.join(',')}`
    const seed = (hashString(seedInput) ^ ((input.seed ?? 0) >>> 0) ^ 0x9e3779b9) >>> 0
    const rng = new SeededRng(seed)

    const traitWords = deterministicOrder(
      buildTraitWordPool(input.keyTraits, input.dietType, input.sizeClass),
      rng,
    )
    const habitatWords = deterministicOrder(HABITAT_WORDS[habitatHint], rng)
    const descriptorWords = deterministicOrder(DESCRIPTORS, rng)
    const bodyWords = deterministicOrder(BODY_WORDS, rng)

    const prefixes: string[] = []
    pushUnique(prefixes, traitWords)
    pushUnique(prefixes, habitatWords)
    pushUnique(prefixes, descriptorWords)
    pushUnique(prefixes, bodyWords)
    if (prefixes.length === 0) {
      prefixes.push('Grayleaf')
    }

    const animalPool = buildAnimalPool(habitatHint, input.dietType, input.sizeClass, rng)
    const animals = animalPool.length > 0 ? animalPool : ['Grazer']

    for (let ai = 0; ai < animals.length; ai++) {
      const animal = animals[ai]!
      for (let pi = 0; pi < prefixes.length; pi++) {
        const prefix = prefixes[(pi + ai) % prefixes.length]!
        const candidate = `${prefix} ${animal}`
        if (!usedNames.has(candidate) && isValidName(candidate)) {
          return candidate
        }
      }
    }

    for (let ai = 0; ai < animals.length; ai++) {
      const animal = animals[ai]!
      for (let pi = 0; pi < prefixes.length; pi++) {
        const p1 = prefixes[(pi + ai) % prefixes.length]!
        const p2 = prefixes[(pi + ai + 3) % prefixes.length]!
        if (p1.toLowerCase() === p2.toLowerCase()) {
          continue
        }
        const candidate = `${p1} ${p2} ${animal}`
        if (!usedNames.has(candidate) && isValidName(candidate)) {
          return candidate
        }
      }
    }

    const fallbackPrefix = pickDeterministic(prefixes, rng) ?? 'Grayleaf'
    const fallbackAnimal = pickDeterministic(animals, rng) ?? 'Grazer'
    const base = `${fallbackPrefix} ${fallbackAnimal}`
    if (!usedNames.has(base) && isValidName(base)) {
      return base
    }

    for (let i = 0; i < prefixes.length * 2; i++) {
      const extra = prefixes[i % prefixes.length]!
      const candidate = `${fallbackPrefix} ${extra} ${fallbackAnimal}`
      if (!usedNames.has(candidate) && isValidName(candidate)) {
        return candidate
      }
    }

    return 'Grayleaf Grazer'
  }
}

