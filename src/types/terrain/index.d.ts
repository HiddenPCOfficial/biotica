export type TerrainMap = {
  width: number
  height: number
  seed: number
  tiles: Uint8Array
}

export type TerrainGenConfig = {
  width: number
  height: number
  seed: number

  heightScale?: number
  moistureScale?: number
  tempScale?: number

  seaLevel?: number
  shallowWater?: number
  beachBand?: number

  mountainLevel?: number
  snowTemp?: number
}
