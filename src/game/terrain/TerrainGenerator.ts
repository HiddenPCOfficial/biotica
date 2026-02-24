import type { TerrainGenConfig, TerrainMap } from '../../types/terrain'
import { TileId } from '../enums/TileId'
import { clamp01, fbm, selectLandBiome, smoothstep } from '../utils/utilsNoise'

export class TerrainGenerator {
  generate(cfg: TerrainGenConfig): TerrainMap {
    const width = Math.max(1, Math.floor(cfg.width))
    const height = Math.max(1, Math.floor(cfg.height))
    const seed = cfg.seed | 0

    const heightScale = cfg.heightScale ?? 90
    const moistureScale = cfg.moistureScale ?? 72
    const tempScale = cfg.tempScale ?? 110

    const seaLevel = cfg.seaLevel ?? 0.42
    const shallowWater = Math.max(seaLevel, cfg.shallowWater ?? 0.48)
    const beachBand = cfg.beachBand ?? 0.03
    const mountainLevel = cfg.mountainLevel ?? 0.8
    const snowTemp = cfg.snowTemp ?? 0.34

    // Soglia interna per distinguere oceano profondo da acqua bassa.
    const deepWaterThreshold = Math.max(0, seaLevel - 0.08)
    const tiles = new Uint8Array(width * height)

    for (let y = 0; y < height; y++) {
      const yNorm = height <= 1 ? 0.5 : y / (height - 1)
      const latTemp = 1 - Math.abs(yNorm * 2 - 1)

      for (let x = 0; x < width; x++) {
        const i = y * width + x

        let cellHeight = fbm(seed + 10, x, y, heightScale, 5)
        const moisture = fbm(seed + 20, x, y, moistureScale, 4)
        let temp = fbm(seed + 30, x, y, tempScale, 3)

        // Continent shaping per macro zone più coerenti (oceano/terra).
        cellHeight = smoothstep(cellHeight)

        // Temperatura: rumore + latitudine + raffreddamento con altitudine.
        temp = temp * 0.35 + latTemp * 0.65
        temp -= Math.max(0, cellHeight - 0.6) * 0.35
        temp = clamp01(temp)

        let tile: TileId
        if (cellHeight < seaLevel) {
          tile = cellHeight < deepWaterThreshold ? TileId.DeepWater : TileId.ShallowWater
        } else if (cellHeight < shallowWater) {
          tile = TileId.ShallowWater
        } else {
          tile = selectLandBiome(cellHeight, moisture, temp, {
            shallowWater,
            beachBand,
            mountainLevel,
            snowTemp,
          })
        }

        tiles[i] = tile
      }
    }

    return { width, height, seed, tiles }
  }
}
