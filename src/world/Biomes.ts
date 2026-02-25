import { TileId } from '../game/enums/TileId'

export function isWaterTile(tile: TileId): boolean {
  return tile === TileId.DeepWater || tile === TileId.ShallowWater
}

export function isPlantBlockedTile(tile: TileId): boolean {
  return isWaterTile(tile) || tile === TileId.Lava || tile === TileId.Scorched
}

export function isLandTile(tile: TileId): boolean {
  return !isWaterTile(tile) && tile !== TileId.Lava
}

export function isVolcanoCandidate(tile: TileId): boolean {
  return tile === TileId.Mountain || tile === TileId.Rock || tile === TileId.Hills || tile === TileId.Snow
}

export function humidityBase(tile: TileId): number {
  switch (tile) {
    case TileId.DeepWater:
    case TileId.ShallowWater:
      return 245
    case TileId.Beach:
      return 150
    case TileId.Forest:
    case TileId.Jungle:
      return 205
    case TileId.Swamp:
      return 225
    case TileId.Desert:
      return 28
    case TileId.Savanna:
      return 95
    case TileId.Hills:
      return 118
    case TileId.Mountain:
    case TileId.Snow:
      return 88
    case TileId.Rock:
    case TileId.Scorched:
      return 35
    case TileId.Lava:
      return 0
    case TileId.Grassland:
    default:
      return 140
  }
}

export function temperatureBase(tile: TileId): number {
  switch (tile) {
    case TileId.DeepWater:
      return 96
    case TileId.ShallowWater:
      return 105
    case TileId.Snow:
      return 42
    case TileId.Mountain:
      return 76
    case TileId.Hills:
      return 106
    case TileId.Desert:
      return 206
    case TileId.Savanna:
      return 185
    case TileId.Jungle:
      return 182
    case TileId.Forest:
      return 132
    case TileId.Swamp:
      return 148
    case TileId.Beach:
      return 154
    case TileId.Rock:
      return 128
    case TileId.Lava:
      return 255
    case TileId.Scorched:
      return 178
    case TileId.Grassland:
    default:
      return 138
  }
}

export function fertilityBase(tile: TileId): number {
  switch (tile) {
    case TileId.DeepWater:
      return 18
    case TileId.ShallowWater:
      return 30
    case TileId.Beach:
      return 38
    case TileId.Forest:
    case TileId.Jungle:
      return 210
    case TileId.Swamp:
      return 180
    case TileId.Grassland:
      return 165
    case TileId.Savanna:
      return 110
    case TileId.Desert:
      return 18
    case TileId.Hills:
      return 92
    case TileId.Mountain:
    case TileId.Snow:
      return 28
    case TileId.Rock:
      return 36
    case TileId.Scorched:
      return 22
    case TileId.Lava:
      return 0
    default:
      return 88
  }
}
