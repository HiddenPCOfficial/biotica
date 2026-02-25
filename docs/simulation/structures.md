# Structures

## Scope

Structure subsystem has two layers:
- Immutable definition catalog (`StructureCatalog`).
- Runtime placed instances (`StructureSystem`).

Primary files:
- `src/structures/StructureCatalog.ts`
- `src/structures/StructureCatalogGenerator.ts`
- `src/structures/StructureSystem.ts`
- UI adapter: `src/ui/data/StructureUiAdapter.ts`

## StructureCatalog (Immutable)

Catalog fields include:
- `id`, `name`, `size`.
- `requiredTechLevel`.
- `buildCost[]`.
- `utilityTags` (`shelter`, `storage`, `smelting`, `crafting`, `defense`, `farming`).
- Resistances (`heat/lava/hazard`).
- `salvageRatio`.

Properties are sanitized and frozen at creation.

## StructureInstance (Runtime)

Runtime instances store:
- World placement (`x`,`y`,`w`,`h`).
- Ownership (`factionId`).
- Lifecycle state (`building|active|damaged|abandoned`).
- HP and timestamps.

Placement APIs:
- `place(input)`
- `upsertExternal(input)`
- `dismantle(id)`

## Damage and Resistances

Each tick, `StructureSystem.step(tick)` evaluates cell hazards:
- Lava damage scaled by `lavaResistance`.
- Hazard/temperature damage scaled by respective resistances.
- Passive repair when safe.

## Construction and Removal

- Build requests are initiated from civ logic (`civ/StructureSystem`, `civ/BuildingSystem`).
- World-level instances are maintained in `structures/StructureSystem`.
- Dismantle returns materials according to salvage ratio and current HP.

## UI Buildability and Inspector

`StructureUiAdapter` computes:
- Build status: `buildable`, `locked`, `missing_materials`.
- Lock reasons (tech/literacy/material deficits).
- Derived effects:
  - storage capacity
  - rest recovery
  - smelting enable flag
  - crafting station ids
  - territory influence bonus

Used in:
- Main menu structures page (`src/ui/menu/pages/StructuresPage.ts`).
- Pause menu structures page (same component, runtime adapter source).

## Focus and Highlight

In-game actions:
- `focusStructureInstanceById(id)`
- `focusFirstStructureByDefinition(defId, clearAfterMs)`

Implemented in:
- `src/game/scenes/TerrainScene.ts`

## Save Integration

Structure data persists in:
- High-level snapshot (`systems.structures`).
- Runtime structured snapshot (`runtime.structureSystem`).
