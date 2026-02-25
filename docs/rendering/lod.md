# LOD (Level of Detail)

## Scope

Biotica centralizes creature LOD rules in one file.

Source file:
- `src/render/LOD.ts`

## Current Rules

`resolveCreatureLod(zoom, forceDetail)` returns:

| Zoom Range | Mode |
|---|---|
| `zoom < 1.5` | `density` |
| `1.5 <= zoom < 3` | `blocks` |
| `zoom >= 3` | `details` |

`forceDetail = true` overrides into `details`.

## Where LOD Is Applied

- `src/render/CreatureRenderer.ts` uses LOD output to switch rendering path.
- `src/game/scenes/TerrainScene.ts` toggles detail visibility from camera zoom.

## Render Effects by LOD

- **density**: aggregated heat cells; no per-creature details.
- **blocks**: compact colored blocks for individuals.
- **details**: block + border + energy marker.

## Related Adaptive Sampling

Other zoom-sensitive logic in `TerrainScene`:
- Plant heatmap stride changes.
- Territory overlay stride changes.
- Relation line visibility thresholds.

These are currently local heuristics and can be consolidated in future LOD policy modules.

## Extension Pattern

When adding new LOD levels:
1. Update `CreatureLod` union and thresholds in `render/LOD.ts`.
2. Add corresponding rendering branch in `CreatureRenderer`.
3. Keep thresholds deterministic and UI-tested at boundary zoom values.
