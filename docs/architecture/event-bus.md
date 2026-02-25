# Event Bus

## Purpose

Biotica exposes a typed event bus for decoupled pub/sub between simulation, render, and UI layers.

Source file:
- `src/shared/events.ts`

## Event Bus API

```ts
const bus = createBioticaEventBus()

const off = bus.on('structureCreated', (payload) => {
  // react
})

bus.emit('structureCreated', {
  structureId: 'ws-1',
  defId: 'hut',
  x: 10,
  y: 12,
  factionId: 'civ-1',
})

off()
```

## Built-in Event Map

Defined in `BioticaEventMap`:

| Event | Payload |
|---|---|
| `structureCreated` | `{ structureId, defId, x, y, factionId }` |
| `structureRemoved` | `{ structureId }` |
| `civFounded` | `{ factionId, speciesId, tick }` |
| `eraChanged` | `{ from, to, tick }` |

## Emitter / Listener Responsibility Model

Target model:
- Simulation systems emit domain events.
- Render and UI subscribe for targeted updates.
- Save/analytics can subscribe for audit trails.

Current status:
- Typed bus exists and is ready in `shared/events.ts`.
- Current runtime still relies primarily on direct method wiring and snapshot polling.

## Recommended Integration Points

- Emit in:
  - `StructureSystem.place()` / `dismantle()`.
  - `CivSystem` faction founding.
  - `EraSystem.step()` on era transition.
- Listen in:
  - `render/*` for incremental visuals.
  - `ui/overlay/*` for event feed and notifications.

## Non-Goals

- The event bus is not a state store.
- It should not replace deterministic world state mutation order.
- It should not carry heavy payload snapshots; only concise event metadata.

## Determinism Guidance

Event emission order must be deterministic and tied to tick progression. Emit events only from deterministic branches (no wall-clock timing).
