export type SimTuning = {
  plantBaseGrowth: number
  plantMaxBiomass: number
  plantDecay: number

  baseMetabolism: number
  reproductionThreshold: number
  reproductionCost: number
  mutationRate: number

  eventRate: number
  simulationSpeed: number
}

export const DEFAULT_SIM_TUNING: SimTuning = {
  plantBaseGrowth: 1.25,
  plantMaxBiomass: 220,
  plantDecay: 0.24,

  baseMetabolism: 1.0,
  reproductionThreshold: 1.0,
  reproductionCost: 1.0,
  mutationRate: 0.07,

  eventRate: 1.0,
  simulationSpeed: 1.0,
}

export type SimTuningKey = keyof SimTuning

export function clampTuningValue(key: SimTuningKey, value: number): number {
  switch (key) {
    case 'plantBaseGrowth':
      return Math.max(0, Math.min(6, value))
    case 'plantMaxBiomass':
      return Math.max(20, Math.min(255, value))
    case 'plantDecay':
      return Math.max(0, Math.min(5, value))
    case 'baseMetabolism':
      return Math.max(0.2, Math.min(3.2, value))
    case 'reproductionThreshold':
      return Math.max(0.5, Math.min(2.5, value))
    case 'reproductionCost':
      return Math.max(0.4, Math.min(2.5, value))
    case 'mutationRate':
      return Math.max(0, Math.min(0.25, value))
    case 'eventRate':
      return Math.max(0, Math.min(4, value))
    case 'simulationSpeed':
      return Math.max(0.1, Math.min(8, value))
    default:
      return value
  }
}

export function mergeTuning(
  base: SimTuning,
  patch: Partial<SimTuning>,
): SimTuning {
  return {
    plantBaseGrowth: clampTuningValue('plantBaseGrowth', patch.plantBaseGrowth ?? base.plantBaseGrowth),
    plantMaxBiomass: clampTuningValue('plantMaxBiomass', patch.plantMaxBiomass ?? base.plantMaxBiomass),
    plantDecay: clampTuningValue('plantDecay', patch.plantDecay ?? base.plantDecay),
    baseMetabolism: clampTuningValue('baseMetabolism', patch.baseMetabolism ?? base.baseMetabolism),
    reproductionThreshold: clampTuningValue('reproductionThreshold', patch.reproductionThreshold ?? base.reproductionThreshold),
    reproductionCost: clampTuningValue('reproductionCost', patch.reproductionCost ?? base.reproductionCost),
    mutationRate: clampTuningValue('mutationRate', patch.mutationRate ?? base.mutationRate),
    eventRate: clampTuningValue('eventRate', patch.eventRate ?? base.eventRate),
    simulationSpeed: clampTuningValue('simulationSpeed', patch.simulationSpeed ?? base.simulationSpeed),
  }
}
