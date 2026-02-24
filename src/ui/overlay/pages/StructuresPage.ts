import type { OverlayActionHandler, OverlayPage, SimulationSnapshot, StructureCatalogRow } from '../types'

type StatusFilter = 'all' | 'buildable' | 'locked' | 'missing'

function formatCost(cost: StructureCatalogRow['buildCost']): string {
  if (!cost || cost.length === 0) return '-'
  return cost.map((row) => `${row.materialId} x${row.amount}`).join(', ')
}

function formatRes(value: number): string {
  return `${Math.max(0, Math.min(100, value * 100)).toFixed(0)}%`
}

/**
 * Tab Structures dedicata (overlay in-world).
 */
export class StructuresPage implements OverlayPage {
  readonly id = 'structures' as const
  readonly title = 'Structures'
  readonly root = document.createElement('section')

  private readonly summary = document.createElement('div')
  private readonly searchInput = document.createElement('input')
  private readonly statusSelect = document.createElement('select')
  private readonly tableBody = document.createElement('tbody')
  private readonly inspector = document.createElement('div')
  private readonly instancesList = document.createElement('ul')

  private selectedDefId: string | null = null
  private searchText = ''
  private statusFilter: StatusFilter = 'all'

  constructor(private readonly emitAction: OverlayActionHandler) {
    this.root.className = 'bi-ov-page bi-ov-grid bi-ov-structures'

    const summaryCard = document.createElement('article')
    summaryCard.className = 'bi-ov-card'
    summaryCard.append(this.createTitle('Structures Summary'))
    this.summary.className = 'bi-ov-inline-stat'
    this.summary.textContent = 'No structure data.'
    summaryCard.appendChild(this.summary)

    const controls = document.createElement('div')
    controls.className = 'bi-ov-controls-row'

    this.searchInput.className = 'bi-ov-input'
    this.searchInput.type = 'search'
    this.searchInput.placeholder = 'Search by name or utility tag'
    this.searchInput.addEventListener('input', () => {
      this.searchText = this.searchInput.value.trim().toLowerCase()
      this.renderLastSnapshot()
    })

    this.statusSelect.className = 'bi-ov-select'
    this.addOption(this.statusSelect, 'all', 'All')
    this.addOption(this.statusSelect, 'buildable', 'Buildable')
    this.addOption(this.statusSelect, 'missing', 'Missing Materials')
    this.addOption(this.statusSelect, 'locked', 'Locked')
    this.statusSelect.addEventListener('change', () => {
      this.statusFilter = this.statusSelect.value as StatusFilter
      this.renderLastSnapshot()
    })

    controls.append(this.searchInput, this.statusSelect)

    const split = document.createElement('div')
    split.className = 'bi-ov-split'

    const tableCard = document.createElement('article')
    tableCard.className = 'bi-ov-card'
    tableCard.append(this.createTitle('Catalog'))
    tableCard.appendChild(controls)

    const wrap = document.createElement('div')
    wrap.className = 'bi-ov-table-wrap bi-ov-scroll'
    const table = document.createElement('table')
    table.className = 'bi-ov-table'
    table.innerHTML = '<thead><tr><th>Name</th><th>Utility</th><th>Tech</th><th>Cost</th><th>Status</th></tr></thead>'
    table.appendChild(this.tableBody)
    wrap.appendChild(table)
    tableCard.appendChild(wrap)

    const inspectorCard = document.createElement('article')
    inspectorCard.className = 'bi-ov-card'
    inspectorCard.append(this.createTitle('Structure Inspector'))
    this.inspector.className = 'bi-ov-text-block'
    this.inspector.textContent = 'Select a structure row.'
    inspectorCard.appendChild(this.inspector)
    const listTitle = document.createElement('div')
    listTitle.className = 'bi-ov-inline-stat'
    listTitle.innerHTML = '<strong>Built Instances</strong>'
    listTitle.style.marginTop = '10px'
    inspectorCard.appendChild(listTitle)
    this.instancesList.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll'
    inspectorCard.appendChild(this.instancesList)

    split.append(tableCard, inspectorCard)
    this.root.append(summaryCard, split)
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-active', visible)
  }

  update(snapshot: SimulationSnapshot): void {
    this.lastSnapshot = snapshot
    this.renderLastSnapshot()
  }

  destroy(): void {
    this.root.remove()
  }

  private lastSnapshot: SimulationSnapshot | null = null

  private renderLastSnapshot(): void {
    const snapshot = this.lastSnapshot
    const items = snapshot?.items
    if (!items) {
      this.summary.textContent = 'No structure data.'
      this.tableBody.innerHTML = '<tr><td colspan="5">No structures.</td></tr>'
      this.inspector.textContent = 'Select a structure row.'
      this.instancesList.innerHTML = '<li class="bi-ov-list-item">No instances.</li>'
      return
    }

    this.summary.innerHTML = [
      `<strong>catalog</strong> ${items.structuresCatalog.length}`,
      `<strong>built</strong> ${items.structuresWorld.length}`,
      `<strong>buildable</strong> ${items.structuresBuildable.filter((row) => row.unlocked && row.missingMaterials.length === 0).length}`,
      `<strong>faction</strong> ${items.selectedFactionName ?? '-'}`,
      `<strong>tech</strong> ${items.selectedFactionTechLevel.toFixed(2)}`,
    ].join(' · ')

    const buildableById = new Map(items.structuresBuildable.map((row) => [row.id, row]))
    const rows = items.structuresCatalog.filter((structure) => {
      const build = buildableById.get(structure.id)
      const status =
        !build
          ? 'locked'
          : !build.unlocked
            ? 'locked'
            : build.missingMaterials.length > 0
              ? 'missing'
              : 'buildable'
      if (this.statusFilter !== 'all' && status !== this.statusFilter) {
        return false
      }
      if (!this.searchText) {
        return true
      }
      const hay = `${structure.name} ${structure.utilityTags.join(' ')}`.toLowerCase()
      return hay.includes(this.searchText)
    })

    if (!this.selectedDefId || !rows.some((row) => row.id === this.selectedDefId)) {
      this.selectedDefId = rows[0]?.id ?? null
    }

    this.tableBody.innerHTML = ''
    if (rows.length === 0) {
      this.tableBody.innerHTML = '<tr><td colspan="5">No matching structures.</td></tr>'
    } else {
      for (let i = 0; i < rows.length; i++) {
        const structure = rows[i]
        if (!structure) continue
        const build = buildableById.get(structure.id)
        const status =
          !build
            ? 'locked'
            : !build.unlocked
              ? 'locked'
              : build.missingMaterials.length > 0
                ? 'missing'
                : 'buildable'
        const statusLabel =
          status === 'buildable' ? 'Buildable' : status === 'missing' ? 'Missing Materials' : 'Locked'

        const tr = document.createElement('tr')
        if (structure.id === this.selectedDefId) {
          tr.classList.add('is-selected')
        }
        tr.style.cursor = 'pointer'
        tr.innerHTML = `
          <td>${structure.name}</td>
          <td>${structure.utilityTags.join(', ') || '-'}</td>
          <td>${structure.requiredTechLevel.toFixed(2)}</td>
          <td>${formatCost(structure.buildCost)}</td>
          <td>${statusLabel}</td>
        `
        tr.addEventListener('click', () => {
          this.selectedDefId = structure.id
          this.renderLastSnapshot()
        })
        this.tableBody.appendChild(tr)
      }
    }

    this.renderInspector(items, buildableById)
  }

  private renderInspector(
    items: NonNullable<SimulationSnapshot['items']>,
    buildableById: Map<string, NonNullable<SimulationSnapshot['items']>['structuresBuildable'][number]>,
  ): void {
    if (!this.selectedDefId) {
      this.inspector.textContent = 'Select a structure row.'
      this.instancesList.innerHTML = '<li class="bi-ov-list-item">No instances.</li>'
      return
    }

    const structure = items.structuresCatalog.find((row) => row.id === this.selectedDefId)
    if (!structure) {
      this.inspector.textContent = 'Structure definition unavailable.'
      this.instancesList.innerHTML = '<li class="bi-ov-list-item">No instances.</li>'
      return
    }

    const build = buildableById.get(structure.id)
    const statusLine = !build
      ? 'Locked'
      : !build.unlocked
        ? `Locked · requires tech ${build.requiredTechLevel.toFixed(2)}`
        : build.missingMaterials.length > 0
          ? `Missing materials: ${build.missingMaterials.join(', ')}`
          : 'Buildable'

    this.inspector.textContent = [
      `${structure.name} (${structure.id})`,
      `utility: ${structure.utilityTags.join(', ') || '-'}`,
      `tech req: ${structure.requiredTechLevel.toFixed(2)}`,
      `cost: ${formatCost(structure.buildCost)}`,
      `resistance: heat ${formatRes(structure.heatResistance)}, lava ${formatRes(structure.lavaResistance)}, hazard ${formatRes(structure.hazardResistance)}`,
      `status: ${statusLine}`,
    ].join('\n')

    this.instancesList.innerHTML = ''
    const instances = items.structuresWorld.filter((row) => row.defId === structure.id)
    if (instances.length === 0) {
      this.instancesList.innerHTML = '<li class="bi-ov-list-item">No instances for this type.</li>'
      return
    }

    for (let i = 0; i < instances.length; i++) {
      const row = instances[i]
      if (!row) continue
      const li = document.createElement('li')
      li.className = 'bi-ov-list-item bi-ov-items-ground-item'

      const info = document.createElement('span')
      info.textContent = `${row.name} · ${row.state} · HP ${row.hp}/${row.maxHp} · (${row.x}, ${row.y})`

      const actions = document.createElement('div')
      actions.style.display = 'inline-flex'
      actions.style.gap = '6px'

      const focus = document.createElement('button')
      focus.type = 'button'
      focus.className = 'bi-ov-btn bi-ov-btn-ghost'
      focus.textContent = 'Focus'
      focus.addEventListener('click', () => {
        this.emitAction('focusWorldPoint', { x: row.x, y: row.y })
      })

      actions.appendChild(focus)
      li.append(info, actions)
      this.instancesList.appendChild(li)
    }
  }

  private createTitle(text: string): HTMLElement {
    const h = document.createElement('h3')
    h.className = 'bi-ov-card-title'
    h.textContent = text
    return h
  }

  private addOption(select: HTMLSelectElement, value: string, label: string): void {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    select.appendChild(option)
  }
}
