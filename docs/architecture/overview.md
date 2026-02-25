# Architecture Overview

## Macro Systems

Biotica runtime is organized around these macro modules:

| Module | Responsibility | Primary Files |
|---|---|---|
| `core` | Bootstrapping, renderer init, scene state machine, main loop | `src/game/Game.ts`, `src/core/GameStateMachine.ts`, `src/game/core/mainLoop.ts`, `src/game/core/renderer.ts` |
| `scenes` | High-level app flow (boot/menu/loading/world) | `src/scenes/*.ts` |
| `world` | Environmental state and ecological/world hazards | `src/world/WorldState.ts`, `src/world/EnvironmentUpdater.ts`, `src/world/PlantSystem.ts`, `src/world/VolcanoSystem.ts` |
| `sim` | Creature/species logic and sim-facing wrappers | `src/sim/CreatureSystem.ts`, `src/sim/SpeciesRegistry.ts`, `src/sim/Phylogeny.ts` |
| `civ` | Civilization, diplomacy, territory, identity, writing | `src/civ/CivSystem.ts` + subsystem files in `src/civ/*` |
| `render` | PixiJS terrain/creature/structure rendering, LOD, picking | `src/render/*` |
| `ui` | DOM menu + overlay + inspectors + adapters | `src/ui/menu/*`, `src/ui/overlay/*`, `src/ui/data/StructureUiAdapter.ts`, `src/ui/CreatureInspector.ts` |
| `ai` | LLM services and deterministic gene tuning agent | `src/ai/llm/*`, `src/ai/gene/*`, `src/ai/core/*` |
| `save` | Persistence, schema versioning, storage backend | `src/save/*` |
| `shared` | Cross-module constants/math/rng/events/helpers | `src/shared/*` |

## Runtime Separation of Responsibilities

```text
Simulation write path
  world/* + sim/* + civ/* + events/* + resources/* + structures/* + items/*

Read-only view models
  ui/overlay/UISnapshotBuilder.ts
  ui/data/StructureUiAdapter.ts

Rendering read path
  render/* reads WorldState / system queries and draws Pixi layers

Menu/UI command path
  ui/menu/* and ui/overlay/* emit actions
  scenes/TerrainScene.ts handles commands and mutates systems
```

## Architectural Principles

### 1. Determinism

Determinism is implemented through seeded RNG and fixed-step simulation:
- RNG: `src/shared/rng.ts`, `src/core/SeededRng.ts`, `src/ai/gene/SeededRng.ts`.
- Tick stepping: `src/game/scenes/TerrainScene.ts` (`FIXED_STEP_MS`, accumulator loop).

### 2. Immutable Catalogs

Catalogs are generated once per world and frozen:
- Materials: `src/materials/MaterialCatalog.ts`.
- Items: `src/items/ItemCatalog.ts`.
- Structures: `src/structures/StructureCatalog.ts`.

### 3. LLM Scope Is Text-Only

LLM is intentionally excluded from simulation tick mutation:
- Chat: `src/ai/llm/services/AiChatService.ts`.
- Descriptions: `src/ai/llm/services/CreatureDescriptionService.ts`.
- Runtime sim tuning/worldgen uses deterministic NSGA-II (`src/ai/gene/*`), not LLM.

## Current Transitional Architecture Notes

Biotica is in a modularization phase:
- Logical modules `sim/world/render/ui/ai/save/shared` are active.
- Some legacy namespaces remain as wrappers/adapters (`src/civ/*`, `src/game/*`, `src/resources/*`, `src/structures/*`, `src/items/*`).
- `src/game/scenes/TerrainScene.ts` is currently a large orchestrator owning cross-system wiring.

This documentation follows the target modular architecture while explicitly mapping to current file locations.
