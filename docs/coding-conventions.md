# Coding Conventions

## TypeScript and Naming

- TypeScript strict mode is required (`tsconfig.app.json` has `"strict": true`).
- Naming rules:
  - Classes/types/interfaces: `PascalCase`
  - Functions/variables: `camelCase`
  - Global constants: `UPPER_SNAKE_CASE`
- Prefer named exports for clarity.

## Type Placement Rules

- Shared exported types belong in dedicated type files:
  - `src/**/types.ts` (or `*.types.ts` when module grows).
- Avoid duplicating type aliases across modules.
- Use `type` for unions/aliases; `interface` where extension/merging is useful.

## Module Boundaries

- `sim` must not import Pixi or DOM.
- `render` must not mutate authoritative simulation state.
- `ui` should emit commands; simulation mutation must happen in scene/system layers.
- `ai/llm` is read-only text assistance.
- `shared` holds cross-cutting utilities only.

## Determinism Rules

- Use seeded RNG (`shared/rng.ts`, `core/SeededRng.ts`, `ai/gene/SeededRng.ts`).
- Keep fixed-step simulation order stable.
- Avoid non-deterministic data structures/iteration side effects in core logic.

## PixiJS Rendering Rules

- Keep stable layer hierarchy and z-index ordering.
- Use culling and chunk-based redraw where possible.
- Avoid unnecessary full redraws when dirty regions are known.
- Centralize LOD thresholds in dedicated logic (`render/LOD.ts`).

## Save/Serialization Rules

- Systems with runtime state must implement export/hydrate symmetry.
- New save fields require migration defaults.
- Preserve backward compatibility through explicit schema versioning.

## Event-Driven Updates

- Prefer typed events for incremental UI/render updates where practical (`shared/events.ts`).
- Keep event payloads small and deterministic.

## No Duplicate Config/Constants

- Reuse constants from `shared/constants.ts` and module config files.
- Avoid scattering repeated literals (tile size, chunk size, tuning bounds).

## Code Quality Notes for This Repository

- The codebase is in modularization transition; thin wrapper/re-export files exist.
- New work should target canonical module locations (`world`, `sim`, `render`, `ui`, `ai`, `save`, `shared`).
- Keep wrappers compatibility-focused and minimal.

## PR/Change Checklist

Before merging:
1. Type-check passes.
2. No circular dependency introduced.
3. No UI/sim/render responsibility mixing in changed files.
4. Save/load path remains functional.
5. New types/constants are single-source and non-duplicated.
