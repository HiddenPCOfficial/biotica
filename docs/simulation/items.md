# Items

## Scope

Item subsystem models immutable item definitions and faction/item inventories.

Primary files:
- `src/items/ItemCatalog.ts`
- `src/items/ItemCatalogGenerator.ts`
- `src/civ/CivSystem.ts` (inventory/equipment use)

## ItemCatalog (Immutable)

Item categories:
- `resource`, `tool`, `weapon`, `food`, `component`, `structure_part`, `artifact`.

Definition highlights:
- `baseProperties` (nutrition/durability/damage/buildValue/storage/weight).
- `toolTags` (`axe`, `pickaxe`, `hammer`, `shovel`, `knife`, `sickle`).
- `requiredTechLevel`.
- `madeOfMaterials`.
- `naturalSpawn` and `allowedBiomes`.

Catalog is frozen after sanitization.

## Generation

`ItemCatalogGenerator` builds deterministic item sets from world+materials:
- Converts materials to resource items.
- Adds base toolchain (stone tools, optional iron tools).
- Adds components/structure parts.
- Adds food entries tuned by fertility/humidity profile.

## Item Usage in Civilization

`CivSystem` uses items for:
- Faction inventory and ground stacks.
- Agent carried items and equipment slots.
- Tool-tag extraction for harvesting capability.
- Decision reward features tied to item state.

## Durability and Efficiency

Item definitions include durability/efficiency metadata used by:
- Crafting output quality.
- Agent action effectiveness proxies.
- Tool gating support.

## Save/Restore

Item and crafting data are persisted under:
- `systems.items` snapshot.
- `runtime.craftingSystem` in systems runtime payload.
