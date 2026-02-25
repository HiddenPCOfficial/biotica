# Gene Agent (Deterministic NSGA-II)

## Purpose

Gene Agent tunes world runtime parameters deterministically before simulation starts.

Primary files:
- `src/ai/gene/WorldGenesisAgent.ts`
- `src/ai/gene/EvoTunerAgent.ts`
- `src/ai/gene/HeadlessSimulator.ts`
- `src/ai/gene/EcoObjectives.ts`
- `src/ai/gene/schemas.ts`
- `src/ai/gene/reports.ts`
- `src/ai/gene/GeneAgentConfig.ts`

## Key Properties

- No LLM dependency.
- Seeded deterministic random sampling.
- Multi-objective optimization (mini NSGA-II).
- Candidate scoring via headless simulation rollouts.

## Optimization Objectives

Defined in `ObjectiveScores`:
- `survivalScore`
- `biodiversityScore`
- `stabilityScore`
- `resourceBalanceScore`
- `catastropheTolerance`

Weighted ranking uses:
- `weightedObjectiveScore(scores, weights, constraints)`.

## Algorithm Outline

```text
Input ranges + constraints + weights + seed
  -> initialize candidate population
  -> evaluate candidates on N validation seeds
  -> NSGA-II non-dominated sorting + crowding distance
  -> elitist selection
  -> crossover + mutation
  -> repeat for configured generations
  -> select best candidate + pareto sample + reason codes
```

## Determinism Controls

- All randomness uses gene `SeededRng`.
- Candidate IDs and mixed seeds are deterministic.
- Headless simulator is deterministic with fixed formulas and seeded events.

## Multi-Objective Constraints

Default constraints include minimum thresholds for:
- Survival.
- Biodiversity.
- Resource balance.

Candidates below thresholds are penalized in weighted scoring.

## Output Artifacts

`WorldGenesisResult` contains:
- `bestConfig` (`WorldGenome`).
- `report.bestScores`.
- Pareto front sample.
- `reasonCodes` (e.g., stability/resource/survival flags).

## Runtime Application

`WorldGenesisAgent.applyBestConfig(...)` applies tuned config to:
- World arrays (biomass/temp/humidity/hazard initialization adjustments).
- `SimTuning` values:
  - plant growth/decay
  - metabolism
  - reproduction
  - event rate

It also derives runtime world tuning:
- Tree density multiplier.
- Volcano interval and lava caps.

## Config via `.env`

Main knobs:
- `VITE_GENE_AGENT_ENABLED`
- `VITE_GENE_AGENT_POPULATION`
- `VITE_GENE_AGENT_GENERATIONS`
- `VITE_GENE_AGENT_SIM_TICKS`
- `VITE_GENE_AGENT_VALIDATION_SEEDS`
- `VITE_GENE_AGENT_MUTATION_RATE`
- `VITE_GENE_AGENT_CROSSOVER_RATE`
- objective weights (`VITE_GENE_OBJ_*`)

Reference implementation:
- `readGeneAgentConfig()` in `GeneAgentConfig.ts`.
