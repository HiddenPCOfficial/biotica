import type { SaveSort, WorldSaveListItem } from '../../../save/SaveTypes'

export type WorldLoadActions = {
  onBack: () => void
  onRefresh: (sort: SaveSort) => void
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

export class WorldLoadPage {
  readonly root = document.createElement('section')

  private readonly listHost = document.createElement('div')
  private readonly detailHost = document.createElement('div')
  private readonly sortSelect = document.createElement('select')

  private rows: WorldSaveListItem[] = []
  private selectedId: string | null = null

  constructor(private readonly actions: WorldLoadActions) {
    this.root.className = 'bi-menu-page bi-menu-load-page'

    const header = document.createElement('div')
    header.className = 'bi-menu-header-row'

    const title = document.createElement('h1')
    title.className = 'bi-menu-title'
    title.textContent = 'Load World'

    const controls = document.createElement('div')
    controls.className = 'bi-menu-inline-controls'

    this.sortSelect.className = 'bi-menu-input bi-menu-sort'
    const sortOptions: Array<{ value: SaveSort; label: string }> = [
      { value: 'updatedDesc', label: 'Last Played' },
      { value: 'nameAsc', label: 'Name' },
      { value: 'seedAsc', label: 'Seed' },
    ]
    sortOptions.forEach((row) => {
      const option = document.createElement('option')
      option.value = row.value
      option.textContent = row.label
      this.sortSelect.appendChild(option)
    })
    this.sortSelect.addEventListener('change', () => {
      this.actions.onRefresh(this.sortSelect.value as SaveSort)
    })

    const refreshBtn = document.createElement('button')
    refreshBtn.type = 'button'
    refreshBtn.className = 'bi-menu-btn bi-menu-btn-small is-ghost'
    refreshBtn.textContent = 'Refresh'
    refreshBtn.addEventListener('click', () => {
      this.actions.onRefresh(this.sortSelect.value as SaveSort)
    })

    controls.append(this.sortSelect, refreshBtn)
    header.append(title, controls)

    const body = document.createElement('div')
    body.className = 'bi-menu-load-layout'

    this.listHost.className = 'bi-menu-load-list'
    this.detailHost.className = 'bi-menu-load-detail'

    body.append(this.listHost, this.detailHost)

    const footer = document.createElement('div')
    footer.className = 'bi-menu-actions bi-menu-actions-inline'

    const backBtn = document.createElement('button')
    backBtn.type = 'button'
    backBtn.className = 'bi-menu-btn is-ghost'
    backBtn.textContent = 'Back'
    backBtn.addEventListener('click', () => this.actions.onBack())

    footer.append(backBtn)

    this.root.append(header, body, footer)
    this.renderList()
    this.renderDetail()
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  destroy(): void {
    this.root.remove()
  }

  setRows(rows: WorldSaveListItem[]): void {
    this.rows = [...rows]
    if (this.selectedId && !this.rows.some((row) => row.id === this.selectedId)) {
      this.selectedId = null
    }
    if (!this.selectedId && this.rows.length > 0) {
      this.selectedId = this.rows[0]?.id ?? null
    }
    this.renderList()
    this.renderDetail()
  }

  setSort(sort: SaveSort): void {
    this.sortSelect.value = sort
  }

  private renderList(): void {
    this.listHost.innerHTML = ''

    if (this.rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'bi-menu-empty'
      empty.textContent = 'No saved worlds found.'
      this.listHost.appendChild(empty)
      return
    }

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i]
      if (!row) continue

      const item = document.createElement('button')
      item.type = 'button'
      item.className = `bi-menu-load-row ${row.id === this.selectedId ? 'is-active' : ''}`
      item.addEventListener('click', () => {
        this.selectedId = row.id
        this.renderList()
        this.renderDetail()
      })

      const title = document.createElement('div')
      title.className = 'bi-menu-load-row-title'
      title.textContent = row.name

      const meta = document.createElement('div')
      meta.className = 'bi-menu-load-row-meta'
      meta.textContent = `${row.seed} • ${formatDate(row.updatedAt)}`

      item.append(title, meta)
      this.listHost.appendChild(item)
    }
  }

  private renderDetail(): void {
    this.detailHost.innerHTML = ''

    const selected = this.rows.find((row) => row.id === this.selectedId)
    if (!selected) {
      const empty = document.createElement('div')
      empty.className = 'bi-menu-empty'
      empty.textContent = 'Select a world to preview and load.'
      this.detailHost.appendChild(empty)
      return
    }

    const card = document.createElement('div')
    card.className = 'bi-menu-detail-card'

    const thumbWrap = document.createElement('div')
    thumbWrap.className = 'bi-menu-thumb-wrap'
    if (selected.preview.thumbnailDataUrl) {
      const img = document.createElement('img')
      img.className = 'bi-menu-thumb'
      img.src = selected.preview.thumbnailDataUrl
      img.alt = `${selected.name} preview`
      thumbWrap.appendChild(img)
    } else {
      const placeholder = document.createElement('div')
      placeholder.className = 'bi-menu-thumb bi-menu-thumb-placeholder'
      placeholder.textContent = 'No Preview'
      thumbWrap.appendChild(placeholder)
    }

    const title = document.createElement('h2')
    title.className = 'bi-menu-detail-title'
    title.textContent = selected.name

    const summary = document.createElement('pre')
    summary.className = 'bi-menu-detail-summary'
    const stats = selected.preview.statsSummary
    const avgTemp = Number(stats.avgTemp ?? 0)
    const avgHumidity = Number(stats.avgHumidity ?? 0)
    const avgHazard = Number(stats.avgHazard ?? 0)
    summary.textContent = [
      `Seed: ${selected.seed}`,
      `Tick: ${stats.tick}`,
      `Population: ${stats.population}`,
      `Biodiversity: ${stats.biodiversity}`,
      `Era: ${stats.era ?? '-'}`,
      `Temp/Hum/Hazard: ${avgTemp.toFixed(3)} / ${avgHumidity.toFixed(3)} / ${avgHazard.toFixed(3)}`,
      `Updated: ${formatDate(selected.updatedAt)}`,
      `Slot: ${selected.slotId}`,
    ].join('\n')

    const actions = document.createElement('div')
    actions.className = 'bi-menu-actions bi-menu-actions-inline'

    const loadBtn = document.createElement('button')
    loadBtn.type = 'button'
    loadBtn.className = 'bi-menu-btn'
    loadBtn.textContent = 'Load'
    loadBtn.addEventListener('click', () => this.actions.onLoad(selected.id))

    const duplicateBtn = document.createElement('button')
    duplicateBtn.type = 'button'
    duplicateBtn.className = 'bi-menu-btn is-ghost'
    duplicateBtn.textContent = 'Duplicate'
    duplicateBtn.addEventListener('click', () => this.actions.onDuplicate(selected.id))

    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'bi-menu-btn is-danger'
    deleteBtn.textContent = 'Delete'
    deleteBtn.addEventListener('click', () => this.actions.onDelete(selected.id))

    actions.append(loadBtn, duplicateBtn, deleteBtn)
    card.append(thumbWrap, title, summary, actions)
    this.detailHost.appendChild(card)
  }
}
