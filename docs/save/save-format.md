# Save Format

## Scope

Biotica save records persist world runtime arrays, profile metadata, and system snapshots.

Primary files:
- `src/save/SaveTypes.ts`
- `src/save/SaveManager.ts`
- `src/save/storage/IndexedDbStorage.ts`
- `src/save/storage/LocalStorageFallback.ts`

## Top-Level Record

Schema type:
- `WorldSaveRecord`

Core fields:

| Field | Description |
|---|---|
| `id` | `<worldId>::<slotId>` |
| `slotId` | save slot key |
| `name` | user-facing world name |
| `createdAt`, `updatedAt` | timestamps |
| `seed` | world seed string |
| `schemaVersion` | save schema version |
| `profile` | `WorldProfile` setup/config |
| `preview` | thumbnail + summary stats |
| `state` | serialized world arrays/runtime | 
| `systems` | serialized system snapshot payload |

Constant:
- `SAVE_SCHEMA_VERSION = 1`

## `WorldProfile`

Stores initial world creation parameters:
- Terrain config.
- Preset.
- Event/tree/volcano/speed settings.
- Feature toggles (gene agent, civs, predators).

## World State Payload

`WorldStateSerialized` stores base64 encoded arrays:
- `tilesB64`
- `humidityB64`
- `temperatureB64`
- `fertilityB64`
- `hazardB64`
- `plantBiomassB64`

And structured fields:
- `width`, `height`, `seed`, `tick`
- `volcano` state
- `simTuning`

Encode/decode helpers:
- `serializeRuntimeWorldState(...)`
- `deserializeRuntimeWorldState(...)`

## Systems Snapshot

`SaveSystemsSnapshot` captures higher-level and runtime subsystems.

In practice, `TerrainScene.exportSystemsSnapshot()` includes:
- Species, phylogeny.
- Civ factions/agents/relations/notes.
- Events and volcano recent events.
- Items/crafting and structures.
- Logs/metrics.
- `runtime` object with internal system export states.

## Autosave

Autosave behavior in `WorldScene`:
- Initial autosave after first ticks.
- Periodic autosave by `settings.gameplay.autosaveIntervalSec`.
- Manual save from pause menu.

Slot trimming policy:
- Configured by `maxSlotsPerWorld` in `SaveManager`.
- Old slots beyond cap are deleted by recency.

## Storage Backends

Primary:
- IndexedDB (`IndexedDbStorage`).

Fallback:
- LocalStorage (`LocalStorageFallback`) if IndexedDB unavailable.

Both satisfy `SaveStorage` interface.
