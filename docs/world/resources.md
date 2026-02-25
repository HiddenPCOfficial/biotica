# Resources

## Scope

Resource subsystem bridges environment and civilization economy:
- Material definitions (`MaterialCatalog`).
- Spawned world resource nodes (`ResourceNodeSystem`).
- Tool-gated harvesting and regeneration.

Primary files:
- `src/materials/MaterialCatalog.ts`
- `src/materials/MaterialCatalogGenerator.ts`
- `src/resources/ResourceNodeSystem.ts`
- `src/world/ResourceNodeSystem.ts` (re-export wrapper)

## Material Catalog

`MaterialCatalog` is immutable and seeded per world.

Generated base materials include (depending on biome profile):
- `wood`, `stone`, `clay`, `charcoal`
- optional `iron_ore`, `iron_ingot`, `sand`, `obsidian`

Key properties:
- `category`: `raw` or `processed`.
- `hardness`, `heatResistance`, `lavaResistance`, `hazardResistance`, `rarity`.
- `allowedBiomes`.

## Resource Nodes

`ResourceNodeSystem` spawns deterministic nodes:

| Node Type | Typical Material | Tool Required |
|---|---|---|
| `tree` | `wood` | `axe` |
| `stone_vein` | `stone` | `pickaxe` |
| `iron_vein` | `iron_ore` | `pickaxe` |
| `clay_patch` | `clay` | none |

Node placement uses:
- Tile class (`forest-like`, `rock-like`, `clay-like`).
- Hazard filtering.
- Seeded `hash2D` thresholds.

## Tool Gating

Harvest API:

```ts
harvestAt(x, y, toolTags, harvestPower)
```

Return reasons include:
- `no_node`
- `depleted`
- `tool_required`

This is consumed in civ agent gather actions (`CivSystem.step`).

## Regeneration

Regeneration model:
- Some nodes regenerate (`tree`, `clay_patch`), others usually finite (`stone`, `iron`).
- `step(tick, budget)` updates a bounded subset for stable runtime cost.

## Resource -> Economy Integration

`CivSystem` integration points:
- `setResourceNodeSystem()` to attach node system.
- Gather actions call `harvestAt()` and convert into faction stockpiles/inventory.

`StructureUiAdapter` reads faction materials to compute buildability in menu structures pages.

## Serialization

`ResourceNodeSystem` exports/hydrates:
- Node positions/types/amount/regeneration state.
- Counters and cursor.

Included in `TerrainScene.exportSystemsSnapshot().runtime.resourceNodeSystem`.
