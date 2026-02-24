import { z } from 'zod'
import { SeededRng } from './SeededRng'

const CraftingTunerInputSchema = z.object({
  seed: z.number().int(),
  scarcity: z.number().min(0).max(1).default(0.5),
  hazardPressure: z.number().min(0).max(1).default(0.5),
  techLevel: z.number().min(0).max(1).default(0.4),
})

const CraftingTunerResultSchema = z.object({
  gatherWeight: z.number().min(0).max(1),
  craftWeight: z.number().min(0).max(1),
  tradeWeight: z.number().min(0).max(1),
  defenseWeight: z.number().min(0).max(1),
})

export type CraftingTunerInput = z.infer<typeof CraftingTunerInputSchema>
export type CraftingTunerResult = z.infer<typeof CraftingTunerResultSchema>

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Tuning opzionale decision-weights crafting (non LLM, deterministico).
 */
export class CraftingTunerAgent {
  tune(rawInput: CraftingTunerInput): CraftingTunerResult {
    const input = CraftingTunerInputSchema.parse(rawInput)
    const rng = new SeededRng(input.seed)

    const gather = clamp01(0.42 + input.scarcity * 0.35 + (rng.nextFloat() - 0.5) * 0.06)
    const craft = clamp01(0.28 + input.techLevel * 0.45 + (rng.nextFloat() - 0.5) * 0.06)
    const trade = clamp01(0.2 + input.techLevel * 0.24 + (1 - input.hazardPressure) * 0.2)
    const defense = clamp01(0.22 + input.hazardPressure * 0.5 + (rng.nextFloat() - 0.5) * 0.05)

    const sum = Math.max(1e-6, gather + craft + trade + defense)

    return CraftingTunerResultSchema.parse({
      gatherWeight: gather / sum,
      craftWeight: craft / sum,
      tradeWeight: trade / sum,
      defenseWeight: defense / sum,
    })
  }
}
