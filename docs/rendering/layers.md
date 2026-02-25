# Rendering Layers

## Scope

Rendering uses Pixi containers/graphics with fixed z-order and chunk-aware updates.

Primary files:
- `src/render/TerrainRenderer.ts`
- `src/render/CreatureRenderer.ts`
- `src/render/StructureRenderer.ts`
- `src/render/layers/*.ts`
- `src/game/scenes/TerrainScene.ts` (world container composition)

## Fixed Layer Stack

### Canonical Pixi layer classes

| Layer Class | zIndex | Purpose |
|---|---:|---|
| `TerrainLayer` | 10 | Base terrain tiles |
| `EffectsLayer` | 20 | Heatmaps, hazard overlay, atmosphere tint |
| `StructuresLayer` | 27 | Structures rendering |
| `CreaturesLayer` | 29 | Creature rendering |
| `DebugLayer` | 40 | Debug overlays |

Layer definitions:
- `src/render/layers/TerrainLayer.ts`
- `src/render/layers/EffectsLayer.ts`
- `src/render/layers/StructuresLayer.ts`
- `src/render/layers/CreaturesLayer.ts`
- `src/render/layers/DebugLayer.ts`

### Additional runtime graphics in `TerrainScene`

`TerrainScene` adds specialized overlay graphics with explicit z-order (territory, notes, agents, jump highlight).

## Terrain Rendering Strategy

`TerrainRenderer` is chunk-based:
- Uses world chunk metadata (`chunkSize`, `dirtyChunks`).
- Redraws only dirty chunks.
- Culls chunk visibility against viewport bounds.

Core APIs:
- `setViewportBounds(bounds)`
- `renderDirty()` / `renderAll()`
- `setHeatmapMode(...)`
- `setEventsOverlayEnabled(...)`

## Creature Rendering Strategy

`CreatureRenderer` uses LOD modes:
- Density heatmap at low zoom.
- Block rendering at medium zoom.
- Detailed markers at high zoom.

No per-creature sprite pool is currently used; rendering is immediate-mode `Graphics` per frame.

## Structure Rendering Strategy

`StructureRenderer`:
- Queries visible instances by rect.
- Draws fill + optional border/highlight.
- Uses utility tags and state to derive color/alpha.

## Performance Notes

Implemented best practices:
- Fixed layer hierarchy.
- Dirty-chunk redraws.
- Viewport culling by chunk and bounds queries.
- LOD switching by zoom.

Current tradeoff:
- Creatures/structures are drawn with `Graphics` each frame (good simplicity, moderate overhead).
- Sprite pooling or render-texture batching can be introduced for larger populations.
