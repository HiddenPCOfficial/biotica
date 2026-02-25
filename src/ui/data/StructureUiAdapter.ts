export type StructureBuildCostRow = {
  materialId: string
  amount: number
}

export type StructureCatalogRow = {
  id: string
  name: string
  utilityTags: string[]
  requiredTechLevel: number
  buildCost: StructureBuildCostRow[]
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
}

export type StructureInstanceRow = {
  id: string
  defId: string
  name: string
  factionId: string
  factionName: string
  x: number
  y: number
  state: 'building' | 'active' | 'damaged' | 'abandoned' | string
  hp: number
  maxHp: number
  builtAtTick: number
}

export type StructureFactionBuildState = {
  factionId: string
  factionName: string
  techLevel: number
  literacyLevel: number
  materials: Record<string, number>
}

export type StructureUiSource = {
  catalog: StructureCatalogRow[]
  instances: StructureInstanceRow[]
  factions: StructureFactionBuildState[]
  activeFactionId?: string | null
  worldSize?: {
    width: number
    height: number
  }
}

export type StructureStatus = 'buildable' | 'locked' | 'missing_materials'

export type StructureBuildStatus = {
  status: StructureStatus
  reason: string
  reasons: string[]
  missingMaterials: Array<{ materialId: string; missing: number }>
}

export type StructureRow = {
  defId: string
  name: string
  iconColor: string
  utilityTags: string[]
  requiredTechLevel: number
  costSummary: string
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
  status: StructureStatus
  statusLabel: string
  statusReason: string
}

export type StructureEffects = {
  storageCapacity: number
  restRecovery: number
  enablesSmelting: boolean
  craftingStations: string[]
  territoryInfluenceBonus: number
}

export type StructureDetails = {
  defId: string
  name: string
  utilityDescription: string
  utilityTags: string[]
  requiredTechLevel: number
  requiredLiteracy: number
  buildCost: StructureBuildCostRow[]
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
  buildStatus: StructureBuildStatus
  effects: StructureEffects
}

export type StructureBuildHint = {
  x: number
  y: number
  reasonCodes: string[]
  summary: string
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function colorForTags(tags: readonly string[]): string {
  const joined = tags.join('|')
  if (joined.includes('defense')) return '#88a9d8'
  if (joined.includes('smelting')) return '#f2a266'
  if (joined.includes('storage')) return '#9ab6a0'
  if (joined.includes('farming')) return '#81c782'
  if (joined.includes('crafting')) return '#b59fd3'
  return '#9dc4ff'
}

function utilityDescriptionFor(tags: readonly string[]): string {
  if (tags.includes('smelting') && tags.includes('crafting')) {
    return 'Industrial hub: enables smelting chains and advanced crafting throughput.'
  }
  if (tags.includes('smelting')) {
    return 'Thermal processing structure for ore refinement and heat-based conversion.'
  }
  if (tags.includes('storage')) {
    return 'Logistics structure that increases available stockpile capacity and stability.'
  }
  if (tags.includes('defense')) {
    return 'Defensive structure that strengthens local control and hazard resilience.'
  }
  if (tags.includes('farming')) {
    return 'Food infrastructure for regular biomass extraction and growth sustainment.'
  }
  if (tags.includes('shelter')) {
    return 'Basic shelter improving recovery, survival and settlement continuity.'
  }
  return 'General-purpose infrastructure block used in settlement development.'
}

function statusLabel(status: StructureStatus): string {
  if (status === 'buildable') return 'Buildable'
  if (status === 'missing_materials') return 'Missing Materials'
  return 'Locked'
}

function normalizeMaterialMap(value: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  if (!value) {
    return out
  }
  const entries = Object.entries(value)
  for (let i = 0; i < entries.length; i++) {
    const [materialId, amount] = entries[i] ?? []
    if (!materialId) continue
    const safeAmount = Number(amount)
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) continue
    out[materialId] = Math.floor(safeAmount)
  }
  return out
}

function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function parseCatalog(input: unknown): StructureCatalogRow[] {
  if (!Array.isArray(input)) return []
  const out: StructureCatalogRow[] = []

  for (let i = 0; i < input.length; i++) {
    const row = input[i]
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const id = typeof rec.id === 'string' ? rec.id : ''
    if (!id) continue
    const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name : id
    const requiredTechLevel = Number(rec.requiredTechLevel)
    const utilityTags = Array.isArray(rec.utilityTags)
      ? rec.utilityTags.filter((tag): tag is string => typeof tag === 'string')
      : []
    const cost = Array.isArray(rec.buildCost)
      ? rec.buildCost
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null
            const obj = entry as Record<string, unknown>
            if (typeof obj.materialId !== 'string') return null
            const amount = Number(obj.amount)
            if (!Number.isFinite(amount) || amount <= 0) return null
            return {
              materialId: obj.materialId,
              amount: Math.floor(amount),
            }
          })
          .filter((entry): entry is StructureBuildCostRow => entry !== null)
      : []

    out.push({
      id,
      name,
      utilityTags,
      requiredTechLevel: Number.isFinite(requiredTechLevel) ? requiredTechLevel : 0,
      buildCost: cost,
      heatResistance: clamp01(Number(rec.heatResistance)),
      lavaResistance: clamp01(Number(rec.lavaResistance)),
      hazardResistance: clamp01(Number(rec.hazardResistance)),
    })
  }

  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

function parseInstances(input: unknown): StructureInstanceRow[] {
  if (!Array.isArray(input)) return []
  const out: StructureInstanceRow[] = []

  for (let i = 0; i < input.length; i++) {
    const row = input[i]
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const id = typeof rec.id === 'string' ? rec.id : ''
    const defId = typeof rec.defId === 'string' ? rec.defId : ''
    if (!id || !defId) continue

    out.push({
      id,
      defId,
      name: typeof rec.name === 'string' && rec.name.trim() ? rec.name : defId,
      factionId: typeof rec.factionId === 'string' ? rec.factionId : 'unknown',
      factionName: typeof rec.factionName === 'string' ? rec.factionName : (typeof rec.factionId === 'string' ? rec.factionId : 'unknown'),
      x: Math.floor(Number(rec.x) || 0),
      y: Math.floor(Number(rec.y) || 0),
      state: typeof rec.state === 'string' ? rec.state : 'active',
      hp: Math.floor(Number(rec.hp) || 0),
      maxHp: Math.floor(Number(rec.maxHp) || 1),
      builtAtTick: Math.floor(Number(rec.builtAtTick) || 0),
    })
  }

  out.sort((a, b) => a.builtAtTick - b.builtAtTick || a.id.localeCompare(b.id))
  return out
}

function parseFactions(input: unknown): StructureFactionBuildState[] {
  if (!Array.isArray(input)) return []
  const out: StructureFactionBuildState[] = []

  for (let i = 0; i < input.length; i++) {
    const row = input[i]
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const factionId = typeof rec.factionId === 'string' ? rec.factionId : ''
    if (!factionId) continue

    const materials = normalizeMaterialMap(
      rec.materials && typeof rec.materials === 'object' ? (rec.materials as Record<string, number>) : undefined,
    )

    out.push({
      factionId,
      factionName: typeof rec.factionName === 'string' && rec.factionName.trim() ? rec.factionName : factionId,
      techLevel: Number(rec.techLevel) || 0,
      literacyLevel: Number(rec.literacyLevel) || 0,
      materials,
    })
  }

  out.sort((a, b) => b.techLevel - a.techLevel)
  return out
}

function inferEffects(def: StructureCatalogRow): StructureEffects {
  const costWeight = def.buildCost.reduce((acc, row) => acc + row.amount, 0)
  const storageCapacity = def.utilityTags.includes('storage') ? Math.round(80 + costWeight * 3.5) : 0
  const restRecovery = def.utilityTags.includes('shelter')
    ? Number((0.08 + def.heatResistance * 0.12 + def.hazardResistance * 0.1).toFixed(2))
    : 0
  const enablesSmelting = def.utilityTags.includes('smelting')
  const craftingStations = def.utilityTags.includes('crafting') || def.utilityTags.includes('smelting')
    ? [def.id]
    : []
  const territoryInfluenceBonus = def.utilityTags.includes('defense')
    ? Math.round(4 + def.hazardResistance * 10 + def.lavaResistance * 6)
    : 0

  return {
    storageCapacity,
    restRecovery,
    enablesSmelting,
    craftingStations,
    territoryInfluenceBonus,
  }
}

export class StructureUiAdapter {
  private readonly source: StructureUiSource
  private readonly catalogById = new Map<string, StructureCatalogRow>()

  constructor(source: StructureUiSource) {
    const catalog = parseCatalog(source.catalog)
    const instances = parseInstances(source.instances)
    const factions = parseFactions(source.factions)

    this.source = {
      catalog,
      instances,
      factions,
      activeFactionId: source.activeFactionId ?? null,
      worldSize: source.worldSize,
    }

    for (let i = 0; i < catalog.length; i++) {
      const row = catalog[i]
      if (!row) continue
      this.catalogById.set(row.id, row)
    }
  }

  static fromUnknown(value: unknown): StructureUiAdapter | null {
    if (!value || typeof value !== 'object') {
      return null
    }
    const raw = value as Record<string, unknown>

    const structures = raw.structures && typeof raw.structures === 'object'
      ? (raw.structures as Record<string, unknown>)
      : null
    const civs = raw.civs && typeof raw.civs === 'object'
      ? (raw.civs as Record<string, unknown>)
      : null

    const catalog = structures?.catalog
    const instances = structures?.world
    const factions = structures?.factions ?? civs?.factionsDetailed ?? []
    const activeFactionId = typeof structures?.activeFactionId === 'string' ? structures.activeFactionId : null

    const adapter = new StructureUiAdapter({
      catalog: parseCatalog(catalog),
      instances: parseInstances(instances),
      factions: parseFactions(factions),
      activeFactionId,
      worldSize:
        structures?.worldSize && typeof structures.worldSize === 'object'
          ? {
              width: Math.floor(Number((structures.worldSize as Record<string, unknown>).width) || 0),
              height: Math.floor(Number((structures.worldSize as Record<string, unknown>).height) || 0),
            }
          : undefined,
    })

    if (adapter.getAllStructureRows().length === 0) {
      return null
    }
    return adapter
  }

  getAllStructureRows(): StructureRow[] {
    const out: StructureRow[] = []
    for (let i = 0; i < this.source.catalog.length; i++) {
      const def = this.source.catalog[i]
      if (!def) continue
      const status = this.getBuildStatus(def.id)
      out.push({
        defId: def.id,
        name: def.name,
        iconColor: colorForTags(def.utilityTags),
        utilityTags: [...def.utilityTags],
        requiredTechLevel: def.requiredTechLevel,
        costSummary: def.buildCost.map((row) => `${row.materialId} x${row.amount}`).join(', '),
        heatResistance: def.heatResistance,
        lavaResistance: def.lavaResistance,
        hazardResistance: def.hazardResistance,
        status: status.status,
        statusLabel: statusLabel(status.status),
        statusReason: status.reason,
      })
    }
    return out
  }

  getBuildStatus(defId: string): StructureBuildStatus {
    const def = this.catalogById.get(defId)
    if (!def) {
      return {
        status: 'locked',
        reason: 'Definition not found.',
        reasons: ['Definition not found.'],
        missingMaterials: [],
      }
    }

    const faction = this.getActiveFaction()
    if (!faction) {
      return {
        status: 'locked',
        reason: 'No active civilization context.',
        reasons: ['No active civilization context.'],
        missingMaterials: [],
      }
    }

    const reasons: string[] = []
    const missingMaterials: Array<{ materialId: string; missing: number }> = []

    if (faction.techLevel < def.requiredTechLevel) {
      reasons.push(`Requires tech level ${def.requiredTechLevel.toFixed(1)} (current ${faction.techLevel.toFixed(1)}).`)
    }

    const literacyReq = def.requiredTechLevel >= 3 ? 1 : 0
    if (literacyReq > 0 && faction.literacyLevel < literacyReq) {
      reasons.push(`Requires literacy level ${literacyReq} (current ${faction.literacyLevel.toFixed(1)}).`)
    }

    for (let i = 0; i < def.buildCost.length; i++) {
      const row = def.buildCost[i]
      if (!row) continue
      const available = faction.materials[row.materialId] ?? 0
      if (available >= row.amount) {
        continue
      }
      missingMaterials.push({
        materialId: row.materialId,
        missing: row.amount - available,
      })
    }

    if (reasons.length > 0) {
      return {
        status: 'locked',
        reason: reasons[0] ?? 'Locked',
        reasons,
        missingMaterials,
      }
    }

    if (missingMaterials.length > 0) {
      const missingText = missingMaterials.map((row) => `${row.materialId} x${row.missing}`).join(', ')
      return {
        status: 'missing_materials',
        reason: `Missing materials: ${missingText}`,
        reasons: [`Missing materials: ${missingText}`],
        missingMaterials,
      }
    }

    return {
      status: 'buildable',
      reason: 'All requirements satisfied.',
      reasons: ['All requirements satisfied.'],
      missingMaterials: [],
    }
  }

  getStructureDetails(defId: string): StructureDetails | null {
    const def = this.catalogById.get(defId)
    if (!def) {
      return null
    }

    return {
      defId: def.id,
      name: def.name,
      utilityDescription: utilityDescriptionFor(def.utilityTags),
      utilityTags: [...def.utilityTags],
      requiredTechLevel: def.requiredTechLevel,
      requiredLiteracy: def.requiredTechLevel >= 3 ? 1 : 0,
      buildCost: def.buildCost.map((row) => ({ ...row })),
      heatResistance: def.heatResistance,
      lavaResistance: def.lavaResistance,
      hazardResistance: def.hazardResistance,
      buildStatus: this.getBuildStatus(def.id),
      effects: inferEffects(def),
    }
  }

  listWorldInstances(defId: string): Array<{
    id: string
    x: number
    y: number
    state: string
    hp: number
    maxHp: number
    factionId: string
    factionName: string
    builtAtTick: number
  }> {
    const out: Array<{
      id: string
      x: number
      y: number
      state: string
      hp: number
      maxHp: number
      factionId: string
      factionName: string
      builtAtTick: number
    }> = []

    for (let i = 0; i < this.source.instances.length; i++) {
      const row = this.source.instances[i]
      if (!row || row.defId !== defId) continue
      out.push({
        id: row.id,
        x: row.x,
        y: row.y,
        state: row.state,
        hp: row.hp,
        maxHp: row.maxHp,
        factionId: row.factionId,
        factionName: row.factionName,
        builtAtTick: row.builtAtTick,
      })
    }

    return out
  }

  getBuildHint(defId: string): StructureBuildHint | null {
    const def = this.catalogById.get(defId)
    if (!def) {
      return null
    }

    const instances = this.listWorldInstances(defId)
    if (instances.length > 0) {
      const row = instances[0]
      if (!row) return null
      return {
        x: row.x,
        y: row.y,
        reasonCodes: ['GENE_REUSE_EXISTING_PATTERN', 'GENE_MINIMIZE_LOGISTICS_COST'],
        summary: `Existing ${def.name} near (${row.x}, ${row.y}) is a strong expansion anchor.`,
      }
    }

    const size = this.source.worldSize
    if (!size || size.width <= 0 || size.height <= 0) {
      return null
    }

    const h = hashString(defId)
    let x = Math.max(0, Math.min(size.width - 1, (h % size.width) | 0))
    let y = Math.max(0, Math.min(size.height - 1, ((h >>> 8) % size.height) | 0))
    let reasonCodes = ['GENE_DETERMINISTIC_SITE_SELECTION', 'GENE_BALANCED_SPATIAL_DISTRIBUTION']
    let summary = `Deterministic suggestion for ${def.name}: tile (${x}, ${y}).`

    if (def.utilityTags.includes('defense')) {
      const edge = h % 4
      if (edge === 0) y = 1
      if (edge === 1) x = Math.max(0, size.width - 2)
      if (edge === 2) y = Math.max(0, size.height - 2)
      if (edge === 3) x = 1
      reasonCodes = ['GENE_DEFENSE_PERIMETER', 'GENE_CHOKEPOINT_CONTROL']
      summary = `Defensive placement heuristic for ${def.name}: perimeter tile (${x}, ${y}).`
    } else if (def.utilityTags.includes('farming')) {
      x = Math.max(1, Math.min(size.width - 2, ((h >>> 4) % Math.max(2, size.width - 2)) | 0))
      y = Math.max(1, Math.min(size.height - 2, ((h >>> 12) % Math.max(2, size.height - 2)) | 0))
      reasonCodes = ['GENE_FOOD_STABILITY', 'GENE_INNER_REGION_SAFETY']
      summary = `Food-stability heuristic for ${def.name}: inner-region tile (${x}, ${y}).`
    } else if (def.utilityTags.includes('storage') || def.utilityTags.includes('crafting')) {
      x = Math.max(0, Math.min(size.width - 1, Math.floor(size.width * 0.5 + ((h & 7) - 3))))
      y = Math.max(0, Math.min(size.height - 1, Math.floor(size.height * 0.5 + (((h >>> 3) & 7) - 3))))
      reasonCodes = ['GENE_LOGISTICS_CENTRALITY', 'GENE_TRAVEL_COST_REDUCTION']
      summary = `Logistic-centrality heuristic for ${def.name}: hub tile (${x}, ${y}).`
    }

    return {
      x,
      y,
      reasonCodes,
      summary,
    }
  }

  getSource(): StructureUiSource {
    return {
      catalog: this.source.catalog.map((row) => ({
        id: row.id,
        name: row.name,
        utilityTags: [...row.utilityTags],
        requiredTechLevel: row.requiredTechLevel,
        buildCost: row.buildCost.map((cost) => ({ ...cost })),
        heatResistance: row.heatResistance,
        lavaResistance: row.lavaResistance,
        hazardResistance: row.hazardResistance,
      })),
      instances: this.source.instances.map((row) => ({ ...row })),
      factions: this.source.factions.map((row) => ({
        factionId: row.factionId,
        factionName: row.factionName,
        techLevel: row.techLevel,
        literacyLevel: row.literacyLevel,
        materials: { ...row.materials },
      })),
      activeFactionId: this.source.activeFactionId,
      worldSize: this.source.worldSize ? { ...this.source.worldSize } : undefined,
    }
  }

  private getActiveFaction(): StructureFactionBuildState | null {
    if (this.source.factions.length === 0) {
      return null
    }

    if (this.source.activeFactionId) {
      const found = this.source.factions.find((row) => row.factionId === this.source.activeFactionId)
      if (found) {
        return found
      }
    }

    return this.source.factions[0] ?? null
  }
}
