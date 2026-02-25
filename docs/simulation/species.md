# Species Registry

## Purpose

`SpeciesRegistry` tracks species definitions and handles speciation decisions from genome drift.

Primary files:
- `src/sim/SpeciesRegistry.ts`
- `src/sim/types.ts`
- `src/species/SpeciesCommonNameService.ts`

## Core Responsibilities

- Maintain species records (id, name, traits, allowed biomes, lineage, centroid genome).
- Assign incoming genomes to nearest species centroid.
- Create new species when genetic distance exceeds threshold.
- Keep deterministic naming and visual identity.

## Speciation Rule

High-level logic:
1. Compute genetic distance to all existing centroids.
2. If best distance > `speciationThreshold` -> create new species.
3. Else update matched centroid incrementally.

This provides gradual drift tracking and discrete branching.

## Species Metadata

Each species stores:
- `id`, `commonName`, `color`.
- `traits`, `allowedBiomes`, `promptStyle`.
- `parentSpeciesId`, `lineageIds`.
- Habitat hint, diet type, size class.
- Population counters and creation tick.

## Cognition/Evolution Link

Species-level cognition metrics are maintained in `CreatureSystem` (`speciesCognition` map), then joined into `SpeciesStat`:
- `intelligence`
- `languageLevel`
- `socialComplexity`
- `eventPressure`
- `cognitionStage`

## Deterministic Naming

Names come from `SpeciesCommonNameService` using:
- Habitat hint.
- Diet class.
- Size class.
- Key traits.
- Seed + used-name set.

## Serialization

`SpeciesRegistry` exposes:
- `exportState()`
- `hydrateState()`

Used indirectly via `CreatureSystemState` during save/load.

## File Mapping

- Registry implementation: `src/sim/SpeciesRegistry.ts`
- Registry type contracts: `src/sim/types.ts`
- Common-name generation: `src/species/SpeciesCommonNameService.ts`
- Phylogeny projection: `src/sim/Phylogeny.ts`
