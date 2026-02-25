# Creature System

## Role

`CreatureSystem` simulates individual organisms on the world grid.

Primary files:
- `src/sim/CreatureSystem.ts`
- `src/sim/types.ts`
- `src/sim/genetics/Genome.ts`

## Entity Model

Core `Creature` fields include:
- Identity: `id`, `speciesId`, `name`, `generation`, optional `parentIds`.
- Position: `x`, `y` (tile coordinates).
- Vital state: `energy`, `health`, `hydration`, `waterNeed`, `age`, `maxAge`.
- Stress indicators: `tempStress`, `humidityStress`.
- Genome traits: metabolism, movement cost, tolerances, diet, efficiency.

## Update Pipeline

`step(world, rng, dtTicks, tick, hooks)` performs:
1. Corpse decomposition pass (fertility/biomass enrichment).
2. Spatial index rebuild.
3. Per-creature move, resource intake, hydration/energy/health updates.
4. Reproduction and mutation handling.
5. Death filtering and corpse deposit.
6. Species population sync and cognition updates.

Result type:
- `CreatureStepResult { changed, births, deaths, speciations }`.

## Movement

Movement is local search over nearby cells:
- Candidate score uses fertility/hazard/water/lethality/species biome allowance.
- Radius depends on perception-related traits.
- Chosen tile maximizes deterministic score with seeded noise.

## Actions and Survival Mechanics

Implemented survival mechanics:
- Plant biomass consumption for herbivore/omnivore diets.
- Hydration gain/loss from tile humidity and water adjacency.
- Heat/humidity stress penalty.
- Hazard/lava penalties.
- Age and resource deficits affecting health.

Predator diet branch exists but is currently intentionally conservative (not fully active in main loop pressure).

## Intent -> Plan -> Action (Cross-System Context)

For creature-level fauna:
- Behavior is currently heuristic/genome-driven in `CreatureSystem`.

For civilization individuals:
- Intent/plan/action pipeline lives in civ stack:
  - `src/civ/IntentionSystem.ts`
  - `src/civ/PlanSystem.ts`
  - `src/civ/CivSystem.ts`

## Serialization

`CreatureSystem` supports:
- `exportState()`
- `hydrateState(state)`

Persisted data includes:
- Creatures list + genome data.
- Tuning values.
- Species cognition map.
- Corpse buffers.
- Embedded species registry state.

## Key Integration Points

- World data input: `WorldState` arrays.
- Species lifecycle: `SpeciesRegistry`.
- Rendering: `render/CreatureRenderer.ts`.
- Overlay: species and population stats via `UISnapshotBuilder`.
