# Eras

## Scope

Era progression is currently represented by a deterministic threshold-based system.

Source file:
- `src/world/EraSystem.ts`

## Era Model

Era keys:
- `genesis`
- `ecologicRise`
- `civicDawn`
- `industrialShift`

State shape:

```ts
type EraState = {
  current: EraKey
  changedAtTick: number
}
```

## Transition Logic

`EraSystem.step(tick)` picks era by minimum tick thresholds:

| Era | Min Tick |
|---|---|
| `genesis` | 0 |
| `ecologicRise` | 800 |
| `civicDawn` | 2800 |
| `industrialShift` | 6000 |

Transitions are deterministic and monotonic by tick.

## Current Runtime Integration

- Era system exists and is serializable at state level.
- `TerrainScene.exportSystemsSnapshot()` currently stores simple era markers (`tick-*`) rather than a full era subsystem snapshot.
- `shared/events.ts` already defines an `eraChanged` event type for incremental adoption.

## Recommended Next Integration

To fully operationalize eras:
1. Instantiate `EraSystem` in `TerrainScene`.
2. Call `step(tick)` inside fixed-step loop.
3. Emit `eraChanged` via `EventBus` when era changes.
4. Persist era state directly in save runtime snapshot.

This keeps era logic deterministic and decoupled from UI/render.
