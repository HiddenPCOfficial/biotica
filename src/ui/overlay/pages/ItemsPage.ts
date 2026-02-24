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

/**
 * Tab Items:
 * A) catalogo oggetti base mondo (immutabile)
 * B) craftabili correnti con lock tech
 * C) inventario fazione selezionata
 * D) oggetti al suolo cliccabili (focus camera)
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

    this.root.append(summaryCard, catalogCard, midSplit, groundCard)
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
      return
    }

    this.summaryLine.innerHTML = [
      `<strong>catalog seed</strong> ${items.catalogSeed}`,
      `<strong>items</strong> ${items.catalog.length}`,
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

    this.craftBody.innerHTML = ''
    const craftRows = items.craftableItems.length > 0
      ? items.craftableItems
      : []
    for (let i = 0; i < craftRows.length; i++) {
      const recipe = craftRows[i]
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
      tr.innerHTML = [`<td>${row.itemName}</td>`, `<td>${row.category}</td>`, `<td>${row.quantity.toFixed(0)}</td>`].join('')
      this.inventoryBody.appendChild(tr)
    }
    if (this.inventoryBody.childElementCount === 0) {
      this.inventoryBody.innerHTML = '<tr><td colspan="3">Inventory empty.</td></tr>'
    }

    this.groundList.innerHTML = ''
    const groundRows = items.groundItems.slice(0, 160)
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
