import type { LogEntry, OverlayPage, SimulationSnapshot } from '../types'

/**
 * Tab log viewer con filtri e render limitato (virtual list semplice).
 */
export class LogsPage implements OverlayPage {
  readonly id = 'logs' as const
  readonly title = 'Logs'
  readonly root = document.createElement('section')

  private readonly categorySelect = document.createElement('select')
  private readonly severitySelect = document.createElement('select')
  private readonly searchInput = document.createElement('input')
  private readonly exportBtn = document.createElement('button')
  private readonly list = document.createElement('ul')

  private latestEntries: LogEntry[] = []

  constructor() {
    this.root.className = 'bi-ov-page bi-ov-grid'

    const card = document.createElement('article')
    card.className = 'bi-ov-card'

    const controls = document.createElement('div')
    controls.className = 'bi-ov-controls-row'

    this.categorySelect.className = 'bi-ov-select'
    this.categorySelect.innerHTML = '<option value="*">all categories</option>'

    this.severitySelect.className = 'bi-ov-select'
    this.severitySelect.innerHTML = [
      '<option value="*">all severities</option>',
      '<option value="info">info</option>',
      '<option value="warn">warn</option>',
      '<option value="error">error</option>',
    ].join('')

    this.searchInput.className = 'bi-ov-input'
    this.searchInput.placeholder = 'search...'

    this.exportBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
    this.exportBtn.textContent = 'Export JSON'

    controls.append(this.categorySelect, this.severitySelect, this.searchInput, this.exportBtn)

    this.list.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll'

    card.append(this.createTitle('Simulation Logs'), controls, this.list)
    this.root.append(card)

    this.categorySelect.addEventListener('change', () => this.renderList())
    this.severitySelect.addEventListener('change', () => this.renderList())
    this.searchInput.addEventListener('input', () => this.renderList())
    this.exportBtn.addEventListener('click', () => this.exportLogs())
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-active', visible)
  }

  update(snapshot: SimulationSnapshot): void {
    this.latestEntries = [...snapshot.logs.entries]

    const categories = new Set<string>()
    for (let i = 0; i < this.latestEntries.length; i++) {
      const entry = this.latestEntries[i]
      if (!entry) continue
      categories.add(entry.category)
    }

    const currentValue = this.categorySelect.value || '*'
    this.categorySelect.innerHTML = '<option value="*">all categories</option>'
    for (const category of categories) {
      const option = document.createElement('option')
      option.value = category
      option.textContent = category
      this.categorySelect.appendChild(option)
    }

    if (Array.from(categories).includes(currentValue)) {
      this.categorySelect.value = currentValue
    } else {
      this.categorySelect.value = '*'
    }

    this.renderList()
  }

  destroy(): void {
    this.root.remove()
  }

  private renderList(): void {
    const selectedCategory = this.categorySelect.value || '*'
    const selectedSeverity = this.severitySelect.value || '*'
    const query = this.searchInput.value.trim().toLowerCase()

    const filtered: LogEntry[] = []
    for (let i = 0; i < this.latestEntries.length; i++) {
      const entry = this.latestEntries[i]
      if (!entry) continue

      if (selectedCategory !== '*' && entry.category !== selectedCategory) {
        continue
      }
      if (selectedSeverity !== '*' && entry.severity !== selectedSeverity) {
        continue
      }
      if (query.length > 0) {
        const hay = `${entry.category} ${entry.message}`.toLowerCase()
        if (!hay.includes(query)) {
          continue
        }
      }
      filtered.push(entry)
    }

    const start = Math.max(0, filtered.length - 200)
    this.list.innerHTML = ''
    for (let i = start; i < filtered.length; i++) {
      const entry = filtered[i]
      if (!entry) continue
      const item = document.createElement('li')
      item.className = `bi-ov-list-item ${entry.severity}`
      item.textContent = `[t${entry.tick}] [${entry.category}] ${entry.message}`
      this.list.appendChild(item)
    }

    if (this.list.childElementCount === 0) {
      this.list.innerHTML = '<li class="bi-ov-list-item">No logs for current filters.</li>'
    }
  }

  private exportLogs(): void {
    const payload = JSON.stringify(this.latestEntries, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `biotica-logs-${Date.now()}.json`
    link.click()

    URL.revokeObjectURL(url)
  }

  private createTitle(text: string): HTMLElement {
    const title = document.createElement('h3')
    title.className = 'bi-ov-card-title'
    title.textContent = text
    return title
  }
}
