# World Genesis

## Scope

World genesis is the startup phase where deterministic catalogs and runtime tuning are prepared.

Main flow files:
- `src/game/scenes/TerrainScene.ts` (`resetSimulationInternal`)
- `src/ai/gene/WorldGenesisAgent.ts`
- Generators:
  - `src/materials/MaterialCatalogGenerator.ts`
  - `src/items/ItemCatalogGenerator.ts`
  - `src/structures/StructureCatalogGenerator.ts`

## Genesis Pipeline

```text
Seed + terrain map
  -> create WorldState
  -> optional GeneAgent generate/apply tuning
  -> init Volcano/Event/Environment systems
  -> init Species + Creature population
  -> generate MaterialCatalog
  -> generate ItemCatalog
  -> generate StructureCatalog
  -> init ResourceNodeSystem
  -> init StructureSystem
  -> init CivSystem
  -> sync render layers and overlay snapshot
```

## Catalog Creation

### MaterialCatalog

Generated from biome profile:
- Always: wood/stone/clay/charcoal.
- Conditional: iron chain, sand, obsidian.

### ItemCatalog

Generated from materials + world profile:
- Resource items from materials.
- Tool chain and components.
- Structure parts and food items.

### StructureCatalog

Includes settlement baseline + conditional tech structures:
- Base: camp/hut/storage/wall/farm_plot/watch_tower.
- Conditional examples: kiln/forge/smelter/palisade.

Catalogs are immutable and used as source of truth at runtime.

## Runtime Tuning Knobs

Gene output influences startup by tuning:
- `treeDensityMultiplier` for resource node generation.
- Volcano frequency and max lava tiles.
- Sim tuning values (`eventRate`, plant dynamics, metabolism/reproduction scales).

## Volcano Count Rule

World creation UI enforces max volcano count `0 | 1`.

Relevant files:
- `src/ui/menu/pages/WorldCreatePage.ts` (`volcanoCount` range).
- `src/save/SaveTypes.ts` (`config.volcanoCount: 0 | 1`).

## Event Rate and World Profile

World profile stores:
- Event rate.
- Tree density.
- Simulation speed.
- Feature toggles (gene agent, civs, predators).

Profile type:
- `WorldProfile` in `src/save/SaveTypes.ts`.

## Deterministic Build Hint Integration

Structure build hints shown in menu use deterministic reason-code heuristics via:
- `src/ui/data/StructureUiAdapter.ts` (`getBuildHint`).

No LLM is involved in build hint generation.
