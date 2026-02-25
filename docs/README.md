# Biotica Technical Documentation

Biotica is a deterministic Darwinian simulation game with emergent ecology and civilizations.

This `/docs` folder is designed for:
- Human maintainers onboarding quickly.
- AI coding assistants needing high-signal, file-mapped context.

## What Biotica Is

Biotica combines:
- Tile-based world simulation (`world` + environmental systems).
- Evolutionary population simulation (`sim` creature/species/civ systems).
- Real-time rendering with PixiJS (`render`).
- HTML/CSS UI for menu and in-game overlay (`ui`).
- AI subsystems for text generation and deterministic world tuning (`ai`).
- Persistent save/load and migration (`save`).

## Game Objective

There is no rigid win condition. The core objective is to observe and steer:
- Species adaptation and speciation.
- Civilization emergence and culture drift.
- Resource pressure, hazards, and resilience.

## Core Concept

Biotica is an emergent simulator where:
- Natural selection is approximated through energy, hydration, hazard, and reproduction pressures.
- Civilizations emerge when species cross stability/intelligence thresholds.
- Cultural, territorial, linguistic, and religious traits evolve over time.

## Architecture at a Glance

```text
Vue App (src/App.vue)
  -> Game bootstrap (src/core/Game.ts -> src/game/Game.ts)
    -> Scene state machine (src/core/GameStateMachine.ts)
      -> World runtime orchestrator (src/scenes/WorldScene.ts)
        -> Simulation orchestrator (src/game/scenes/TerrainScene.ts)
          -> world/* + sim/* + civ/* + events/* + resources/* + structures/* + items/*
          -> render/*
          -> ui/overlay/* + ui/CreatureInspector.ts
          -> ai/gene/* + ai/llm/*
          -> save/* via src/save/SaveManager.ts
```

## System Boundaries

- **Simulation**: state mutation and rules (`sim`, `civ`, `world`, `events`, `resources`, `structures`, `items`).
- **Rendering**: PixiJS drawing only (`render`).
- **UI**: DOM panels, menus, inspector (`ui`).
- **AI**:
  - LLM agent for read-only chat and descriptions (`ai/llm`).
  - Gene agent for deterministic multi-objective tuning (`ai/gene`).

## Run and Build

From project root:

```bash
npm install
npm run dev
```

Other useful commands:

```bash
npm run type-check
npm run build
npm run preview
```

## Create a New World

1. Start app and open `Main Menu`.
2. Click `New World`.
3. Configure preset/size/event rate/tree density/volcano count.
4. Optionally enable Gene Agent and civ/predator toggles.
5. World is launched through `loading` scene into `world` scene.

Relevant files:
- `src/scenes/MainMenuScene.ts`
- `src/scenes/WorldCreateScene.ts`
- `src/ui/menu/pages/WorldCreatePage.ts`
- `src/scenes/LoadingScene.ts`
- `src/scenes/WorldScene.ts`

## Save / Load Flow

- Save runtime state from pause menu or autosave timer.
- Save payload includes:
  - Encoded world arrays.
  - Systems snapshot.
  - Preview metadata.
- Load restores world arrays, then hydrates systems.

Relevant files:
- `src/save/SaveManager.ts`
- `src/save/SaveTypes.ts`
- `src/scenes/WorldLoadScene.ts`
- `src/scenes/WorldScene.ts`
- `src/game/scenes/TerrainScene.ts`

## Project Philosophy

- Determinism first for simulation reproducibility.
- Immutable catalogs for generated definitions.
- Strict separation between simulation, rendering, and UI responsibilities.
- LLM usage limited to non-tick text workflows.
- Progressive modularization while preserving behavior and save compatibility.

## Reading Order

1. `architecture/overview.md`
2. `architecture/folder-structure.md`
3. `architecture/state-flow.md`
4. Domain folders (`world`, `simulation`, `ai`, `rendering`, `ui`, `save`)
5. `extension-guide.md`
6. `coding-conventions.md`
