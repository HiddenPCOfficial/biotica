# Folder Structure

## Canonical Structure

Biotica is documented against this canonical modular layout:

```text
src/
  core/
  scenes/
  world/
  sim/
  render/
  ui/
  ai/
  save/
  shared/
```

## What Each Folder Contains

### `core/`
- Contains: game bootstrap contracts, loop orchestration, renderer boot, scene machine.
- Must not contain: domain simulation rules, UI HTML, AI prompt logic.
- Current mapping:
  - `src/core/Game.ts` -> re-export of `src/game/Game.ts`
  - `src/core/MainLoop.ts`, `src/core/Renderer.ts`, `src/core/Camera2D.ts` -> wrappers to `src/game/*`

### `scenes/`
- Contains: app-level state transitions (boot/menu/loading/world).
- Must not contain: low-level rendering details or item/civ algorithms.
- Current mapping: `src/scenes/*.ts`.

### `world/`
- Contains: world state arrays, biomes, environment/plant/volcano/era/resource world-level systems.
- Must not contain: Pixi drawing, DOM manipulation.
- Current mapping: `src/world/*`.

### `sim/`
- Contains: simulation systems and shared sim types.
- Must not contain: Pixi imports.
- Current mapping:
  - `src/sim/CreatureSystem.ts`, `src/sim/SpeciesRegistry.ts`, `src/sim/Phylogeny.ts`
  - wrappers for civ/items/structures still point to legacy modules.

### `render/`
- Contains: Pixi-only drawing logic, layers, LOD, picking helpers.
- Must not contain: authoritative state mutation.
- Current mapping: `src/render/*`.

### `ui/`
- Contains: menu, overlay pages, adapters, inspector components.
- Must not contain: direct mutation of core simulation arrays.
- Current mapping: `src/ui/menu/*`, `src/ui/overlay/*`, `src/ui/data/*`, `src/ui/selection/*`.

### `ai/`
- Contains:
  - `llm/`: read-only text services.
  - `gene/`: deterministic world tuning.
  - `core/`: config/cache/rate-limit/model resolution.
- Must not contain: per-tick world mutation loops in LLM path.

### `save/`
- Contains: save schema, manager, storage adapters.
- Must not contain: rendering or gameplay action handlers.

### `shared/`
- Contains: constants, math, RNG, global events, generic helper types.
- Must not contain: feature-specific business rules.

## What Each Folder Must Not Contain

| Folder | Must NOT Contain |
|---|---|
| `sim/` | Pixi/DOM imports |
| `render/` | world mutation logic |
| `ui/` | direct system state mutation |
| `ai/llm/` | deterministic tick critical logic |
| `shared/` | duplicate domain-specific constants |

## Allowed Dependency Directions

```text
shared -> (used by all)

core -> scenes -> (world, sim, civ, render, ui, ai, save)

world -> shared
sim -> world + shared
civ -> world + sim(types) + items + resources + shared
render -> world/sim/structures + shared
ui -> snapshot/adapters/types + shared
ai/llm -> ui snapshot + tool router read APIs + shared
ai/gene -> deterministic headless sim + schemas + shared
save -> scene/system snapshots + shared
```

### Disallowed Patterns

- `render -> mutate world/sim`
- `ui -> mutate world arrays directly`
- `sim -> import Pixi or DOM`
- Circular imports across `world`, `sim`, `render`, `ui`.

## Real-World Mapping Notes

Some files are still transitional aliases:
- `src/sim/CivSystem.ts` exports from `src/civ/CivSystem.ts`.
- `src/world/ResourceNodeSystem.ts` exports from `src/resources/ResourceNodeSystem.ts`.
- `src/core/*` includes wrappers to `src/game/*` implementations.

When extending systems, prefer placing new code in canonical folders and keep wrappers thin.
