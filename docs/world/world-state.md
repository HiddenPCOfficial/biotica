# World State

## Purpose

`WorldState` is the authoritative mutable world snapshot used by simulation and rendering.

Primary sources:
- `src/world/types.ts`
- `src/world/WorldState.ts`

## What `WorldState` Contains

`WorldState` extends terrain map data with runtime arrays and helpers:

| Field | Type | Notes |
|---|---|---|
| `width`, `height`, `seed`, `tiles` | terrain map | base map data |
| `humidity`, `temperature`, `fertility`, `hazard`, `plantBiomass` | `Uint8Array` | mutable environment layers |
| `volcano` | `VolcanoState` | fixed anchor + eruption scheduling |
| `tick` | `number` | simulation tick counter |
| `chunkSize`, `chunksX`, `chunksY`, `dirtyChunks` | chunk metadata | render dirty-chunk invalidation |
| `recentEvents` | array | compact event telemetry buffer |
| `index(x,y)`, `inBounds(x,y)` | functions | world indexing helpers |

## Creation

World state is created by:
- `createWorldState(map, seed, chunkSize)` in `src/world/WorldState.ts`.

Creation steps:
1. Clone terrain tiles into mutable `Uint8Array`.
2. Derive humidity/temp/fertility using deterministic noise (`hash2D`).
3. Seed hazard and initial biomass.
4. Initialize dirty chunk flags to fully dirty.
5. Pick one volcano anchor deterministically.

## Dirty Chunk Model

Rendering performance relies on chunk dirtiness:
- Mark single tile: `markDirtyTile(state, x, y)`.
- Mark region: `markDirtyRect(...)`.
- Full invalidate: `markAllDirty(state)`.
- Consume and reset: `consumeDirtyChunks(state)`.

Used by:
- `src/render/TerrainRenderer.ts` (`renderDirty`).

## Serialization

World arrays are serialized by save pipeline using base64:
- Encode: `serializeRuntimeWorldState` in `src/save/SaveManager.ts`.
- Decode: `deserializeRuntimeWorldState` in `src/save/SaveManager.ts`.

Serialized payload type:
- `WorldStateSerialized` in `src/save/SaveTypes.ts`.

Included arrays:
- `tiles`, `humidity`, `temperature`, `fertility`, `hazard`, `plantBiomass`.
- Volcano runtime state.
- Sim tuning snapshot.

## Immutability vs Mutability

- Immutable-ish inputs:
  - `TerrainMap` generation output before world state build.
  - Volcano anchor coordinates are frozen on assignment.
- Mutable runtime fields:
  - All environment arrays.
  - `tick`.
  - `volcano.nextEruptionTick`, `volcano.activeEruptionId`.
  - `dirtyChunks` and `recentEvents`.

## Integration Notes

`WorldState` is consumed by:
- `EnvironmentUpdater`, `PlantSystem`, `VolcanoSystem`, `EventSystem`.
- `CreatureSystem`, `CivSystem`, `StructureSystem`.
- Renderers for terrain overlays and picking.

This is the main simulation state contract crossing world/sim/render boundaries.
