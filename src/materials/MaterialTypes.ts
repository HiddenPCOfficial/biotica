import { TileId } from '../game/enums/TileId'

export type BiomeType = TileId

export type MaterialCategory = 'raw' | 'processed'

export type MaterialId =
  | 'wood'
  | 'stone'
  | 'iron_ore'
  | 'iron_ingot'
  | 'clay'
  | 'charcoal'
  | 'sand'
  | 'obsidian'

export type MaterialDefinition = {
  id: MaterialId | string
  category: MaterialCategory
  hardness: number
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
  rarity: number
  allowedBiomes: BiomeType[]
}

export type FrozenMaterialDefinition = Readonly<{
  id: string
  category: MaterialCategory
  hardness: number
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
  rarity: number
  allowedBiomes: ReadonlyArray<BiomeType>
}>
