# Picking and Focus

## Scope

Picking converts pointer coordinates into world/tile space and resolves selected entities.

Primary files:
- `src/render/picking.ts`
- `src/game/scenes/TerrainScene.ts`

## Coordinate Conversion

Helpers in `render/picking.ts`:
- `screenToWorldPoint(canvas, worldContainer, clientX, clientY)`
- `worldPointFromScreen(...)`
- `worldToTile(worldX, worldY, tileSize)`
- `clampTileToWorld(tileX, tileY, world)`

## Click Selection Priority

`TerrainScene.handleCanvasClick(...)` resolves entities in this order:
1. World structure instance (`StructureSystem.getAt`).
2. Civilization note.
3. Civilization agent.
4. Territory owner fallback.
5. Fauna creature pick via `CreatureRenderer.pickCreatureAtWorld`.

Each branch updates selection state and opens relevant UI tabs.

## Focus Camera

Camera focus APIs in `TerrainScene`:
- `focusWorldPoint(tileX, tileY)`
- `focusStructureInstanceById(structureId)`
- `focusFirstStructureByDefinition(defId, clearAfterMs)`

Focus behavior:
- Center camera on tile.
- Trigger temporary highlight ring (`jumpHighlightGraphics`).
- Optional structure highlight clear timer.

## UI Integration

Focus actions are emitted from menu/overlay UI and consumed by scene actions:
- Menu structures page: focus instances/examples.
- Overlay pages: focus selected rows (`focusWorldPoint`).
- AI chat references: jump-to-entity routing.

## Determinism and Safety

Picking reads current rendered/world state only and does not introduce nondeterministic mutation in sim rules.
It is safe to call multiple times per frame for UI interactions.
