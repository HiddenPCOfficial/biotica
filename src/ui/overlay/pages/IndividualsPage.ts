import type { OverlayActionHandler, OverlayPage, SimulationSnapshot } from '../types'

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Tab Individuals:
 * - lista completa individui intelligenti con link specie/etnia/civilta
 * - click individuo: focus + inspector dettagliato
 */
export class IndividualsPage implements OverlayPage {
  readonly id = 'individuals' as const
  readonly title = 'Individuals'
  readonly root = document.createElement('section')

  private readonly summaryLine = document.createElement('div')
  private readonly table = document.createElement('table')
  private readonly tableBody = document.createElement('tbody')
  private readonly inspector = document.createElement('pre')

  private selectedAgentId: string | null = null

  constructor(private readonly emitAction: OverlayActionHandler) {
    this.root.className = 'bi-ov-page bi-ov-grid'

    const card = document.createElement('article')
    card.className = 'bi-ov-card'
    card.append(this.createTitle('Individuals'))

    this.summaryLine.className = 'bi-ov-inline-stat'

    const tableWrap = document.createElement('div')
    tableWrap.className = 'bi-ov-table-wrap bi-ov-scroll'
    tableWrap.style.maxHeight = '320px'

    this.table.className = 'bi-ov-table'
    const head = document.createElement('thead')
    head.innerHTML =
      '<tr><th>name</th><th>species</th><th>ethnicity</th><th>civilization</th><th>role</th><th>state</th><th>energy</th></tr>'
    this.table.append(head, this.tableBody)
    tableWrap.appendChild(this.table)

    const inspectorCard = document.createElement('article')
    inspectorCard.className = 'bi-ov-card'
    inspectorCard.append(this.createTitle('Inspector'))

    this.inspector.className = 'bi-ov-text-block bi-ov-scroll'
    this.inspector.style.maxHeight = '280px'
    this.inspector.style.margin = '0'
    this.inspector.textContent = 'Select an individual.'

    inspectorCard.appendChild(this.inspector)

    card.append(this.summaryLine, tableWrap)
    this.root.append(card, inspectorCard)
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root)
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-active', visible)
  }

  update(snapshot: SimulationSnapshot): void {
    const civ = snapshot.civ
    if (!civ) {
      this.summaryLine.textContent = 'Civilization system not active.'
      this.tableBody.innerHTML = '<tr><td colspan="7">No individuals.</td></tr>'
      this.inspector.textContent = 'Civilization system not active.'
      return
    }

    const rows = [...civ.factionMembers].sort((a, b) => b.energy - a.energy || a.name.localeCompare(b.name))
    if (!this.selectedAgentId || !rows.some((row) => row.agentId === this.selectedAgentId)) {
      this.selectedAgentId = rows[0]?.agentId ?? null
    }

    this.summaryLine.innerHTML = [
      `<strong>individuals</strong> ${rows.length}`,
      `<strong>civilizations</strong> ${civ.factions.length}`,
      `<strong>ethnicities</strong> ${civ.ethnicities.length}`,
    ].join(' | ')

    const speciesNameById = new Map<string, string>()
    for (let i = 0; i < snapshot.population.speciesRows.length; i++) {
      const species = snapshot.population.speciesRows[i]
      if (!species) continue
      speciesNameById.set(species.speciesId, species.commonName || species.name)
    }

    const ethnicityNameById = new Map<string, string>()
    for (let i = 0; i < civ.ethnicities.length; i++) {
      const ethnicity = civ.ethnicities[i]
      if (!ethnicity) continue
      ethnicityNameById.set(ethnicity.id, ethnicity.name ?? ethnicity.id)
    }

    this.tableBody.innerHTML = ''
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      const tr = document.createElement('tr')
      if (row.agentId === this.selectedAgentId) {
        tr.classList.add('is-selected')
      }
      tr.innerHTML = [
        `<td>${row.name}</td>`,
        `<td>${speciesNameById.get(row.speciesId) ?? row.speciesId}</td>`,
        `<td>${row.ethnicityId ? ethnicityNameById.get(row.ethnicityId) ?? row.ethnicityId : '-'}</td>`,
        `<td>${row.factionName}</td>`,
        `<td>${row.role}</td>`,
        `<td>${row.activityState}</td>`,
        `<td>${row.energy.toFixed(1)}</td>`,
      ].join('')

      tr.addEventListener('click', () => {
        this.selectedAgentId = row.agentId
        this.emitAction('focusWorldPoint', { x: row.x, y: row.y })
        this.emitAction('inspectCivAgent', { agentId: row.agentId })
      })

      this.tableBody.appendChild(tr)
    }

    if (this.tableBody.childElementCount === 0) {
      this.tableBody.innerHTML = '<tr><td colspan="7">No individuals.</td></tr>'
    }

    const selectedRow = rows.find((row) => row.agentId === this.selectedAgentId) ?? null
    if (!selectedRow) {
      this.inspector.textContent = 'Select an individual.'
      return
    }

    const selectedAgent = snapshot.selectedAgent && snapshot.selectedAgent.agentId === selectedRow.agentId
      ? snapshot.selectedAgent
      : null

    const inventoryLines = selectedAgent
      ? selectedAgent.inventoryRows.map((item) => `${item.itemName} x${item.quantity}`)
      : selectedRow.inventoryItems.map((item) => `${item.itemId} x${item.quantity}`)

    const mental = selectedAgent?.mentalState ?? selectedRow.mentalState

    this.inspector.textContent = [
      `${selectedRow.name} (${selectedRow.role})`,
      `species=${speciesNameById.get(selectedRow.speciesId) ?? selectedRow.speciesId}`,
      `ethnicity=${selectedRow.ethnicityId ? ethnicityNameById.get(selectedRow.ethnicityId) ?? selectedRow.ethnicityId : '-'}`,
      `civilization=${selectedRow.factionName}`,
      `goal=${selectedRow.goal} state=${selectedRow.activityState}`,
      `energy=${selectedRow.energy.toFixed(1)} hydration=${selectedRow.hydration.toFixed(1)} age=${selectedRow.age.toFixed(1)}`,
      `inventory=${inventoryLines.length > 0 ? inventoryLines.join(' | ') : '-'}`,
      '',
      `mental.goal=${mental.currentGoal}`,
      `mental.reasons=${mental.lastReasonCodes.join(', ') || '-'}`,
      `mental.target=${mental.targetLabel} @ (${mental.targetX}, ${mental.targetY})`,
      `mental.food=${(clamp01(mental.perceivedFoodLevel) * 100).toFixed(0)}% threat=${(clamp01(mental.perceivedThreatLevel) * 100).toFixed(0)}% stress=${(clamp01(mental.stressLevel) * 100).toFixed(0)}% loyalty=${(clamp01(mental.loyaltyToFaction) * 100).toFixed(0)}%`,
      selectedAgent?.thought ? `thought=${selectedAgent.thought}` : '',
    ]
      .filter(Boolean)
      .join('\n')
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
