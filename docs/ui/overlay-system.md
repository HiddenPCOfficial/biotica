# Overlay System

## Scope

In-game overlay is a multi-tab HUD for runtime telemetry and control.

Primary files:
- `src/ui/overlay/OverlayRoot.ts`
- `src/ui/overlay/OverlayController.ts`
- `src/ui/overlay/UISnapshotBuilder.ts`
- `src/ui/overlay/types.ts`
- `src/ui/overlay/pages/*.ts`
- `src/ui/overlay/styles/overlay.css`

## Tab Set

Current tab IDs:
- `overview`, `events`, `species`, `environment`, `worldGenesis`, `structures`, `civilizations`, `individuals`, `items`, `aiChat`, `logs`.

## Data Pipeline

```text
TerrainScene (authoritative systems)
  -> UISnapshotBuilder.build(...)
    -> SimulationSnapshot
      -> OverlayController.setSnapshot(snapshot)
        -> active page update(snapshot)
```

## Snapshot Throttling Behavior

Overlay updates are throttled by two mechanisms:
1. Snapshot production cadence (`TerrainScene` panel refresh accumulator).
2. `OverlayController` defers UI application while pointer interaction is active.

This avoids expensive DOM/chart churn during user drag/scroll interactions.

## Overlay Actions

Pages emit typed actions (examples):
- `playPause`, `speedUp`, `speedDown`, `saveWorld`, `reset`.
- `focusWorldPoint`, `inspectCivAgent`, `requestAgentThoughtGloss`.
- AI chat actions (`aiChatSendMessage`, etc.).
- Structure actions (`dismantleStructure`).

Handled in:
- `src/game/scenes/TerrainScene.ts` action dispatcher.

## World View / HUD Visibility

`OverlayRoot` supports:
- Normal dashboard mode.
- World-view compact mode.
- Full HUD hide/show toggle.

## Charts and Telemetry

Charts are created lazily via:
- `src/ui/overlay/charts/ChartFactory.ts`

Snapshot includes time series and rich summaries for:
- Population, species, environment, civ relations, events, logs.

## AI Chat Integration

`AiChatPage` consumes `snapshot.aiChat` and drives:
- Prompt submission.
- Follow-selection mode.
- Explain mode.
- Reference jump actions.

LLM calls remain outside tick-loop mutation path.
