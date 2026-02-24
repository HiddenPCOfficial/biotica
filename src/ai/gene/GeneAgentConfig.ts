import { z } from 'zod'

import type { ObjectiveWeights } from './schemas'

export type GeneAgentConfig = {
  enabled: boolean
  populationSize: number
  generations: number
  simTicks: number
  validationSeeds: number
  mutationRate: number
  crossoverRate: number
  objectiveWeights: ObjectiveWeights
}

const GeneAgentConfigSchema = z.object({
  enabled: z.boolean(),
  populationSize: z.number().int().min(8).max(64),
  generations: z.number().int().min(2).max(12),
  simTicks: z.number().int().min(240).max(20000),
  validationSeeds: z.number().int().min(1).max(8),
  mutationRate: z.number().min(0).max(1),
  crossoverRate: z.number().min(0).max(1),
  objectiveWeights: z.object({
    survivalScore: z.number().nonnegative(),
    biodiversityScore: z.number().nonnegative(),
    stabilityScore: z.number().nonnegative(),
    resourceBalanceScore: z.number().nonnegative(),
    catastropheTolerance: z.number().nonnegative(),
  }),
})

const DEFAULT_GENE_AGENT_CONFIG: GeneAgentConfig = {
  enabled: true,
  populationSize: 16,
  generations: 4,
  simTicks: 5000,
  validationSeeds: 2,
  mutationRate: 0.15,
  crossoverRate: 0.7,
  objectiveWeights: {
    survivalScore: 1.0,
    biodiversityScore: 0.8,
    stabilityScore: 1.2,
    resourceBalanceScore: 1.0,
    catastropheTolerance: 0.6,
  },
}

function readEnv(name: string): string | undefined {
  const env = (import.meta as ImportMeta).env as Record<string, unknown> | undefined
  if (!env) return undefined
  const value = env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = readEnv(name)
  if (!raw) return fallback
  const value = raw.toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function readNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = readEnv(name)
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}

let hasLoggedResolvedConfig = false

export function readGeneAgentConfig(): GeneAgentConfig {
  const config: GeneAgentConfig = {
    enabled: readBoolean('VITE_GENE_AGENT_ENABLED', DEFAULT_GENE_AGENT_CONFIG.enabled),
    populationSize: Math.floor(
      readNumber(
        'VITE_GENE_AGENT_POPULATION',
        DEFAULT_GENE_AGENT_CONFIG.populationSize,
        8,
        64,
      ),
    ),
    generations: Math.floor(
      readNumber(
        'VITE_GENE_AGENT_GENERATIONS',
        DEFAULT_GENE_AGENT_CONFIG.generations,
        2,
        12,
      ),
    ),
    simTicks: Math.floor(
      readNumber('VITE_GENE_AGENT_SIM_TICKS', DEFAULT_GENE_AGENT_CONFIG.simTicks, 240, 20000),
    ),
    validationSeeds: Math.floor(
      readNumber(
        'VITE_GENE_AGENT_VALIDATION_SEEDS',
        DEFAULT_GENE_AGENT_CONFIG.validationSeeds,
        1,
        8,
      ),
    ),
    mutationRate: readNumber(
      'VITE_GENE_AGENT_MUTATION_RATE',
      DEFAULT_GENE_AGENT_CONFIG.mutationRate,
      0,
      1,
    ),
    crossoverRate: readNumber(
      'VITE_GENE_AGENT_CROSSOVER_RATE',
      DEFAULT_GENE_AGENT_CONFIG.crossoverRate,
      0,
      1,
    ),
    objectiveWeights: {
      survivalScore: readNumber(
        'VITE_GENE_OBJ_SURVIVAL',
        DEFAULT_GENE_AGENT_CONFIG.objectiveWeights.survivalScore,
        0,
        10,
      ),
      biodiversityScore: readNumber(
        'VITE_GENE_OBJ_BIODIVERSITY',
        DEFAULT_GENE_AGENT_CONFIG.objectiveWeights.biodiversityScore,
        0,
        10,
      ),
      stabilityScore: readNumber(
        'VITE_GENE_OBJ_STABILITY',
        DEFAULT_GENE_AGENT_CONFIG.objectiveWeights.stabilityScore,
        0,
        10,
      ),
      resourceBalanceScore: readNumber(
        'VITE_GENE_OBJ_RESOURCE_BALANCE',
        DEFAULT_GENE_AGENT_CONFIG.objectiveWeights.resourceBalanceScore,
        0,
        10,
      ),
      catastropheTolerance: readNumber(
        'VITE_GENE_OBJ_CATASTROPHE_TOLERANCE',
        DEFAULT_GENE_AGENT_CONFIG.objectiveWeights.catastropheTolerance,
        0,
        10,
      ),
    },
  }

  return GeneAgentConfigSchema.parse(config)
}

export function logResolvedGeneAgentConfig(config: GeneAgentConfig): void {
  if (hasLoggedResolvedConfig) {
    return
  }
  hasLoggedResolvedConfig = true

  console.info(
    `[GeneAgent] enabled=${config.enabled} pop=${config.populationSize} generations=${config.generations} simTicks=${config.simTicks} validationSeeds=${config.validationSeeds} mutation=${config.mutationRate.toFixed(3)} crossover=${config.crossoverRate.toFixed(3)} weights=${JSON.stringify(config.objectiveWeights)}`,
  )
}

