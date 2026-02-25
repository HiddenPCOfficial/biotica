# Save Migrations

## Current Status

Biotica currently uses schema version `1`.

Source of truth:
- `SAVE_SCHEMA_VERSION` in `src/save/SaveTypes.ts`.
- Migration logic in `applyMigrations(...)` inside `src/save/SaveManager.ts`.

## Migration Entry Point

Every load passes through:

```ts
const migrated = applyMigrations(row)
if (migrated.schemaVersion !== row.schemaVersion) {
  await storage.put(migrated)
}
```

This guarantees on-read forward migration and persistence of migrated records.

## Existing Migration Logic

If record is missing/older than v1:
- Set `schemaVersion = 1`.
- Ensure `preview` exists with default summary.
- Ensure `slotId` defaults to `slot-1`.

Then normalize to current `SAVE_SCHEMA_VERSION`.

## Backward Compatibility Strategy

Recommended migration pattern:
1. Add new schema version constant.
2. Keep migrations idempotent.
3. Migrate oldest -> newest in ordered steps.
4. Preserve unknown fields when possible.
5. Never mutate deterministic runtime semantics silently.

## Suggested Future File Layout

Current migrations are inline in `SaveManager`.
For larger evolution, move to:

```text
src/save/migrations/
  v1.ts
  v2.ts
  index.ts
```

with a central registry and tested migration chain.

## Validation Checklist for New Versions

- Can old records load without crash?
- Are default values deterministic?
- Are world arrays and runtime states size-checked?
- Is migrated record written back exactly once?
- Are tests or manual fixtures updated?
