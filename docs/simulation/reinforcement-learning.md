# Reinforcement Learning (Lightweight)

## Scope

Biotica uses lightweight deterministic RL-like adaptation inside civilization decision layers.

Primary files:
- `src/civ/DecisionSystem.ts`
- `src/civ/IntentionSystem.ts`
- `src/civ/CivSystem.ts`

## RL Architecture

Two adaptive components:

1. **Intent-level adaptation** (`IntentionSystem`)
- Per-agent weights over intents.
- Reward updates via `applyReward(agentId, intent, reward)`.

2. **Goal/action-level adaptation** (`DecisionSystem`)
- Per-agent action weights (`goalBias`, tool/inventory/resource features).
- Reward updates via `applyReward(agentId, goal, reward, features)`.

Both are deterministic because:
- Randomness comes from seeded RNG.
- Updates occur only inside tick-ordered simulation steps.

## Reward Semantics

Examples from `CivSystem.step(...)`:
- Positive rewards for successful gather/build/craft/equip/write actions.
- Negative rewards when actions fail or constraints block success.
- **Death penalty**:
  - On agent death, both decision and intention layers receive strong negative reward.

## Biological Reward Framing

Conceptual mapping used by system logic:
- Reward aligns with stabilization of vital/resource state.
- High hunger/water stress/hazard pushes urgent intents.
- Successful resource/tool actions reinforce similar future choices.

## Not a Deep RL Stack

This is not NN-based or policy-gradient RL.
It is a deterministic tabular/weight adjustment mechanism aimed at:
- Emergent variation.
- Fast runtime.
- Save/load compatibility.

## Extension Guidance

To extend safely:
- Keep reward ranges bounded.
- Keep updates deterministic per tick.
- Serialize any new RL state.
- Avoid introducing wall-clock or non-seeded randomness.
