# Crafting System

## Scope

Crafting is modeled by an evolving deterministic recipe system.

Primary files:
- `src/items/CraftingEvolutionSystem.ts`
- `src/items/ItemCatalog.ts`
- `src/civ/CivSystem.ts`

## Core Model

`CraftingEvolutionSystem` maintains:
- Recipe list (`Recipe[]`).
- Per-faction unlock ticks.
- Efficiency modifiers that evolve over time.

Recipe fields:
- `id`
- `requiredItems[]`
- `requiredTechLevel`
- `resultItemId`
- `efficiencyModifier`

## Base Recipe Initialization

At startup:
- Recipes are synthesized from immutable item catalog.
- Result item must exist in catalog (hard validation rule).
- Inputs are selected from natural/resource pools deterministically.

## Evolution Mechanics

`stepFaction(...)` can:
- Unlock recipes when tech threshold is reached.
- Increase efficiency over time.
- Mutate recipe inputs probabilistically (bounded, deterministic RNG).

## Crafting Attempts

`attemptCraft(...)`:
1. Filter by unlocked + tech level.
2. Check inventory sufficiency.
3. Consume input items.
4. Produce output item quantity (efficiency-dependent).

Failure reasons:
- `no_unlocked_recipe`
- `insufficient_items`

## Dependency on Structures (Forge/Kiln)

Current implementation status:
- Hard recipe gating is currently based on tech + inventory.
- Structure dependency is represented in structure definitions and UI effects:
  - `kiln`, `forge`, `smelter` utility tags (`smelting`, `crafting`).
  - `StructureUiAdapter` shows "enables smelting" and station unlock metadata.

Planned extension path:
- Add optional `requiredStructures[]` to recipe state.
- Resolve against faction/world structure instances before craft attempt.

## Save/Restore

Crafting exports:
- Recipes (with evolved efficiency and input mutations).
- Per-faction unlock maps.

Hydrated via `hydrateState(...)` in load path.
