# Civilization System

## Purpose

`CivSystem` handles emergence and simulation of civilizations built on top of species populations.

Primary files:
- `src/civ/CivSystem.ts`
- Supporting subsystems in `src/civ/*`

## Civilization Emergence

Civilizations are founded when species metrics satisfy thresholds (population/intelligence/stability), evaluated inside `CivSystem`.

Key constants in `CivSystem` include:
- `CIV_FOUNDATION_POP_THRESHOLD`
- `CIV_FOUNDATION_INTELLIGENCE_THRESHOLD`
- `CIV_FOUNDATION_STABILITY_THRESHOLD`

## Agent Model

Civilization members (`Agent`) contain:
- Role/goal/intent/plan state.
- Inventory + item/equipment slots.
- Mental state and logs.
- Position/vitals and social relation references.

Relevant types:
- `src/civ/types.ts`

## Intent, Planning, and Actions

Pipeline:
1. `IntentionSystem.selectIntent(...)`.
2. `PlanSystem.createPlan(...)`.
3. `CivSystem.step(...)` executes goals and plan outcomes.
4. Reward feedback updates:
   - `DecisionSystem.applyReward(...)`
   - `IntentionSystem.applyReward(...)`

This provides a lightweight RL-flavored adaptive behavior loop.

## Territory System

Territory ownership/control is computed on a full grid:
- Influence sources: home center, structures, agents.
- Outputs: owner map, control map, border map.

File:
- `src/civ/TerritorySystem.ts`

## Diplomacy and Relations

`CivSystem` maintains inter-faction relations with:
- Trust/tension metrics.
- Status labels (`neutral`, `ally`, `trade`, `hostile`).
- Relation histories for charting.

UI access:
- `overlay/pages/CivilizationsPage.ts`.

## Religion and Identity

Identity and religion emergence are deterministic:
- `IdentityEvolutionSystem` updates identity level, symbols, religion creation/assignment.
- `CulturalEvolutionSystem` shifts strategy/practices based on pressure signals.
- `CommunicationSystem` evolves lexicon and grammar.

Files:
- `src/civ/IdentityEvolutionSystem.ts`
- `src/civ/CulturalEvolutionSystem.ts`
- `src/civ/CommunicationSystem.ts`

## Writing System

Faction writing/literacy progresses via:
- Literacy level updates.
- Symbol set growth.
- Note authoring actions (`Write` goal).

Data surfaces in overlay and save snapshots (`notes`, `writing`, `literacy`).

## Structures and Items Integration

`CivSystem` integrates with:
- `CraftingEvolutionSystem` (`setItemSystems`).
- `ResourceNodeSystem` (`setResourceNodeSystem`).
- Building/structure subsystems for requests/completion.

## Serialization

`CivSystem` supports full export/hydrate of:
- Factions, agents, relations, metrics, dialogues, notes.
- Building state and cooldown maps.
- Item RNG and counters.

Persisted via `TerrainScene.exportSystemsSnapshot().runtime.civSystem`.
