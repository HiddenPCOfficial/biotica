import { TileId } from '../../../game/enums/TileId'
import type { OverlayActionHandler, OverlayPage, SimulationSnapshot } from '../types'

function biomeLabel(value: number): string {
  return TileId[value] ?? `Tile-${value}`
}

function formatProperties(value: {
  nutrition?: number
  durability?: number
  damage?: number
  buildValue?: number
  storage?: number
  weight: number
}): string {
  const parts = [`w:${value.weight.toFixed(2)}`]
  if (typeof value.nutrition === 'number') parts.push(`nut:${value.nutrition.toFixed(1)}`)
  if (typeof value.durability === 'number') parts.push(`dur:${value.durability.toFixed(1)}`)
  if (typeof value.damage === 'number') parts.push(`dmg:${value.damage.toFixed(1)}`)
  if (typeof value.buildValue === 'number') parts.push(`build:${value.buildValue.toFixed(1)}`)
  if (typeof value.storage === 'number') parts.push(`store:${value.storage.toFixed(1)}`)
  return parts.join(' | ')
}

function formatMaterialResistance(item: {
  hardness: number
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
  rarity: number
}): string {
  return [
    `hard:${item.hardness.toFixed(2)}`,
    `heat:${item.heatResistance.toFixed(2)}`,
    `lava:${item.lavaResistance.toFixed(2)}`,
    `haz:${item.hazardResistance.toFixed(2)}`,
    `rar:${item.rarity.toFixed(2)}`,
  ].join(' | ')
}

/**
 * Tab Items/Materials/Structures:
 * - cataloghi immutabili + stato runtime nodi/strutture
 */
export class ItemsPage implements OverlayPage {
  readonly id = 'items' as const
  readonly title = 'Items'
  readonly root = document.createElement('section')

  private readonly summaryLine = document.createElement('div')

  private readonly catalogTable = document.createElement('table')
  private readonly catalogBody = document.createElement('tbody')

  private readonly craftTable = document.createElement('table')
  private readonly craftBody = document.createElement('tbody')

  private readonly inventoryTable = document.createElement('table')
  private readonly inventoryBody = document.createElement('tbody')

  private readonly groundList = document.createElement('ul')

  private readonly materialsTable = document.createElement('table')
  private readonly materialsBody = document.createElement('tbody')

  private readonly resourcesLine = document.createElement('div')
  private readonly resourcesList = document.createElement('ul')

  private readonly structuresCatalogTable = document.createElement('table')
  private readonly structuresCatalogBody = document.createElement('tbody')

  private readonly structuresWorldList = document.createElement('ul')

  private readonly selectedStructurePanel = document.createElement('div')

  constructor(private readonly emitAction: OverlayActionHandler) {
    this.root.className = 'bi-ov-page bi-ov-grid'

    const summaryCard = document.createElement('article')
    summaryCard.className = 'bi-ov-card'
    summaryCard.append(this.createTitle('Items Summary'))
    this.summaryLine.className = 'bi-ov-inline-stat'
    this.summaryLine.textContent = 'Catalog not initialized.'
    summaryCard.appendChild(this.summaryLine)

    const catalogCard = document.createElement('article')
    catalogCard.className = 'bi-ov-card'
    catalogCard.append(this.createTitle('A) World Items Catalog'))
    const catalogWrap = document.createElement('div')
    catalogWrap.className = 'bi-ov-table-wrap bi-ov-scroll bi-ov-items-catalog'
    this.catalogTable.className = 'bi-ov-table'
    const catalogHead = document.createElement('thead')
    catalogHead.innerHTML = '<tr><th>name</th><th>category</th><th>properties</th><th>spawn</th><th>biomes</th></tr>'
    this.catalogTable.append(catalogHead, this.catalogBody)
    catalogWrap.appendChild(this.catalogTable)
    catalogCard.appendChild(catalogWrap)

    const midSplit = document.createElement('div')
    midSplit.className = 'bi-ov-split'

    const craftCard = document.createElement('article')
    craftCard.className = 'bi-ov-card'
    craftCard.append(this.createTitle('B) Craftable Items'))
    const craftWrap = document.createElement('div')
    craftWrap.className = 'bi-ov-table-wrap bi-ov-scroll bi-ov-items-craft'
    this.craftTable.className = 'bi-ov-table'
    const craftHead = document.createElement('thead')
    craftHead.innerHTML = '<tr><th>result</th><th>tech</th><th>required</th><th>eff</th><th>state</th></tr>'
    this.craftTable.append(craftHead, this.craftBody)
    craftWrap.appendChild(this.craftTable)
    craftCard.appendChild(craftWrap)

    const inventoryCard = document.createElement('article')
    inventoryCard.className = 'bi-ov-card'
    inventoryCard.append(this.createTitle('C) Selected Faction Inventory'))
    const inventoryWrap = document.createElement('div')
    inventoryWrap.className = 'bi-ov-table-wrap bi-ov-scroll bi-ov-items-inventory'
    this.inventoryTable.className = 'bi-ov-table'
    const inventoryHead = document.createElement('thead')
    inventoryHead.innerHTML = '<tr><th>item</th><th>category</th><th>qty</th></tr>'
    this.inventoryTable.append(inventoryHead, this.inventoryBody)
    inventoryWrap.appendChild(this.inventoryTable)
    inventoryCard.appendChild(inventoryWrap)

    midSplit.append(craftCard, inventoryCard)

    const groundCard = document.createElement('article')
    groundCard.className = 'bi-ov-card'
    groundCard.append(this.createTitle('D) World Ground Items'))
    this.groundList.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll bi-ov-items-ground-list'
    groundCard.appendChild(this.groundList)

    const materialsCard = document.createElement('article')
    materialsCard.className = 'bi-ov-card'
    materialsCard.append(this.createTitle('E) Material Catalog (Immutable)'))
    const materialsWrap = document.createElement('div')
    materialsWrap.className = 'bi-ov-table-wrap bi-ov-scroll'
    this.materialsTable.className = 'bi-ov-table'
    const materialsHead = document.createElement('thead')
    materialsHead.innerHTML = '<tr><th>material</th><th>cat</th><th>resistance</th><th>biomes</th></tr>'
    this.materialsTable.append(materialsHead, this.materialsBody)
    materialsWrap.appendChild(this.materialsTable)
    materialsCard.appendChild(materialsWrap)

    const resourcesCard = document.createElement('article')
    resourcesCard.className = 'bi-ov-card'
    resourcesCard.append(this.createTitle('F) Resource Nodes + Volcano'))
    this.resourcesLine.className = 'bi-ov-inline-stat'
    resourcesCard.appendChild(this.resourcesLine)
    this.resourcesList.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll'
    resourcesCard.appendChild(this.resourcesList)

    const structuresCatalogCard = document.createElement('article')
    structuresCatalogCard.className = 'bi-ov-card'
    structuresCatalogCard.append(this.createTitle('G) Structure Catalog + Buildability'))
    const structuresCatalogWrap = document.createElement('div')
    structuresCatalogWrap.className = 'bi-ov-table-wrap bi-ov-scroll'
    this.structuresCatalogTable.className = 'bi-ov-table'
    const structuresCatalogHead = document.createElement('thead')
    structuresCatalogHead.innerHTML = '<tr><th>name</th><th>tech</th><th>utility</th><th>cost</th><th>state</th></tr>'
    this.structuresCatalogTable.append(structuresCatalogHead, this.structuresCatalogBody)
    structuresCatalogWrap.appendChild(this.structuresCatalogTable)
    structuresCatalogCard.appendChild(structuresCatalogWrap)

    const structuresWorldCard = document.createElement('article')
    structuresWorldCard.className = 'bi-ov-card'
    structuresWorldCard.append(this.createTitle('H) Placed Structures + Inspector'))
    this.selectedStructurePanel.className = 'bi-ov-text-block'
    this.selectedStructurePanel.style.marginBottom = '8px'
    this.selectedStructurePanel.textContent = 'Select a structure on map or in list.'
    structuresWorldCard.appendChild(this.selectedStructurePanel)
    this.structuresWorldList.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll'
    structuresWorldCard.appendChild(this.structuresWorldList)

    this.root.append(
      summaryCard,
      catalogCard,
      midSplit,
      groundCard,
      materialsCard,
      resourcesCard,
      structuresCatalogCard,
      structuresWorldCard,
    )
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-active', visible)
  }

  update(snapshot: SimulationSnapshot): void {
    const items = snapshot.items
    if (!items) {
      this.summaryLine.textContent = 'Catalog not initialized.'
      this.catalogBody.innerHTML = '<tr><td colspan="5">No catalog.</td></tr>'
      this.craftBody.innerHTML = '<tr><td colspan="5">No recipes.</td></tr>'
      this.inventoryBody.innerHTML = '<tr><td colspan="3">No inventory.</td></tr>'
      this.groundList.innerHTML = '<li class="bi-ov-list-item">No ground items.</li>'
      this.materialsBody.innerHTML = '<tr><td colspan="4">No materials.</td></tr>'
      this.resourcesLine.textContent = 'No resources.'
      this.resourcesList.innerHTML = '<li class="bi-ov-list-item">No resource nodes.</li>'
      this.structuresCatalogBody.innerHTML = '<tr><td colspan="5">No structures.</td></tr>'
      this.structuresWorldList.innerHTML = '<li class="bi-ov-list-item">No placed structures.</li>'
      this.selectedStructurePanel.textContent = 'No selected structure.'
      return
    }

    this.summaryLine.innerHTML = [
      `<strong>catalog seed</strong> ${items.catalogSeed}`,
      `<strong>items</strong> ${items.catalog.length}`,
      `<strong>materials</strong> ${items.materialsCatalog.length}`,
      `<strong>structures</strong> ${items.structuresCatalog.length}`,
      `<strong>placed</strong> ${items.structuresWorld.length}`,
      `<strong>faction</strong> ${items.selectedFactionName ?? '-'}`,
      `<strong>tech</strong> ${items.selectedFactionTechLevel.toFixed(2)}`,
    ].join(' | ')

    this.catalogBody.innerHTML = ''
    for (let i = 0; i < items.catalog.length; i++) {
      const item = items.catalog[i]
      if (!item) continue
      const tr = document.createElement('tr')
      tr.innerHTML = [
        `<td>${item.name}</td>`,
        `<td>${item.category}</td>`,
        `<td>${formatProperties(item.baseProperties)}</td>`,
        `<td>${item.naturalSpawn ? 'yes' : 'no'}</td>`,
        `<td>${item.allowedBiomes.map((biome) => biomeLabel(biome)).join(', ')}</td>`,
      ].join('')
      this.catalogBody.appendChild(tr)
    }
    if (this.catalogBody.childElementCount === 0) {
      this.catalogBody.innerHTML = '<tr><td colspan="5">No catalog.</td></tr>'
    }

    this.craftBody.innerHTML = ''
    for (let i = 0; i < items.craftableItems.length; i++) {
      const recipe = items.craftableItems[i]
      if (!recipe) continue
      const tr = document.createElement('tr')
      if (recipe.newlyUnlocked) {
        tr.classList.add('bi-ov-items-new-unlock')
      }
      const status = recipe.unlocked
        ? recipe.canCraft
          ? 'craftable'
          : `missing: ${recipe.missingItems.join(', ')}`
        : 'locked'

      tr.innerHTML = [
        `<td>${recipe.resultItemName}</td>`,
        `<td>${recipe.requiredTechLevel.toFixed(2)}</td>`,
        `<td>${recipe.requiredItemNames.join(' + ')}</td>`,
        `<td>x${recipe.efficiencyModifier.toFixed(2)}</td>`,
        `<td>${status}</td>`,
      ].join('')
      this.craftBody.appendChild(tr)
    }
    if (this.craftBody.childElementCount === 0) {
      this.craftBody.innerHTML = '<tr><td colspan="5">No recipes.</td></tr>'
    }

    this.inventoryBody.innerHTML = ''
    for (let i = 0; i < items.factionInventory.length; i++) {
      const row = items.factionInventory[i]
      if (!row) continue
      const tr = document.createElement('tr')
      tr.innerHTML = [
        `<td>${row.itemName}</td>`,
        `<td>${row.category}</td>`,
        `<td>${row.quantity.toFixed(0)}</td>`,
      ].join('')
      this.inventoryBody.appendChild(tr)
    }
    if (this.inventoryBody.childElementCount === 0) {
      this.inventoryBody.innerHTML = '<tr><td colspan="3">Inventory empty.</td></tr>'
    }

    this.groundList.innerHTML = ''
    const groundRows = items.groundItems.slice(0, 120)
    for (let i = 0; i < groundRows.length; i++) {
      const row = groundRows[i]
      if (!row) continue
      const li = document.createElement('li')
      li.className = 'bi-ov-list-item bi-ov-items-ground-item'

      const line = document.createElement('div')
      line.innerHTML = `<strong>${row.itemName}</strong> | qty ${row.quantity} | (${row.x}, ${row.y}) | ${row.naturalSpawn ? 'natural' : 'dropped'} | age ${row.ageTicks}`

      const focusBtn = document.createElement('button')
      focusBtn.type = 'button'
      focusBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
      focusBtn.textContent = 'Focus'
      focusBtn.addEventListener('click', () => {
        this.emitAction('focusWorldPoint', { x: row.x, y: row.y })
      })

      li.append(line, focusBtn)
      this.groundList.appendChild(li)
    }
    if (this.groundList.childElementCount === 0) {
      this.groundList.innerHTML = '<li class="bi-ov-list-item">No ground items.</li>'
    }

    this.materialsBody.innerHTML = ''
    for (let i = 0; i < items.materialsCatalog.length; i++) {
      const material = items.materialsCatalog[i]
      if (!material) continue
      const tr = document.createElement('tr')
      tr.innerHTML = [
        `<td>${material.id}</td>`,
        `<td>${material.category}</td>`,
        `<td>${formatMaterialResistance(material)}</td>`,
        `<td>${material.allowedBiomes.map((biome) => biomeLabel(biome)).join(', ')}</td>`,
      ].join('')
      this.materialsBody.appendChild(tr)
    }
    if (this.materialsBody.childElementCount === 0) {
      this.materialsBody.innerHTML = '<tr><td colspan="4">No materials.</td></tr>'
    }

    const volcano = items.volcano
    this.resourcesLine.innerHTML = [
      `<strong>nodes</strong> ${items.resourcesDensity.totalNodes}`,
      `<strong>trees</strong> ${items.resourcesDensity.treeNodes}`,
      `<strong>stone</strong> ${items.resourcesDensity.stoneNodes}`,
      `<strong>iron</strong> ${items.resourcesDensity.ironNodes}`,
      `<strong>clay</strong> ${items.resourcesDensity.clayNodes}`,
      `<strong>volcano</strong> ${volcano ? `${volcano.anchorX},${volcano.anchorY}` : '-'}`,
      `<strong>next eruption</strong> ${volcano ? volcano.nextEruptionTick : '-'}`,
      `<strong>active</strong> ${volcano?.activeEruptionId ?? 'no'}`,
    ].join(' | ')

    this.resourcesList.innerHTML = ''
    const resourceRows = items.resourceNodes.slice(0, 160)
    for (let i = 0; i < resourceRows.length; i++) {
      const node = resourceRows[i]
      if (!node) continue
      const li = document.createElement('li')
      li.className = 'bi-ov-list-item'
      li.innerHTML = [
        `<strong>${node.type}</strong>`,
        `mat=${node.yieldsMaterialId}`,
        `amt=${node.amount}`,
        `regen=${node.regenRate.toFixed(2)}`,
        `tool=${node.requiredToolTag ?? '-'}`,
        `(${node.x}, ${node.y})`,
      ].join(' | ')

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'bi-ov-btn bi-ov-btn-ghost'
      btn.textContent = 'Focus'
      btn.addEventListener('click', () => {
        this.emitAction('focusWorldPoint', { x: node.x, y: node.y })
      })

      li.appendChild(btn)
      this.resourcesList.appendChild(li)
    }
    if (this.resourcesList.childElementCount === 0) {
      this.resourcesList.innerHTML = '<li class="bi-ov-list-item">No resource nodes.</li>'
    }

    this.structuresCatalogBody.innerHTML = ''
    const buildableById = new Map(items.structuresBuildable.map((row) => [row.id, row]))
    for (let i = 0; i < items.structuresCatalog.length; i++) {
      const structure = items.structuresCatalog[i]
      if (!structure) continue
      const buildable = buildableById.get(structure.id)
      const status = buildable
        ? buildable.unlocked
          ? buildable.missingMaterials.length === 0
            ? 'buildable'
            : `missing ${buildable.missingMaterials.join(', ')}`
          : 'locked'
        : 'unknown'

      const tr = document.createElement('tr')
      tr.innerHTML = [
        `<td>${structure.name} (${structure.size.w}x${structure.size.h})</td>`,
        `<td>${structure.requiredTechLevel.toFixed(1)}</td>`,
        `<td>${structure.utilityTags.join(', ')}</td>`,
        `<td>${structure.buildCost.map((cost) => `${cost.materialId}:${cost.amount}`).join(' + ')}</td>`,
        `<td>${status}</td>`,
      ].join('')
      this.structuresCatalogBody.appendChild(tr)
    }
    if (this.structuresCatalogBody.childElementCount === 0) {
      this.structuresCatalogBody.innerHTML = '<tr><td colspan="5">No structures.</td></tr>'
    }

    this.structuresWorldList.innerHTML = ''
    const worldStructureRows = items.structuresWorld.slice(0, 220)
    for (let i = 0; i < worldStructureRows.length; i++) {
      const structure = worldStructureRows[i]
      if (!structure) continue
      const li = document.createElement('li')
      li.className = 'bi-ov-list-item'
      li.innerHTML = `<strong>${structure.name}</strong> | ${structure.state} | hp ${structure.hp.toFixed(0)}/${structure.maxHp.toFixed(0)} | owner ${structure.factionId} | (${structure.x}, ${structure.y})`

      const focusBtn = document.createElement('button')
      focusBtn.type = 'button'
      focusBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
      focusBtn.textContent = 'Focus'
      focusBtn.addEventListener('click', () => {
        this.emitAction('focusWorldPoint', { x: structure.x, y: structure.y })
      })

      li.appendChild(focusBtn)
      this.structuresWorldList.appendChild(li)
    }
    if (this.structuresWorldList.childElementCount === 0) {
      this.structuresWorldList.innerHTML = '<li class="bi-ov-list-item">No placed structures.</li>'
    }

    if (!items.selectedStructure) {
      this.selectedStructurePanel.textContent = 'No selected structure.'
    } else {
      const structure = items.selectedStructure
      this.selectedStructurePanel.innerHTML = [
        `<strong>${structure.name}</strong> [${structure.id}]`,
        `state=${structure.state}`,
        `hp=${structure.hp.toFixed(0)}/${structure.maxHp.toFixed(0)}`,
        `owner=${structure.ownerFactionId}`,
        `utility=${structure.utilityTags.join(', ') || '-'}`,
        `cost=${structure.buildCost.map((row) => `${row.materialId}:${row.amount}`).join(' + ')}`,
        `res(heat/lava/hazard)=${structure.heatResistance.toFixed(2)}/${structure.lavaResistance.toFixed(2)}/${structure.hazardResistance.toFixed(2)}`,
        `at (${structure.x}, ${structure.y}) size ${structure.w}x${structure.h}`,
      ].join(' | ')

      const actions = document.createElement('div')
      actions.style.marginTop = '6px'

      const focusBtn = document.createElement('button')
      focusBtn.type = 'button'
      focusBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
      focusBtn.textContent = 'Focus'
      focusBtn.addEventListener('click', () => {
        this.emitAction('focusWorldPoint', { x: structure.x, y: structure.y })
      })

      const dismantleBtn = document.createElement('button')
      dismantleBtn.type = 'button'
      dismantleBtn.className = 'bi-ov-btn bi-ov-btn-danger'
      dismantleBtn.textContent = 'Dismantle'
      dismantleBtn.addEventListener('click', () => {
        this.emitAction('dismantleStructure', { structureId: structure.id })
      })

      actions.append(focusBtn, dismantleBtn)
      this.selectedStructurePanel.appendChild(actions)
    }
  }

  destroy(): void {
    this.root.remove()
  }

  private createTitle(text: string): HTMLElement {
    const title = document.createElement('h3')
    title.className = 'bi-ov-card-title'
    title.textContent = text
    return title
  }
}
