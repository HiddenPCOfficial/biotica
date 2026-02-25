# Biomes

## Purpose

Biome helpers define tile semantics used by world ecology and world generation support logic.

Source file:
- `src/world/Biomes.ts`

## Tile Classification Helpers

| Helper | Meaning |
|---|---|
| `isWaterTile(tile)` | `DeepWater` or `ShallowWater` |
| `isPlantBlockedTile(tile)` | water or lava/scorched |
| `isLandTile(tile)` | non-water and non-lava |
| `isVolcanoCandidate(tile)` | mountain/rock/hills/snow |

These helpers are used by:
- `WorldState` initialization.
- `PlantSystem` growth blocking logic.
- `ResourceNodeSystem` placement filters.
- Volcano anchor selection.

## Environmental Baselines

Biome baselines are defined as deterministic lookup functions:
- `humidityBase(tile)`
- `temperatureBase(tile)`
- `fertilityBase(tile)`

`createWorldState` combines these baselines with deterministic noise:
- humidity/temperature/fertility start values differ by tile type.
- local variation comes from `hash2D` noise, seed-dependent.

## Important Gameplay Implications

- Desert/rock/snow start with lower fertility and plant growth potential.
- Forest/jungle/swamp have higher humidity/fertility baseline.
- Lava has extreme temperature and zero fertility.
- Volcano anchor is biased toward rock/mountain/hills/snow tiles.

## Extension Pattern

When adding a new tile ID:
1. Update classification helpers in `Biomes.ts`.
2. Add baseline values for humidity/temperature/fertility.
3. Update systems that branch by tile semantics:
   - `EnvironmentUpdater`
   - `PlantSystem`
   - `ResourceNodeSystem`
   - render color resolvers (`TerrainRenderer`).
