# Menu System

## Scope

Menu UI is pure HTML/CSS (no external framework for menu pages) and supports both main menu and pause menu flows.

Primary files:
- `src/ui/menu/MenuRoot.ts`
- `src/ui/menu/pages/MainMenuPage.ts`
- `src/ui/menu/pages/PauseMenuPage.ts`
- `src/ui/menu/pages/WorldCreatePage.ts`
- `src/ui/menu/pages/WorldLoadPage.ts`
- `src/ui/menu/pages/SettingsPage.ts`
- `src/ui/menu/pages/StructuresPage.ts`
- `src/ui/menu/styles/menu.css`

Scene bindings:
- `src/scenes/MainMenuScene.ts`
- `src/scenes/WorldCreateScene.ts`
- `src/scenes/WorldLoadScene.ts`
- `src/scenes/WorldScene.ts`

## Main Menu

Main entries:
- `New World`
- `Load World`
- `Structures`
- `Settings`
- `Quit`

`MainMenuScene` swaps page components inside `MenuRoot.pageHost`.

## World Creation

`WorldCreatePage` collects:
- Name, seed, preset, world size.
- Event rate, tree density, volcano count (0/1), simulation speed.
- Toggles: Gene Agent, civs, predators.

Scene flow:
- `WorldCreateScene.createWorld()` builds `WorldProfile` and navigates through `LoadingScene` to `WorldScene`.

## World Load

`WorldLoadPage` provides:
- Save list with sort mode.
- Preview card (thumbnail + stats).
- Actions: load, duplicate, delete.

Uses `SaveManager` via `WorldLoadScene`.

## Settings

`SettingsPage` edits `GameSettings` categories:
- Video, audio, controls, gameplay, debug.

State backend:
- `src/settings/SettingsStore.ts`.

## Structures Tab (Main + Pause)

Single reusable page component:
- `src/ui/menu/pages/StructuresPage.ts`

Data source:
- `StructureUiAdapter` (`src/ui/data/StructureUiAdapter.ts`).

Contexts:
- Main menu: preview from latest save (if available).
- Pause menu: live world structures from current runtime snapshot.

Features:
- Search/filter/sort table.
- Clickable rows and selected state.
- Inspector with utility/cost/requirements/resistances/effects.
- Status pill (`buildable`, `locked`, `missing_materials`).
- In-game actions: focus examples, focus instance, deterministic build hint.

## Styling

Menu styling is centralized in:
- `src/ui/menu/styles/menu.css`

Includes:
- Responsive layout.
- Sticky table headers.
- Selected row and status pills.
- Inspector card sections.
