import type { SeededRng } from '../core/SeededRng'
import { ItemCatalog, type FrozenItemDefinition, type ItemCategory } from './ItemCatalog'

export type Recipe = {
  id: string
  requiredItems: string[]
  requiredTechLevel: number
  resultItemId: string
  efficiencyModifier: number
}

export type CraftingRecipeState = {
  id: string
  requiredItems: string[]
  requiredItemNames: string[]
  requiredTechLevel: number
  resultItemId: string
  resultItemName: string
  efficiencyModifier: number
  unlocked: boolean
  canCraft: boolean
  newlyUnlocked: boolean
  missingItems: string[]
}

export type CraftAttemptResult = {
  crafted: boolean
  reason?: 'no_unlocked_recipe' | 'insufficient_items'
  recipeId?: string
  resultItemId?: string
  producedAmount?: number
  efficiencyModifier?: number
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function categoryTech(category: ItemCategory): number {
  switch (category) {
    case 'resource':
      return 0
    case 'food':
      return 1
    case 'tool':
      return 1
    case 'structure_part':
      return 2
    case 'weapon':
      return 2
    case 'artifact':
      return 3
    default:
      return 1
  }
}

function hashText(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function incrementInventory(inv: Record<string, number>, itemId: string, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    return
  }
  inv[itemId] = (inv[itemId] ?? 0) + amount
}

function decrementInventory(inv: Record<string, number>, itemId: string, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    return
  }
  const next = (inv[itemId] ?? 0) - amount
  if (next <= 0) {
    delete inv[itemId]
    return
  }
  inv[itemId] = next
}

function canCraftRecipe(recipe: Recipe, inventory: Record<string, number>): boolean {
  for (let i = 0; i < recipe.requiredItems.length; i++) {
    const itemId = recipe.requiredItems[i]
    if (!itemId) continue
    if ((inventory[itemId] ?? 0) < 1) {
      return false
    }
  }
  return true
}

/**
 * Ricette dinamiche (evolutive) con vincolo forte:
 * - i resultItemId devono sempre esistere nel catalogo immutabile
 * - possono cambiare solo unlock/efficienza/combinazioni
 */
export class CraftingEvolutionSystem {
  private readonly recipes: Recipe[] = []
  private readonly unlockTicksByFaction = new Map<string, Map<string, number>>()
  private readonly naturalPool: FrozenItemDefinition[]
  private readonly craftTargets: FrozenItemDefinition[]

  constructor(
    private readonly catalog: ItemCatalog,
    private readonly seed: number,
  ) {
    this.seed = seed | 0
    this.naturalPool = this.catalog.items.filter((item) => item.naturalSpawn)
    this.craftTargets = this.catalog.items.filter((item) => !item.naturalSpawn)
    this.buildBaseRecipes()
  }

  getRecipes(): ReadonlyArray<Recipe> {
    return this.recipes.map((recipe) => ({ ...recipe, requiredItems: [...recipe.requiredItems] }))
  }

  stepFaction(factionId: string, techLevel: number, rng: SeededRng, tick: number): void {
    const unlockMap = this.getUnlockMap(factionId)
    for (let i = 0; i < this.recipes.length; i++) {
      const recipe = this.recipes[i]
      if (!recipe) continue
      if (techLevel >= recipe.requiredTechLevel && !unlockMap.has(recipe.id)) {
        unlockMap.set(recipe.id, tick)
      }
    }

    if (tick % 120 !== 0) {
      return
    }

    const unlocked = this.recipes.filter((recipe) => techLevel >= recipe.requiredTechLevel)
    if (unlocked.length === 0) {
      return
    }

    const recipe = unlocked[rng.nextInt(unlocked.length)]
    if (!recipe) {
      return
    }

    recipe.efficiencyModifier = clamp(
      recipe.efficiencyModifier + 0.006 + clamp(techLevel, 0, 12) * 0.0012,
      0.6,
      2.8,
    )

    if (techLevel >= recipe.requiredTechLevel + 1 && rng.chance(0.08 + Math.min(0.1, techLevel * 0.01))) {
      this.mutateRecipeInputs(recipe, rng)
    }
  }

  attemptCraft(
    factionId: string,
    techLevel: number,
    inventory: Record<string, number>,
    rng: SeededRng,
    tick: number,
  ): CraftAttemptResult {
    const unlockMap = this.getUnlockMap(factionId)

    const unlockedCraftable: Recipe[] = []
    const unlockedButMissing: Recipe[] = []

    for (let i = 0; i < this.recipes.length; i++) {
      const recipe = this.recipes[i]
      if (!recipe) continue
      if (techLevel < recipe.requiredTechLevel) {
        continue
      }
      if (!unlockMap.has(recipe.id)) {
        unlockMap.set(recipe.id, tick)
      }

      if (canCraftRecipe(recipe, inventory)) {
        unlockedCraftable.push(recipe)
      } else {
        unlockedButMissing.push(recipe)
      }
    }

    if (unlockedCraftable.length === 0) {
      if (unlockedButMissing.length > 0) {
        return { crafted: false, reason: 'insufficient_items' }
      }
      return { crafted: false, reason: 'no_unlocked_recipe' }
    }

    unlockedCraftable.sort((a, b) => b.efficiencyModifier - a.efficiencyModifier)
    const candidateSpan = Math.max(1, Math.min(3, unlockedCraftable.length))
    const recipe = unlockedCraftable[rng.nextInt(candidateSpan)] ?? unlockedCraftable[0]
    if (!recipe) {
      return { crafted: false, reason: 'no_unlocked_recipe' }
    }

    for (let i = 0; i < recipe.requiredItems.length; i++) {
      const itemId = recipe.requiredItems[i]
      if (!itemId) continue
      decrementInventory(inventory, itemId, 1)
    }

    const amount = 1 + (recipe.efficiencyModifier > 1.55 && rng.chance(clamp((recipe.efficiencyModifier - 1.3) * 0.45, 0, 0.6)) ? 1 : 0)
    incrementInventory(inventory, recipe.resultItemId, amount)
    recipe.efficiencyModifier = clamp(recipe.efficiencyModifier + 0.003, 0.6, 2.8)

    return {
      crafted: true,
      recipeId: recipe.id,
      resultItemId: recipe.resultItemId,
      producedAmount: amount,
      efficiencyModifier: recipe.efficiencyModifier,
    }
  }

  getRecipeStates(
    factionId: string,
    techLevel: number,
    inventory: Record<string, number>,
    tick: number,
  ): CraftingRecipeState[] {
    const unlockMap = this.getUnlockMap(factionId)
    const rows: CraftingRecipeState[] = []

    for (let i = 0; i < this.recipes.length; i++) {
      const recipe = this.recipes[i]
      if (!recipe) continue

      const unlocked = techLevel >= recipe.requiredTechLevel
      if (unlocked && !unlockMap.has(recipe.id)) {
        unlockMap.set(recipe.id, tick)
      }
      const unlockTick = unlockMap.get(recipe.id) ?? -1

      const requiredItemNames = recipe.requiredItems.map((itemId) => this.catalog.getById(itemId)?.name ?? itemId)
      const missingItems = recipe.requiredItems.filter((itemId) => (inventory[itemId] ?? 0) < 1)

      rows.push({
        id: recipe.id,
        requiredItems: [...recipe.requiredItems],
        requiredItemNames,
        requiredTechLevel: recipe.requiredTechLevel,
        resultItemId: recipe.resultItemId,
        resultItemName: this.catalog.getById(recipe.resultItemId)?.name ?? recipe.resultItemId,
        efficiencyModifier: recipe.efficiencyModifier,
        unlocked,
        canCraft: unlocked && missingItems.length === 0,
        newlyUnlocked: unlocked && unlockTick > 0 && tick - unlockTick <= 300,
        missingItems,
      })
    }

    rows.sort((a, b) => {
      if (a.unlocked !== b.unlocked) {
        return a.unlocked ? -1 : 1
      }
      if (a.canCraft !== b.canCraft) {
        return a.canCraft ? -1 : 1
      }
      if (a.requiredTechLevel !== b.requiredTechLevel) {
        return a.requiredTechLevel - b.requiredTechLevel
      }
      return a.resultItemName.localeCompare(b.resultItemName)
    })
    return rows
  }

  private buildBaseRecipes(): void {
    const resources = this.naturalPool.length > 0
      ? this.naturalPool
      : this.catalog.items.filter((item) => item.category === 'resource' || item.category === 'food')

    const targets = this.craftTargets.length > 0
      ? this.craftTargets
      : this.catalog.items.filter((item) => item.category !== 'resource')

    const seenResult = new Set<string>()
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      if (!target) continue
      if (seenResult.has(target.id)) continue
      seenResult.add(target.id)

      const requiredCount = 2 + (((hashText(`${this.seed}:${target.id}`) >>> 1) % 2) | 0)
      const requiredItems: string[] = []
      for (let k = 0; k < requiredCount; k++) {
        if (resources.length === 0) break
        const idx = (hashText(`${target.id}:${k}:${this.seed}`) + k * 17) % resources.length
        const candidate = resources[idx]
        if (!candidate) continue
        if (candidate.id === target.id) continue
        if (!requiredItems.includes(candidate.id)) {
          requiredItems.push(candidate.id)
        }
      }

      if (requiredItems.length === 0) {
        continue
      }

      const recipe: Recipe = {
        id: `rc-${normalizeId(target.id)}`,
        requiredItems,
        requiredTechLevel: categoryTech(target.category) + ((hashText(target.id) >>> 2) % 2),
        resultItemId: target.id,
        efficiencyModifier: clamp(0.86 + ((hashText(`${target.id}:${this.seed}`) % 30) / 100), 0.7, 1.2),
      }
      this.recipes.push(recipe)
    }

    this.recipes.sort((a, b) => a.id.localeCompare(b.id))
  }

  private mutateRecipeInputs(recipe: Recipe, rng: SeededRng): void {
    if (recipe.requiredItems.length === 0) {
      return
    }
    if (this.naturalPool.length === 0) {
      return
    }

    const slot = rng.nextInt(recipe.requiredItems.length)
    const candidate = this.naturalPool[rng.nextInt(this.naturalPool.length)]
    if (!candidate) {
      return
    }
    if (!this.catalog.has(candidate.id)) {
      return
    }
    if (candidate.id === recipe.resultItemId) {
      return
    }

    recipe.requiredItems[slot] = candidate.id
    recipe.requiredItems = Array.from(new Set(recipe.requiredItems))
    if (recipe.requiredItems.length === 0) {
      recipe.requiredItems.push(candidate.id)
    }
  }

  private getUnlockMap(factionId: string): Map<string, number> {
    const key = factionId || 'faction-default'
    const existing = this.unlockTicksByFaction.get(key)
    if (existing) {
      return existing
    }
    const created = new Map<string, number>()
    this.unlockTicksByFaction.set(key, created)
    return created
  }
}
