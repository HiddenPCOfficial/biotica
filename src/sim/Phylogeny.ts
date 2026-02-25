import type { Species } from './types'

export type PhylogenyNode = {
  speciesId: string
  parentSpeciesId: string | null
  createdAtTick: number
}

export function buildPhylogeny(speciesRows: readonly Species[]): PhylogenyNode[] {
  return speciesRows
    .map((species) => ({
      speciesId: species.id,
      parentSpeciesId: species.parentSpeciesId ?? null,
      createdAtTick: species.createdAtTick ?? 0,
    }))
    .sort((a, b) => a.createdAtTick - b.createdAtTick)
}
