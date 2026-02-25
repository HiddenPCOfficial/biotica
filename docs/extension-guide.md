# Extension Guide

This guide explains how to extend Biotica without breaking determinism, architecture boundaries, or save compatibility.

## 1) Add a New Structure

### Files to touch
- `src/structures/StructureCatalogGenerator.ts`
- (optional) `src/structures/StructureCatalog.ts` if adding new utility tag literal.
- `src/ui/data/StructureUiAdapter.ts` for inspector/effects derivation.
- `src/game/scenes/TerrainScene.ts` mapping if civ blueprint conversion is required.

### Steps
1. Add definition in generator with id/name/size/tech/cost/tags/resistances.
2. Keep `id` normalized and unique.
3. If tied to civ structure blueprint, update `mapCivStructureToDefinition(...)`.
4. Optionally add adapter logic for custom effects text.
5. Verify appears in menu `StructuresPage` and pause context.

### Example snippet

```ts
// StructureCatalogGenerator.ts
{
  id: 'granary',
  name: 'Granary',
  size: { w: 2, h: 2 },
  requiredTechLevel: 2,
  buildCost: [{ materialId: 'wood', amount: 14 }, { materialId: 'stone', amount: 6 }],
  utilityTags: ['storage'],
  heatResistance: 0.4,
  lavaResistance: 0.2,
  hazardResistance: 0.35,
}
```

## 2) Add a New Material

### Files to touch
- `src/materials/MaterialCatalogGenerator.ts`
- `src/materials/MaterialCatalog.ts` (only if new category semantics needed)
- `src/items/ItemCatalogGenerator.ts` if derived items/tools should use material.
- `src/resources/ResourceNodeSystem.ts` if nodes should yield that material.

### Steps
1. Add material definition with biome compatibility and resistance/rarity values.
2. Add node generation/harvest mapping if minable/choppable.
3. Ensure item generation includes useful outputs.
4. Ensure structure costs or crafting recipes can consume it.

## 3) Add a New Simulation System

### Placement
- Prefer `src/sim/<NewSystem>.ts` (or `src/world/<NewWorldSystem>.ts` for environment-centric logic).

### Minimal API contract

```ts
class NewSystem {
  constructor(config: NewSystemConfig) {}
  step(tick: number): void {}
  exportState(): NewSystemState {}
  hydrateState(state: NewSystemState): void {}
}
```

### Integration points
- Instantiate and wire in `src/game/scenes/TerrainScene.ts` (current orchestrator).
- Include snapshot export/hydrate for save compatibility.
- Add UI snapshot fields only through `UISnapshotBuilder`.

## 4) Extend AI

### LLM extension (text-only)
- Add service in `src/ai/llm/services/`.
- Wire in `src/ai/llm/LlmAgent.ts`.
- Reuse `AiCache` and `AiRateLimiter`.
- Expose via UI action, not tick loop.

### Gene Agent extension
- Add objective or parameter in `src/ai/gene/schemas.ts`.
- Update scoring in `EcoObjectives.ts`.
- Update NSGA-II handling in `EvoTunerAgent.ts`.
- Apply tuned parameter in `WorldGenesisAgent.applyBestConfig(...)`.

## 5) Avoid Breaking Determinism

Rules:
- Use seeded RNG classes only (`SeededRng` variants), never `Math.random()` in sim paths.
- Keep fixed-step order stable.
- Avoid wall-clock/timezone dependent logic in simulation decisions.
- Ensure map iteration order is explicit and deterministic.
- Keep save/load round-trip producing equivalent runtime state.

## 6) Save Compatibility Checklist

When adding stateful systems:
- Add `exportState()` and `hydrateState()`.
- Include runtime state in `TerrainScene.exportSystemsSnapshot().runtime`.
- Hydrate in `TerrainScene.hydrateSystemsSnapshot(...)`.
- Add migration defaults if schema changes.

## 7) UI Extension Pattern

- Menu pages go in `src/ui/menu/pages/*`.
- Overlay pages go in `src/ui/overlay/pages/*`.
- For combined catalog + runtime projections, add adapter in `src/ui/data/*`.
- Keep UI stateless regarding authoritative simulation mutations.

## 8) Testing / Validation Quick Pass

After extension:
1. `npm run type-check`
2. Launch and create world.
3. Verify pause menu save/load.
4. Verify overlay tab(s) and inspector actions.
5. Verify no obvious determinism regression with same seed/profile.
