import {
  StructureUiAdapter,
  type StructureBuildHint,
  type StructureDetails,
  type StructureRow,
} from '../../data/StructureUiAdapter'

export type StructuresPageActions = {
  onBack?: () => void
  onFocusInstance?: (structureId: string) => void
  onFocusExamples?: (defId: string) => void
  onBuildHint?: (defId: string) => StructureBuildHint | null
}

type SortMode = 'nameAsc' | 'techAsc' | 'techDesc' | 'status'
type StatusFilter = 'all' | 'buildable' | 'locked' | 'missing_materials'

function statusClass(status: string): string {
  if (status === 'buildable') return 'is-buildable'
  if (status === 'missing_materials') return 'is-missing'
  return 'is-locked'
}

function pct(value: number): string {
  return `${Math.max(0, Math.min(100, value * 100)).toFixed(0)}%`
}

export class StructuresPage {
  readonly root = document.createElement('section')

  private adapter: StructureUiAdapter | null
  private selectedDefId: string | null = null

  private readonly titleEl = document.createElement('h1')
  private readonly subtitleEl = document.createElement('p')
  private readonly searchInput = document.createElement('input')
  private readonly sortSelect = document.createElement('select')
  private readonly statusSelect = document.createElement('select')
  private readonly tagSelect = document.createElement('select')
  private readonly tableBody = document.createElement('tbody')
  private readonly inspector = document.createElement('aside')
  private readonly emptyBanner = document.createElement('div')

  private hintMessage = ''

  private searchText = ''
  private sortMode: SortMode = 'nameAsc'
  private statusFilter: StatusFilter = 'all'
  private tagFilter = 'all'

  constructor(params: {
    title?: string
    subtitle?: string
    adapter: StructureUiAdapter | null
    actions?: StructuresPageActions
    emptyMessage?: string
  }) {
    this.adapter = params.adapter
    this.actions = params.actions ?? {}

    this.root.className = 'bi-menu-page bi-structures-page'

    this.titleEl.className = 'bi-menu-title'
    this.titleEl.textContent = params.title ?? 'Structures'

    this.subtitleEl.className = 'bi-menu-subtitle'
    this.subtitleEl.textContent =
      params.subtitle ??
      'Structure catalog, buildability status and world instances.'

    const controls = document.createElement('div')
    controls.className = 'bi-structures-controls'

    this.searchInput.className = 'bi-menu-input bi-structures-search'
    this.searchInput.type = 'search'
    this.searchInput.placeholder = 'Search by name or tag'
    this.searchInput.addEventListener('input', () => {
      this.searchText = this.searchInput.value.trim().toLowerCase()
      this.refresh()
    })

    this.sortSelect.className = 'bi-menu-input bi-structures-select'
    this.addOption(this.sortSelect, 'nameAsc', 'Sort: Name')
    this.addOption(this.sortSelect, 'techAsc', 'Sort: Tech ↑')
    this.addOption(this.sortSelect, 'techDesc', 'Sort: Tech ↓')
    this.addOption(this.sortSelect, 'status', 'Sort: Status')
    this.sortSelect.addEventListener('change', () => {
      this.sortMode = this.sortSelect.value as SortMode
      this.refresh()
    })

    this.statusSelect.className = 'bi-menu-input bi-structures-select'
    this.addOption(this.statusSelect, 'all', 'Status: All')
    this.addOption(this.statusSelect, 'buildable', 'Buildable')
    this.addOption(this.statusSelect, 'locked', 'Locked')
    this.addOption(this.statusSelect, 'missing_materials', 'Missing Materials')
    this.statusSelect.addEventListener('change', () => {
      this.statusFilter = this.statusSelect.value as StatusFilter
      this.refresh()
    })

    this.tagSelect.className = 'bi-menu-input bi-structures-select'
    this.addOption(this.tagSelect, 'all', 'Tag: All')
    this.tagSelect.addEventListener('change', () => {
      this.tagFilter = this.tagSelect.value
      this.refresh()
    })

    controls.append(this.searchInput, this.sortSelect, this.statusSelect, this.tagSelect)

    const layout = document.createElement('div')
    layout.className = 'bi-structures-layout'

    const listCol = document.createElement('section')
    listCol.className = 'bi-structures-list-col'

    const tableWrap = document.createElement('div')
    tableWrap.className = 'bi-structures-table-wrap'

    const table = document.createElement('table')
    table.className = 'bi-structures-table'
    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')
    ;['', 'Name', 'Utility', 'Tech', 'Cost', 'Status'].forEach((label) => {
      const th = document.createElement('th')
      th.textContent = label
      headerRow.appendChild(th)
    })
    thead.appendChild(headerRow)
    table.append(thead, this.tableBody)

    tableWrap.appendChild(table)

    this.emptyBanner.className = 'bi-menu-empty bi-structures-empty'
    this.emptyBanner.textContent =
      params.emptyMessage ?? 'No structure catalog available in this context.'

    listCol.append(tableWrap, this.emptyBanner)

    this.inspector.className = 'bi-structures-inspector'

    layout.append(listCol, this.inspector)

    const footer = document.createElement('div')
    footer.className = 'bi-menu-actions bi-menu-actions-inline'
    if (this.actions.onBack) {
      const back = document.createElement('button')
      back.type = 'button'
      back.className = 'bi-menu-btn is-ghost'
      back.textContent = 'Back'
      back.addEventListener('click', () => this.actions.onBack?.())
      footer.appendChild(back)
    }

    this.root.append(this.titleEl, this.subtitleEl, controls, layout)
    if (footer.childElementCount > 0) {
      this.root.appendChild(footer)
    }

    this.refreshTagFilterOptions()
    this.refresh()
  }

  private readonly actions: StructuresPageActions

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  destroy(): void {
    this.root.remove()
  }

  setAdapter(adapter: StructureUiAdapter | null, subtitle?: string): void {
    this.adapter = adapter
    this.selectedDefId = null
    this.hintMessage = ''
    if (typeof subtitle === 'string') {
      this.subtitleEl.textContent = subtitle
    }
    this.refreshTagFilterOptions()
    this.refresh()
  }

  private refreshTagFilterOptions(): void {
    const previous = this.tagFilter
    this.tagSelect.innerHTML = ''
    this.addOption(this.tagSelect, 'all', 'Tag: All')

    const tags = new Set<string>()
    const rows = this.adapter?.getAllStructureRows() ?? []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      for (let t = 0; t < row.utilityTags.length; t++) {
        const tag = row.utilityTags[t]
        if (!tag) continue
        tags.add(tag)
      }
    }

    const ordered = Array.from(tags.values()).sort((a, b) => a.localeCompare(b))
    for (let i = 0; i < ordered.length; i++) {
      const tag = ordered[i]
      if (!tag) continue
      this.addOption(this.tagSelect, tag, `Tag: ${tag}`)
    }

    this.tagFilter = ordered.includes(previous) ? previous : 'all'
    this.tagSelect.value = this.tagFilter
  }

  private refresh(): void {
    const rows = this.filterRows(this.adapter?.getAllStructureRows() ?? [])

    this.tableBody.innerHTML = ''
    this.emptyBanner.style.display = rows.length === 0 ? 'block' : 'none'

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue

      const tr = document.createElement('tr')
      tr.className = `bi-structures-row ${row.defId === this.selectedDefId ? 'is-selected' : ''}`
      tr.addEventListener('click', () => {
        this.selectedDefId = row.defId
        this.hintMessage = ''
        this.refresh()
      })

      const iconTd = document.createElement('td')
      const icon = document.createElement('span')
      icon.className = 'bi-structures-icon'
      icon.style.background = row.iconColor
      iconTd.appendChild(icon)

      const nameTd = document.createElement('td')
      nameTd.textContent = row.name

      const tagsTd = document.createElement('td')
      const tagsWrap = document.createElement('div')
      tagsWrap.className = 'bi-structures-badges'
      for (let t = 0; t < row.utilityTags.length; t++) {
        const tag = row.utilityTags[t]
        if (!tag) continue
        const badge = document.createElement('span')
        badge.className = 'bi-structures-badge'
        badge.textContent = tag
        tagsWrap.appendChild(badge)
      }
      tagsTd.appendChild(tagsWrap)

      const techTd = document.createElement('td')
      techTd.textContent = row.requiredTechLevel.toFixed(1)

      const costTd = document.createElement('td')
      costTd.textContent = row.costSummary

      const statusTd = document.createElement('td')
      const pill = document.createElement('span')
      pill.className = `bi-structures-status ${statusClass(row.status)}`
      pill.textContent = row.statusLabel
      pill.title = row.statusReason
      statusTd.appendChild(pill)

      tr.append(iconTd, nameTd, tagsTd, techTd, costTd, statusTd)
      this.tableBody.appendChild(tr)
    }

    if (!this.selectedDefId && rows.length > 0) {
      this.selectedDefId = rows[0]?.defId ?? null
    }

    if (this.selectedDefId && !rows.some((row) => row.defId === this.selectedDefId)) {
      this.selectedDefId = rows[0]?.defId ?? null
    }

    this.renderInspector()
  }

  private filterRows(rows: StructureRow[]): StructureRow[] {
    const out = rows.filter((row) => {
      if (this.statusFilter !== 'all' && row.status !== this.statusFilter) {
        return false
      }
      if (this.tagFilter !== 'all' && !row.utilityTags.includes(this.tagFilter)) {
        return false
      }
      if (!this.searchText) {
        return true
      }
      const haystack = `${row.name} ${row.utilityTags.join(' ')}`.toLowerCase()
      return haystack.includes(this.searchText)
    })

    if (this.sortMode === 'techAsc') {
      out.sort((a, b) => a.requiredTechLevel - b.requiredTechLevel || a.name.localeCompare(b.name))
    } else if (this.sortMode === 'techDesc') {
      out.sort((a, b) => b.requiredTechLevel - a.requiredTechLevel || a.name.localeCompare(b.name))
    } else if (this.sortMode === 'status') {
      const rank = (value: string): number => {
        if (value === 'buildable') return 0
        if (value === 'missing_materials') return 1
        return 2
      }
      out.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name))
    } else {
      out.sort((a, b) => a.name.localeCompare(b.name))
    }

    return out
  }

  private renderInspector(): void {
    this.inspector.innerHTML = ''

    if (!this.adapter || !this.selectedDefId) {
      const empty = document.createElement('div')
      empty.className = 'bi-menu-empty'
      empty.textContent = 'Select a structure definition to inspect details.'
      this.inspector.appendChild(empty)
      return
    }

    const details = this.adapter.getStructureDetails(this.selectedDefId)
    if (!details) {
      const empty = document.createElement('div')
      empty.className = 'bi-menu-empty'
      empty.textContent = 'Structure details unavailable.'
      this.inspector.appendChild(empty)
      return
    }

    const card = document.createElement('div')
    card.className = 'bi-structures-inspector-card'

    const head = document.createElement('div')
    head.className = 'bi-structures-inspector-head'

    const titleWrap = document.createElement('div')
    const title = document.createElement('h2')
    title.className = 'bi-menu-detail-title'
    title.textContent = details.name
    const idLine = document.createElement('p')
    idLine.className = 'bi-menu-subtitle'
    idLine.textContent = details.defId
    titleWrap.append(title, idLine)

    const status = document.createElement('span')
    status.className = `bi-structures-status ${statusClass(details.buildStatus.status)}`
    status.textContent = details.buildStatus.status === 'buildable'
      ? 'Buildable'
      : details.buildStatus.status === 'missing_materials'
        ? 'Missing Materials'
        : 'Locked'
    status.title = details.buildStatus.reason

    head.append(titleWrap, status)

    const utility = document.createElement('p')
    utility.className = 'bi-structures-utility-text'
    utility.textContent = details.utilityDescription

    const tags = document.createElement('div')
    tags.className = 'bi-structures-badges'
    for (let i = 0; i < details.utilityTags.length; i++) {
      const tag = details.utilityTags[i]
      if (!tag) continue
      const badge = document.createElement('span')
      badge.className = 'bi-structures-badge'
      badge.textContent = tag
      tags.appendChild(badge)
    }

    const req = document.createElement('div')
    req.className = 'bi-structures-kv'
    req.innerHTML = `
      <div><strong>Required Tech:</strong> ${details.requiredTechLevel.toFixed(1)}</div>
      <div><strong>Required Literacy:</strong> ${details.requiredLiteracy.toFixed(1)}</div>
      <div><strong>Status:</strong> ${details.buildStatus.reason}</div>
    `

    const costSection = document.createElement('div')
    costSection.className = 'bi-structures-section'
    const costTitle = document.createElement('h3')
    costTitle.className = 'bi-structures-section-title'
    costTitle.textContent = 'Build Cost'
    costSection.appendChild(costTitle)

    const costList = document.createElement('ul')
    costList.className = 'bi-structures-list'
    for (let i = 0; i < details.buildCost.length; i++) {
      const row = details.buildCost[i]
      if (!row) continue
      const li = document.createElement('li')
      const missing = details.buildStatus.missingMaterials.find((entry) => entry.materialId === row.materialId)
      li.textContent = `${row.materialId} x${row.amount}${missing ? ` (missing ${missing.missing})` : ''}`
      if (missing) {
        li.classList.add('is-missing')
      }
      costList.appendChild(li)
    }
    costSection.appendChild(costList)

    const resistance = document.createElement('div')
    resistance.className = 'bi-structures-section'
    const resistanceTitle = document.createElement('h3')
    resistanceTitle.className = 'bi-structures-section-title'
    resistanceTitle.textContent = 'Resistances'
    resistance.appendChild(resistanceTitle)
    resistance.append(
      this.makeResistanceRow('Heat', details.heatResistance),
      this.makeResistanceRow('Lava', details.lavaResistance),
      this.makeResistanceRow('Hazard', details.hazardResistance),
    )

    const effects = document.createElement('div')
    effects.className = 'bi-structures-section'
    const effectsTitle = document.createElement('h3')
    effectsTitle.className = 'bi-structures-section-title'
    effectsTitle.textContent = 'Gameplay Effects'
    effects.appendChild(effectsTitle)

    const effectsList = document.createElement('ul')
    effectsList.className = 'bi-structures-list'
    effectsList.append(
      this.makeEffectLine(`+storageCapacity: ${details.effects.storageCapacity}`),
      this.makeEffectLine(`+restRecovery: ${details.effects.restRecovery.toFixed(2)}`),
      this.makeEffectLine(`enables smelting: ${details.effects.enablesSmelting ? 'yes' : 'no'}`),
      this.makeEffectLine(
        `crafting stations unlocked: ${details.effects.craftingStations.length > 0 ? details.effects.craftingStations.join(', ') : 'none'}`,
      ),
      this.makeEffectLine(`territory influence bonus: ${details.effects.territoryInfluenceBonus}`),
    )
    effects.appendChild(effectsList)

    const actions = document.createElement('div')
    actions.className = 'bi-menu-actions bi-menu-actions-inline bi-structures-actions'

    const instances = this.adapter.listWorldInstances(details.defId)

    if (this.actions.onFocusExamples && instances.length > 0) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'bi-menu-btn is-ghost'
      btn.textContent = 'Focus Examples'
      btn.addEventListener('click', () => this.actions.onFocusExamples?.(details.defId))
      actions.appendChild(btn)
    }

    if (this.actions.onBuildHint && details.buildStatus.status === 'buildable') {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'bi-menu-btn'
      btn.textContent = 'Build Hint'
      btn.addEventListener('click', () => {
        const hint = this.actions.onBuildHint?.(details.defId) ?? null
        this.hintMessage = hint
          ? `${hint.summary} [${hint.reasonCodes.join(', ')}]`
          : 'No deterministic build hint available for this structure.'
        this.renderInspector()
      })
      actions.appendChild(btn)
    }

    const hint = document.createElement('p')
    hint.className = 'bi-menu-subtitle bi-structures-hint'
    hint.textContent = this.hintMessage

    const worldSection = document.createElement('div')
    worldSection.className = 'bi-structures-section'
    const worldTitle = document.createElement('h3')
    worldTitle.className = 'bi-structures-section-title'
    worldTitle.textContent = `Built Instances (${instances.length})`
    worldSection.appendChild(worldTitle)

    if (instances.length === 0) {
      const noInst = document.createElement('div')
      noInst.className = 'bi-menu-empty'
      noInst.textContent = 'No instances of this structure type in the current world.'
      worldSection.appendChild(noInst)
    } else {
      const list = document.createElement('div')
      list.className = 'bi-structures-instance-list'

      for (let i = 0; i < instances.length; i++) {
        const row = instances[i]
        if (!row) continue

        const line = document.createElement('div')
        line.className = 'bi-structures-instance-row'

        const text = document.createElement('span')
        text.textContent = `${row.factionName} @ (${row.x}, ${row.y}) · ${row.state} · HP ${row.hp}/${row.maxHp}`

        const btnWrap = document.createElement('div')
        btnWrap.className = 'bi-structures-instance-actions'

        if (this.actions.onFocusInstance) {
          const focus = document.createElement('button')
          focus.type = 'button'
          focus.className = 'bi-menu-btn bi-menu-btn-small is-ghost'
          focus.textContent = 'Focus'
          focus.addEventListener('click', () => {
            this.actions.onFocusInstance?.(row.id)
          })
          btnWrap.appendChild(focus)
        }

        line.append(text, btnWrap)
        list.appendChild(line)
      }

      worldSection.appendChild(list)
    }

    card.append(head, utility, tags, req, costSection, resistance, effects, actions)
    if (this.hintMessage) {
      card.appendChild(hint)
    }
    card.appendChild(worldSection)

    this.inspector.appendChild(card)
  }

  private makeResistanceRow(label: string, value: number): HTMLElement {
    const row = document.createElement('div')
    row.className = 'bi-structures-resistance-row'

    const text = document.createElement('span')
    text.className = 'bi-structures-resistance-label'
    text.textContent = `${label} ${pct(value)}`

    const track = document.createElement('span')
    track.className = 'bi-structures-resistance-track'
    const bar = document.createElement('span')
    bar.className = 'bi-structures-resistance-bar'
    bar.style.width = pct(value)
    track.appendChild(bar)

    row.append(text, track)
    return row
  }

  private makeEffectLine(text: string): HTMLElement {
    const li = document.createElement('li')
    li.textContent = text
    return li
  }

  private addOption(select: HTMLSelectElement, value: string, label: string): void {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    select.appendChild(option)
  }
}
