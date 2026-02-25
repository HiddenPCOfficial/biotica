export type CreatureLod = 'density' | 'blocks' | 'details'

const DENSITY_MAX_ZOOM = 1.5
const DETAILS_MIN_ZOOM = 3

export function resolveCreatureLod(zoom: number, forceDetail = false): CreatureLod {
  if (forceDetail || zoom >= DETAILS_MIN_ZOOM) {
    return 'details'
  }
  if (zoom < DENSITY_MAX_ZOOM) {
    return 'density'
  }
  return 'blocks'
}
