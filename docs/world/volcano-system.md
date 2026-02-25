# Volcano System

## Design Goals

Volcano runtime enforces:
- Exactly one volcano anchor per world.
- Rare deterministic eruption cycles.
- Hazard propagation affecting world arrays.
- Structural damage interaction through resistance stats.

Primary files:
- `src/world/VolcanoSystem.ts`
- `src/world/WorldState.ts`
- `src/events/events/VolcanoEruption.ts`
- `src/structures/StructureSystem.ts`

## Single Volcano Per World

Anchor is selected at world init (`pickVolcanoAnchor`):
- Prefer `isVolcanoCandidate(tile)` locations.
- Fallback to first land tile, then map center.
- Stored in `world.volcano.anchor`.

## Eruption Scheduling

`VolcanoSystem` configuration:
- `minIntervalTicks`
- `maxIntervalTicks`
- `maxLavaTiles`

On reset:
- Clears active event.
- Schedules next eruption tick deterministically.
- Syncs config into `world.volcano`.

During `step(world, tick)`:
1. If no active event and current tick reached schedule, spawn `VolcanoEruptionEvent`.
2. Apply crater hazard bias around anchor.
3. Advance eruption via `stepVolcanoEruption`.
4. When done, schedule next cycle and clear active ID.

## Hazard Propagation

Hazard effects occur through:
- Direct volcano crater pressure (`applyCraterHazard`).
- Event-induced lava/hazard updates in `stepVolcanoEruption`.
- Environmental decay/recovery in `EnvironmentUpdater`.

This means volcano impact is both immediate and lingering.

## Structure Resistances

`StructureSystem.step()` computes per-structure damage against:
- `heatResistance`
- `lavaResistance`
- `hazardResistance`

Damage sources include:
- Tile is lava.
- Hazard level above threshold.
- High temperature cells.

State transitions:
- `active` -> `damaged` -> `abandoned` based on HP ratio.

## Runtime Tuning via Gene Agent

`WorldGenesisAgent.deriveRuntimeTuning()` derives volcano parameters from best genome:
- `volcanoIntervalMinTicks`
- `volcanoIntervalMaxTicks`
- `volcanoMaxLavaTiles`

Applied in `TerrainScene.resetSimulationInternal()`.

## Serialization

Volcano persists in both:
- World runtime state (`WorldStateSerialized.volcano`).
- Optional volcano subsystem runtime state in systems snapshot.

Load path rehydrates both world fields and `VolcanoSystem` internals.
