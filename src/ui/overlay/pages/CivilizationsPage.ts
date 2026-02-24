import { createLineChart, destroyChart, type ChartLike, updateRollingDataset } from '../charts/ChartFactory'
import type { OverlayActionHandler, OverlayPage, SimulationSnapshot } from '../types'

function colorFromId(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hue = h % 360
  return `hsl(${hue} 72% 64%)`
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function roleBadgeColor(role: string): string {
  switch (role) {
    case 'Leader':
      return 'rgba(246, 200, 112, 0.24)'
    case 'Scribe':
      return 'rgba(150, 212, 255, 0.24)'
    case 'Guard':
      return 'rgba(255, 132, 132, 0.22)'
    case 'Trader':
      return 'rgba(144, 236, 177, 0.22)'
    default:
      return 'rgba(190, 209, 255, 0.14)'
  }
}

/**
 * Tab Civilizations:
 * - fazioni + membri completi
 * - inspector membro (inventario/equipment/mente)
 * - note scritte nel mondo
 * - relazioni (matrice + trust/tension)
 */
export class CivilizationsPage implements OverlayPage {
  readonly id = 'civilizations' as const
  readonly title = 'Civilizations'
  readonly root = document.createElement('section')

  private readonly summaryLine = document.createElement('div')

  private readonly factionsTable = document.createElement('table')
  private readonly factionsBody = document.createElement('tbody')

  private readonly selectedFactionHeader = document.createElement('div')
  private readonly membersTable = document.createElement('table')
  private readonly membersBody = document.createElement('tbody')

  private readonly memberInspector = document.createElement('div')
  private readonly thoughtGlossBtn = document.createElement('button')

  private readonly relationMatrixTable = document.createElement('table')
  private readonly relationMatrixBody = document.createElement('tbody')
  private readonly relationMatrixHead = document.createElement('thead')

  private readonly relationChartCanvas = document.createElement('canvas')
  private relationChart: ChartLike | null = null

  private readonly notesList = document.createElement('ul')
  private readonly dialoguesList = document.createElement('ul')

  private selectedFactionId: string | null = null
  private selectedMemberId: string | null = null
  private selectedRelationKey: string | null = null
  private selectedSpeciesId: string | null = null

  constructor(private readonly emitAction: OverlayActionHandler) {
    this.root.className = 'bi-ov-page bi-ov-grid'

    const summaryCard = document.createElement('article')
    summaryCard.className = 'bi-ov-card'
    summaryCard.append(this.createTitle('Civilizations Summary'))
    this.summaryLine.className = 'bi-ov-inline-stat'
    summaryCard.appendChild(this.summaryLine)

    const mainSplit = document.createElement('div')
    mainSplit.className = 'bi-ov-split'

    const factionsCard = document.createElement('article')
    factionsCard.className = 'bi-ov-card'
    factionsCard.append(this.createTitle('Factions'))

    const factionsWrap = document.createElement('div')
    factionsWrap.className = 'bi-ov-table-wrap bi-ov-scroll'
    this.factionsTable.className = 'bi-ov-table'
    const factionsHead = document.createElement('thead')
    factionsHead.innerHTML =
      '<tr><th>name</th><th>species</th><th>ethnic groups</th><th>pop</th><th>tech</th><th>lit</th><th>state</th></tr>'
    this.factionsTable.append(factionsHead, this.factionsBody)
    factionsWrap.appendChild(this.factionsTable)
    factionsCard.appendChild(factionsWrap)

    const membersCard = document.createElement('article')
    membersCard.className = 'bi-ov-card'
    membersCard.append(this.createTitle('Selected Faction'))

    this.selectedFactionHeader.className = 'bi-ov-text-block bi-ov-muted'
    this.selectedFactionHeader.style.marginBottom = '8px'

    const membersWrap = document.createElement('div')
    membersWrap.className = 'bi-ov-table-wrap bi-ov-scroll'
    membersWrap.style.maxHeight = '250px'
    this.membersTable.className = 'bi-ov-table'
    const membersHead = document.createElement('thead')
    membersHead.innerHTML = '<tr><th>name</th><th>role</th><th>age</th><th>energy</th><th>state</th></tr>'
    this.membersTable.append(membersHead, this.membersBody)
    membersWrap.appendChild(this.membersTable)

    const inspectorTitle = this.createTitle('Member Inspector')
    inspectorTitle.style.marginTop = '10px'

    this.thoughtGlossBtn.type = 'button'
    this.thoughtGlossBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
    this.thoughtGlossBtn.textContent = 'Generate Thought Gloss'
    this.thoughtGlossBtn.addEventListener('click', () => {
      if (!this.selectedMemberId) {
        return
      }
      this.emitAction('requestAgentThoughtGloss', { agentId: this.selectedMemberId })
    })

    this.memberInspector.className = 'bi-ov-text-block bi-ov-scroll'
    this.memberInspector.style.maxHeight = '260px'
    this.memberInspector.style.border = '1px solid rgba(176, 206, 255, 0.16)'
    this.memberInspector.style.borderRadius = '8px'
    this.memberInspector.style.padding = '8px'
    this.memberInspector.textContent = 'Select a member from the table.'

    membersCard.append(
      this.selectedFactionHeader,
      membersWrap,
      inspectorTitle,
      this.thoughtGlossBtn,
      this.memberInspector,
    )

    mainSplit.append(factionsCard, membersCard)

    const bottomSplit = document.createElement('div')
    bottomSplit.className = 'bi-ov-split'

    const relationsCard = document.createElement('article')
    relationsCard.className = 'bi-ov-card'
    relationsCard.append(this.createTitle('Relations Matrix + Trust/Tension'))

    const matrixWrap = document.createElement('div')
    matrixWrap.className = 'bi-ov-table-wrap bi-ov-scroll'
    matrixWrap.style.maxHeight = '190px'
    this.relationMatrixTable.className = 'bi-ov-table'
    this.relationMatrixTable.append(this.relationMatrixHead, this.relationMatrixBody)
    matrixWrap.appendChild(this.relationMatrixTable)

    const chartWrap = document.createElement('div')
    chartWrap.className = 'bi-ov-chart-wrap'
    chartWrap.style.height = '200px'
    this.relationChartCanvas.className = 'bi-ov-chart'
    chartWrap.appendChild(this.relationChartCanvas)

    relationsCard.append(matrixWrap, chartWrap)

    const narrativeCard = document.createElement('article')
    narrativeCard.className = 'bi-ov-card'
    narrativeCard.append(this.createTitle('Notes + Dialogues'))

    const noteTitle = document.createElement('div')
    noteTitle.className = 'bi-ov-inline-stat'
    noteTitle.innerHTML = '<strong>Notes</strong>'

    this.notesList.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll'
    this.notesList.style.maxHeight = '160px'

    const dialogueTitle = document.createElement('div')
    dialogueTitle.className = 'bi-ov-inline-stat'
    dialogueTitle.innerHTML = '<strong>Recent Dialogues</strong>'
    dialogueTitle.style.marginTop = '10px'

    this.dialoguesList.className = 'bi-ov-list bi-ov-list-scroll bi-ov-scroll'
    this.dialoguesList.style.maxHeight = '160px'

    narrativeCard.append(noteTitle, this.notesList, dialogueTitle, this.dialoguesList)

    bottomSplit.append(relationsCard, narrativeCard)

    this.root.append(summaryCard, mainSplit, bottomSplit)

    this.relationChart = createLineChart(this.relationChartCanvas, {
      title: 'Relation Trust/Tension',
      yMin: 0,
      yMax: 1,
    })
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
      this.factionsBody.innerHTML = '<tr><td colspan="7">No factions.</td></tr>'
      this.membersBody.innerHTML = '<tr><td colspan="5">No members.</td></tr>'
      this.selectedFactionHeader.textContent = 'No selected faction.'
      this.memberInspector.textContent = 'Civilization system not active.'
      this.notesList.innerHTML = '<li class="bi-ov-list-item">No notes.</li>'
      this.dialoguesList.innerHTML = '<li class="bi-ov-list-item">No dialogues.</li>'
      this.relationMatrixHead.innerHTML = ''
      this.relationMatrixBody.innerHTML = '<tr><td>No relation data.</td></tr>'
      updateRollingDataset(this.relationChart!, [], 200)
      return
    }

    this.summaryLine.innerHTML = [
      `<strong>wars</strong> ${civ.wars}`,
      `<strong>trades</strong> ${civ.trades}`,
      `<strong>notes</strong> ${civ.notes.length}`,
      `<strong>members</strong> ${civ.factionMembers.length}`,
      `<strong>ethnicities</strong> ${civ.ethnicities.length}`,
      `<strong>religions</strong> ${civ.religions.filter((item) => item.name).length}`,
    ].join(' | ')

    this.reconcileSelection(civ)
    this.renderFactions(civ, snapshot)
    this.renderMembers(civ, snapshot)
    this.renderNotes(civ)
    this.renderDialogues(civ)
    this.renderRelations(civ)
  }

  destroy(): void {
    destroyChart(this.relationChart)
    this.relationChart = null
    this.root.remove()
  }

  private reconcileSelection(civ: NonNullable<SimulationSnapshot['civ']>): void {
    this.selectedSpeciesId = civ.selectedSpeciesId ?? null

    const factionIds = new Set(civ.factions.map((f) => f.id))
    const filteredFactions = this.selectedSpeciesId
      ? civ.factions.filter(
          (faction) =>
            faction.foundingSpeciesId === this.selectedSpeciesId ||
            faction.dominantSpeciesId === this.selectedSpeciesId,
        )
      : civ.factions

    const preferred = civ.selectedFactionId
    if (
      preferred &&
      factionIds.has(preferred) &&
      filteredFactions.some((faction) => faction.id === preferred)
    ) {
      this.selectedFactionId = preferred
    }
    if (
      !this.selectedFactionId ||
      !factionIds.has(this.selectedFactionId) ||
      !filteredFactions.some((faction) => faction.id === this.selectedFactionId)
    ) {
      this.selectedFactionId = filteredFactions[0]?.id ?? null
    }

    const members = civ.factionMembers.filter((member) => member.factionId === this.selectedFactionId)
    const memberIds = new Set(members.map((member) => member.agentId))
    if (!this.selectedMemberId || !memberIds.has(this.selectedMemberId)) {
      this.selectedMemberId = members[0]?.agentId ?? null
    }

    const relationKeys = new Set(civ.relationSeries.map((series) => series.relationKey))
    if (!this.selectedRelationKey || !relationKeys.has(this.selectedRelationKey)) {
      this.selectedRelationKey = civ.relationSeries[0]?.relationKey ?? null
    }
  }

  private renderFactions(
    civ: NonNullable<SimulationSnapshot['civ']>,
    snapshot: SimulationSnapshot,
  ): void {
    this.factionsBody.innerHTML = ''
    const speciesNameById = new Map<string, string>()
    for (let i = 0; i < snapshot.population.speciesRows.length; i++) {
      const species = snapshot.population.speciesRows[i]
      if (!species) continue
      speciesNameById.set(species.speciesId, species.commonName || species.name)
    }
    const ethnicityById = new Map(civ.ethnicities.map((ethnicity) => [ethnicity.id, ethnicity]))

    const factions = this.selectedSpeciesId
      ? civ.factions.filter(
          (faction) =>
            faction.foundingSpeciesId === this.selectedSpeciesId ||
            faction.dominantSpeciesId === this.selectedSpeciesId,
        )
      : civ.factions

    for (let i = 0; i < factions.length; i++) {
      const faction = factions[i]
      if (!faction) continue
      const tr = document.createElement('tr')
      if (faction.id === this.selectedFactionId) {
        tr.classList.add('is-selected')
      }
      tr.style.color = colorFromId(faction.id)
      const foundingSpecies = speciesNameById.get(faction.foundingSpeciesId) ?? faction.foundingSpeciesId
      const ethnicNames = faction.ethnicityIds
        .map((ethId) => ethnicityById.get(ethId)?.name ?? ethId)
        .slice(0, 3)
        .join(', ')
      tr.innerHTML = [
        `<td>${faction.name}</td>`,
        `<td>${foundingSpecies}</td>`,
        `<td>${ethnicNames || '-'}</td>`,
        `<td>${faction.population}</td>`,
        `<td>${faction.techLevel.toFixed(1)}</td>`,
        `<td>${faction.literacyLevel}</td>`,
        `<td>${faction.state}</td>`,
      ].join('')
      tr.addEventListener('click', () => {
        this.selectedFactionId = faction.id
        this.emitAction('selectCivFaction', { factionId: faction.id })
      })
      this.factionsBody.appendChild(tr)
    }
    if (this.factionsBody.childElementCount === 0) {
      this.factionsBody.innerHTML = '<tr><td colspan="7">No factions.</td></tr>'
    }
  }

  private renderMembers(civ: NonNullable<SimulationSnapshot['civ']>, snapshot: SimulationSnapshot): void {
    const faction = civ.factions.find((item) => item.id === this.selectedFactionId) ?? null
    if (!faction) {
      this.selectedFactionHeader.textContent = 'No selected faction.'
      this.membersBody.innerHTML = '<tr><td colspan="5">No members.</td></tr>'
      this.memberInspector.textContent = 'Select a faction first.'
      return
    }

    const speciesNameById = new Map<string, string>()
    for (let i = 0; i < snapshot.population.speciesRows.length; i++) {
      const species = snapshot.population.speciesRows[i]
      if (!species) continue
      speciesNameById.set(species.speciesId, species.commonName || species.name)
    }
    const ethnicityById = new Map(civ.ethnicities.map((ethnicity) => [ethnicity.id, ethnicity]))
    const factionEthnicities = faction.ethnicityIds
      .map((ethId) => ethnicityById.get(ethId)?.name ?? ethId)
      .join(', ')

    this.selectedFactionHeader.innerHTML = [
      `<strong>${faction.name}</strong> · ${faction.state}`,
      `founding species=${speciesNameById.get(faction.foundingSpeciesId) ?? faction.foundingSpeciesId} dominant=${speciesNameById.get(faction.dominantSpeciesId) ?? faction.dominantSpeciesId}`,
      `religion=${faction.religionName ?? '-'} symbol=${faction.identitySymbol ?? '-'}`,
      `ethnic groups=${factionEthnicities || '-'}`,
      `pop=${faction.population} tech=${faction.techLevel.toFixed(2)} literacy=${faction.literacyLevel}`,
      `strategy=${faction.strategy} practices=${faction.dominantPractices.join(', ') || '-'}`,
      `culture: collectivism=${faction.collectivism.toFixed(2)} aggression=${faction.aggression.toFixed(2)} curiosity=${faction.curiosity.toFixed(2)} adapt=${faction.environmentalAdaptation.toFixed(2)} techOrient=${faction.techOrientation.toFixed(2)}`,
      `territory tiles=${faction.territoryTiles}`,
    ].join('\n')

    const members = civ.factionMembers
      .filter((member) => member.factionId === faction.id)
      .sort((a, b) => b.energy - a.energy || a.name.localeCompare(b.name))

    this.membersBody.innerHTML = ''
    for (let i = 0; i < members.length; i++) {
      const member = members[i]
      if (!member) continue
      const tr = document.createElement('tr')
      if (member.agentId === this.selectedMemberId) {
        tr.classList.add('is-selected')
      }
      tr.innerHTML = [
        `<td>${member.name}</td>`,
        `<td><span class="bi-ov-chip" style="background:${roleBadgeColor(member.role)}">${member.role}</span></td>`,
        `<td>${member.age.toFixed(1)}</td>`,
        `<td>${member.energy.toFixed(1)}</td>`,
        `<td>${member.activityState}</td>`,
      ].join('')
      tr.addEventListener('click', () => {
        this.selectedMemberId = member.agentId
        this.emitAction('focusWorldPoint', { x: member.x, y: member.y })
        this.emitAction('inspectCivAgent', { agentId: member.agentId })
      })
      this.membersBody.appendChild(tr)
    }
    if (this.membersBody.childElementCount === 0) {
      this.membersBody.innerHTML = '<tr><td colspan="5">No members for selected faction.</td></tr>'
    }

    const selectedMember = members.find((member) => member.agentId === this.selectedMemberId) ?? null
    if (!selectedMember) {
      this.memberInspector.textContent = 'Select a member from the table.'
      return
    }

    const selectedAgent = snapshot.selectedAgent && snapshot.selectedAgent.agentId === selectedMember.agentId
      ? snapshot.selectedAgent
      : null

    const inventoryLines = selectedAgent
      ? selectedAgent.inventoryRows.map((row) => `${row.itemName} x${row.quantity} (w=${row.totalWeight.toFixed(2)})`)
      : selectedMember.inventoryItems.map((row) => `${row.itemId} x${row.quantity}`)

    const equipment = selectedAgent?.equipmentSlots ?? selectedMember.equipmentSlots
    const mental = selectedAgent?.mentalState ?? selectedMember.mentalState

    this.memberInspector.textContent = [
      `${selectedMember.name} (${selectedMember.role})`,
      `species=${speciesNameById.get(selectedMember.speciesId) ?? selectedMember.speciesId}`,
      `ethnicity=${selectedMember.ethnicityId ? ethnicityById.get(selectedMember.ethnicityId)?.name ?? selectedMember.ethnicityId : '-'}`,
      `civilization=${selectedMember.factionName}`,
      `goal=${selectedMember.goal} state=${selectedMember.activityState}`,
      `energy=${selectedMember.energy.toFixed(1)} hydration=${selectedMember.hydration.toFixed(1)} age=${selectedMember.age.toFixed(1)}`,
      `carry=${(selectedAgent?.currentCarryWeight ?? selectedMember.currentCarryWeight).toFixed(2)} / ${(selectedAgent?.maxCarryWeight ?? selectedMember.maxCarryWeight).toFixed(2)}`,
      `equipment: main=${equipment.mainHand ?? '-'} off=${equipment.offHand ?? '-'} body=${equipment.body ?? '-'} util=${equipment.utility ?? '-'}`,
      `inventory: ${inventoryLines.length > 0 ? inventoryLines.join(' | ') : '-'}`,
      '',
      `mental.goal=${mental.currentGoal}`,
      `mental.reasons=${mental.lastReasonCodes.join(', ') || '-'}`,
      `mental.target=${mental.targetLabel} @ (${mental.targetX}, ${mental.targetY})`,
      `mental.food=${(clamp01(mental.perceivedFoodLevel) * 100).toFixed(0)}% threat=${(clamp01(mental.perceivedThreatLevel) * 100).toFixed(0)}% stress=${(clamp01(mental.stressLevel) * 100).toFixed(0)}% loyalty=${(clamp01(mental.loyaltyToFaction) * 100).toFixed(0)}%`,
      selectedAgent ? `thought=${selectedAgent.thought}` : '',
      selectedAgent?.thoughtGloss ? `thought gloss=${selectedAgent.thoughtGloss}` : 'thought gloss=not generated',
      selectedAgent?.narrativeBio ? `bio=${selectedAgent.narrativeBio}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  private renderNotes(civ: NonNullable<SimulationSnapshot['civ']>): void {
    this.notesList.innerHTML = ''
    const notes = civ.notes
      .filter((note) => !this.selectedFactionId || note.factionId === this.selectedFactionId)
      .slice(-120)

    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i]
      if (!note) continue
      const li = document.createElement('li')
      li.className = 'bi-ov-list-item bi-ov-items-ground-item'

      const body = document.createElement('div')
      body.innerHTML = [
        `<strong>${note.id}</strong> faction=${note.factionId}`,
        `t=${note.createdAtTick} pos=(${note.x}, ${note.y})`,
        `tokens=${note.tokenContent}`,
        note.translatedContent ? `text=${note.translatedContent}` : 'text=not translated',
      ].join('<br/>')

      const actions = document.createElement('div')
      actions.style.display = 'grid'
      actions.style.gap = '6px'

      const focusBtn = document.createElement('button')
      focusBtn.type = 'button'
      focusBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
      focusBtn.textContent = 'Focus'
      focusBtn.addEventListener('click', () => {
        this.emitAction('selectCivNote', { noteId: note.id })
        this.emitAction('focusWorldPoint', { x: note.x, y: note.y })
      })

      const translateBtn = document.createElement('button')
      translateBtn.type = 'button'
      translateBtn.className = 'bi-ov-btn bi-ov-btn-ghost'
      translateBtn.textContent = 'Translate'
      translateBtn.addEventListener('click', () => {
        this.emitAction('requestNoteTranslation', { noteId: note.id })
      })

      actions.append(focusBtn, translateBtn)
      li.append(body, actions)
      this.notesList.appendChild(li)
    }

    if (this.notesList.childElementCount === 0) {
      this.notesList.innerHTML = '<li class="bi-ov-list-item">No notes for selected faction.</li>'
    }
  }

  private renderDialogues(civ: NonNullable<SimulationSnapshot['civ']>): void {
    this.dialoguesList.innerHTML = ''
    const rows = civ.recentDialogues
      .filter((row) => !this.selectedFactionId || row.factionId === this.selectedFactionId)
      .slice(-40)

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]
      if (!row) continue
      const li = document.createElement('li')
      li.className = 'bi-ov-list-item'
      li.textContent = [
        `[t${row.tick}] ${row.topic} (${row.factionId})`,
        ...row.lines,
        row.gloss ? `gloss: ${row.gloss}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      this.dialoguesList.appendChild(li)
    }

    if (this.dialoguesList.childElementCount === 0) {
      this.dialoguesList.innerHTML = '<li class="bi-ov-list-item">No dialogues in current filter.</li>'
    }
  }

  private renderRelations(civ: NonNullable<SimulationSnapshot['civ']>): void {
    const factions = civ.factions
    this.relationMatrixHead.innerHTML = ''
    this.relationMatrixBody.innerHTML = ''

    if (factions.length === 0) {
      this.relationMatrixBody.innerHTML = '<tr><td>No relation data.</td></tr>'
      updateRollingDataset(this.relationChart!, [], 240)
      return
    }

    const matrix = new Map<string, { status: string; trust: number; tension: number }>()
    for (let i = 0; i < civ.relations.length; i++) {
      const relation = civ.relations[i]
      if (!relation) continue
      const key = `${relation.fromId}|${relation.toId}`
      matrix.set(key, {
        status: relation.status,
        trust: relation.trust,
        tension: relation.tension,
      })
    }

    const headRow = document.createElement('tr')
    headRow.innerHTML = `<th>faction</th>${factions.map((faction) => `<th>${faction.name}</th>`).join('')}`
    this.relationMatrixHead.appendChild(headRow)

    for (let r = 0; r < factions.length; r++) {
      const rowFaction = factions[r]
      if (!rowFaction) continue
      const tr = document.createElement('tr')
      const cells: string[] = [`<td><strong>${rowFaction.name}</strong></td>`]
      for (let c = 0; c < factions.length; c++) {
        const colFaction = factions[c]
        if (!colFaction) continue
        if (rowFaction.id === colFaction.id) {
          cells.push('<td>•</td>')
          continue
        }
        const a = rowFaction.id < colFaction.id ? rowFaction.id : colFaction.id
        const b = rowFaction.id < colFaction.id ? colFaction.id : rowFaction.id
        const key = `${a}|${b}`
        const rel = matrix.get(key)
        if (!rel) {
          cells.push('<td>-</td>')
          continue
        }
        const short = rel.status === 'hostile'
          ? 'W'
          : rel.status === 'ally'
            ? 'A'
            : rel.status === 'trade'
              ? 'T'
              : 'N'
        cells.push(`<td title="trust=${rel.trust.toFixed(2)} tension=${rel.tension.toFixed(2)}">${short}</td>`)
      }
      tr.innerHTML = cells.join('')
      this.relationMatrixBody.appendChild(tr)
    }

    const series = civ.relationSeries.find((item) => item.relationKey === this.selectedRelationKey) ?? civ.relationSeries[0]
    if (!series) {
      updateRollingDataset(this.relationChart!, [], 240)
      return
    }
    this.selectedRelationKey = series.relationKey

    updateRollingDataset(
      this.relationChart!,
      [
        {
          label: `${series.fromId}-${series.toId} trust`,
          color: 'rgba(118, 205, 255, 0.92)',
          points: series.points.map((point) => ({ tick: point.tick, value: point.trust })),
        },
        {
          label: `${series.fromId}-${series.toId} tension`,
          color: 'rgba(255, 132, 132, 0.92)',
          points: series.points.map((point) => ({ tick: point.tick, value: point.tension })),
        },
      ],
      240,
    )
  }

  private createTitle(text: string): HTMLElement {
    const title = document.createElement('h3')
    title.className = 'bi-ov-card-title'
    title.textContent = text
    return title
  }
}
