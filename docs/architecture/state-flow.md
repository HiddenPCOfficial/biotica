# State Flow

## Scene Flow

```text
BootScene
  -> MainMenuScene
      -> WorldCreateScene -> LoadingScene -> WorldScene
      -> WorldLoadScene   -> LoadingScene -> WorldScene

WorldScene (pause toggle)
  -> Pause Menu
      -> Resume (back to WorldScene runtime)
      -> Save
      -> Structures
      -> Settings
      -> Exit to Main Menu
```

Primary scene files:
- `src/scenes/BootScene.ts`
- `src/scenes/MainMenuScene.ts`
- `src/scenes/WorldCreateScene.ts`
- `src/scenes/WorldLoadScene.ts`
- `src/scenes/LoadingScene.ts`
- `src/scenes/WorldScene.ts`

## Scene Orchestration

State transitions are serialized by:
- `src/core/GameStateMachine.ts`
- factory wiring in `src/game/Game.ts`

`Game.mount()` boot order:
1. Create Pixi `Application` (`createRenderer`).
2. Initialize `SettingsStore` and `SaveManager`.
3. Start `MainLoop`.
4. Start state machine at `boot`.

## Simulation Runtime Flow (World Scene)

`WorldScene.mount()` prepares runtime and instantiates `TerrainScene`.

```text
WorldScene.mount
  -> generate or deserialize terrain map
  -> new TerrainScene(...)
  -> TerrainScene.mount()
  -> optional hydrateRuntimeState + hydrateSystemsSnapshot

WorldScene.update(deltaMs)
  -> TerrainScene.update(deltaMs)
  -> autosave checks
```

## Tick Loop Flow

Inside `src/game/scenes/TerrainScene.ts`:

```text
update(deltaMs)
  -> accumulate fixed-step time
  -> while accumulator >= FIXED_STEP_MS:
       stepSimulationTick()

stepSimulationTick()
  -> world.tick++
  -> EventSystem.step()
  -> VolcanoSystem.step()
  -> EnvironmentUpdater.step()
  -> PlantSystem.step()
  -> ResourceNodeSystem.step()
  -> CreatureSystem.step()
  -> CivSystem.step()
  -> StructureSystem.step()
  -> logs + metrics sampling
```

## Render/Overlay Flow

```text
TerrainScene.update
  -> renderFrameLayers()
      -> TerrainRenderer.renderDirty()
      -> CreatureRenderer.renderCreatures()
      -> StructureRenderer.render(...)
      -> overlay graphics

  -> UISnapshotBuilder.build(...)
  -> OverlayController.setSnapshot(snapshot)
```

Snapshot write path:
- producer: `src/ui/overlay/UISnapshotBuilder.ts`
- consumer: `src/ui/overlay/OverlayController.ts` and pages.

## Save / Load Flow

### Save

```text
Pause menu / autosave timer
  -> WorldScene.saveWorld()
    -> TerrainScene.exportRuntimeStateInput()
    -> serializeRuntimeWorldState(...)
    -> TerrainScene.exportSystemsSnapshot()
    -> SaveManager.saveWorld(...)
```

### Load

```text
WorldLoadScene -> LoadingScene
  -> SaveManager.loadWorld(id)
  -> WorldScene with loaded record
  -> deserializeRuntimeWorldState(record.state)
  -> TerrainScene.hydrateRuntimeState(...)
  -> TerrainScene.hydrateSystemsSnapshot(record.systems)
```

## Boot -> Pause -> Save -> Load Sequence (Requested)

```text
Boot -> Menu -> WorldCreate/WorldLoad -> Loading -> World
World -> Pause -> Save -> Exit Menu -> Load -> Loading -> World
```

This sequence is fully implemented by current `scenes/*` + `WorldScene` + `SaveManager`.
