# Inspector System

## Scope

Inspector UX combines selection management, entity-specific panels, and camera focus actions.

Primary files:
- `src/ui/CreatureInspector.ts`
- `src/ui/selection/SelectionManager.ts`
- `src/game/scenes/TerrainScene.ts`
- Overlay inspectors in `src/ui/overlay/pages/*`

## Selection Core

`SelectionManager` provides cross-panel selection references:
- Types: species, creature, civilization, event, era, note, structure, ethnicity, religion.
- API: `setSelection`, typed `select*` helpers, `onChange` listeners.

This enables consistent AI chat context and panel coordination.

## Creature Inspector

`CreatureInspector` is a dedicated floating DOM panel:
- Shows vital bars and needs.
- Displays species/genome context.
- Requests LLM description on demand.
- Supports JSON/raw toggle and regenerate.

File:
- `src/ui/CreatureInspector.ts`

## Click Creature / Click Structure

### Creature click path

1. Picking resolves creature id.
2. `SelectionManager.selectCreature(...)`.
3. `CreatureInspector.show(...)` opens with stats.
4. Optional LLM description fetch.

### Structure click path

1. Picking resolves structure at tile.
2. Selection set to structure.
3. `StructureRenderer.setHighlight(...)`.
4. Camera focus + overlay tab opening.

## Focus Origin Event

Entities can be focused from:
- Table/list row clicks (menu/overlay).
- AI reference jumps.
- Inspector action buttons.

Focus APIs in `TerrainScene`:
- `focusWorldPoint`
- `focusStructureInstanceById`
- `focusFirstStructureByDefinition`

Focus includes temporary highlight ring and optional structure highlight timeout.

## In-Game Structure Inspector (Menu)

Structures page inspector (`ui/menu/pages/StructuresPage.ts`) provides:
- Requirements and lock reason breakdown.
- Cost/resistance/effects sections.
- Instance list with per-instance `Focus` action.
- Deterministic build hint display.

## Principles

- Inspectors read snapshots/adapters.
- Selection is centralized.
- Camera focus is explicit command-based.
- Rendering/system mutation only happens in scene/system layers.
