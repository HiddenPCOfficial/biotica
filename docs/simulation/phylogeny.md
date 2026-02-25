# Phylogeny

## Scope

Phylogeny is currently represented as a minimal lineage projection built from species rows.

Source file:
- `src/sim/Phylogeny.ts`

## Data Model

`PhylogenyNode`:

```ts
type PhylogenyNode = {
  speciesId: string
  parentSpeciesId: string | null
  createdAtTick: number
}
```

## Builder

`buildPhylogeny(speciesRows)`:
- Maps each species into a node.
- Sorts nodes by `createdAtTick`.

This is intentionally lightweight and easy to serialize into save snapshots and UI timelines.

## Inputs

Input species rows usually come from:
- `CreatureSystem.getSpecies()` or species stats projections.
- Save snapshot structures (`TerrainScene.exportSystemsSnapshot().phylogeny`).

## Extension Points

If richer phylogeny is required:
- Add branch confidence and extinct lineage markers.
- Store divergence distance metrics from `geneticDistance`.
- Add per-node aggregate traits at speciation tick.

Keep output deterministic and serializable.
