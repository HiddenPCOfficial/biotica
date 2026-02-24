import { CreatureDescriptionService } from '../ai/llm/services/CreatureDescriptionService'
import { CreatureSystem } from '../creatures/CreatureSystem'
import type { Creature, Species } from '../creatures/types'

type InspectorContext = {
  biomeName?: string
}

type ParsedDescription = {
  title?: string
  short?: string
  long?: string
  behaviors?: string[]
  diet?: string
  risks?: string[]
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Overlay HTML per ispezione creatura:
 * - pannello stats vitali e bisogni
 * - descrizione LLM formattata
 * - toggle JSON raw della descrizione pronta
 */
export class CreatureInspector {
  private readonly root = document.createElement('aside')
  private readonly titleEl = document.createElement('h2')
  private readonly statusEl = document.createElement('div')
  private readonly vitalsEl = document.createElement('div')
  private readonly needsEl = document.createElement('div')
  private readonly infoEl = document.createElement('pre')
  private readonly descriptionEl = document.createElement('pre')
  private readonly rawDescriptionEl = document.createElement('pre')

  private readonly regenerateBtn = document.createElement('button')
  private readonly toggleJsonBtn = document.createElement('button')
  private readonly closeBtn = document.createElement('button')

  private currentCreature: Creature | null = null
  private currentSpecies: Species | null = null
  private currentContext: InspectorContext = {}

  private rawDescription = ''
  private showRawJson = false

  constructor(
    private readonly descriptionService: CreatureDescriptionService,
    private readonly creatureSystem: CreatureSystem,
    parent: HTMLElement = document.body,
  ) {
    this.root.className = 'creature-inspector'
    this.root.style.position = 'fixed'
    this.root.style.top = '16px'
    this.root.style.right = '16px'
    this.root.style.width = '390px'
    this.root.style.maxHeight = 'calc(100vh - 32px)'
    this.root.style.overflow = 'auto'
    this.root.style.padding = '12px'
    this.root.style.borderRadius = '12px'
    this.root.style.background = 'linear-gradient(165deg, rgba(11,16,25,0.94), rgba(13,23,36,0.9))'
    this.root.style.border = '1px solid rgba(154, 190, 255, 0.22)'
    this.root.style.color = '#eaf2ff'
    this.root.style.fontFamily = 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace'
    this.root.style.zIndex = '70'
    this.root.style.display = 'none'

    this.titleEl.style.margin = '0 0 10px 0'
    this.titleEl.style.fontSize = '15px'
    this.titleEl.style.letterSpacing = '0.02em'

    const actions = document.createElement('div')
    actions.style.display = 'flex'
    actions.style.flexWrap = 'wrap'
    actions.style.gap = '8px'
    actions.style.marginBottom = '10px'

    this.regenerateBtn.textContent = 'Regenera'
    this.regenerateBtn.style.cursor = 'pointer'
    this.regenerateBtn.onclick = () => {
      void this.loadDescription(true)
    }

    this.toggleJsonBtn.textContent = 'Mostra JSON'
    this.toggleJsonBtn.style.cursor = 'pointer'
    this.toggleJsonBtn.onclick = () => {
      this.showRawJson = !this.showRawJson
      this.updateDescriptionView()
    }

    this.closeBtn.textContent = 'Chiudi'
    this.closeBtn.style.cursor = 'pointer'
    this.closeBtn.onclick = () => {
      this.hide()
    }

    actions.appendChild(this.regenerateBtn)
    actions.appendChild(this.toggleJsonBtn)
    actions.appendChild(this.closeBtn)

    this.statusEl.style.fontSize = '12px'
    this.statusEl.style.opacity = '0.85'
    this.statusEl.style.marginBottom = '8px'

    this.vitalsEl.style.display = 'grid'
    this.vitalsEl.style.gap = '7px'
    this.vitalsEl.style.marginBottom = '8px'
    this.vitalsEl.style.padding = '8px'
    this.vitalsEl.style.borderRadius = '8px'
    this.vitalsEl.style.border = '1px solid rgba(157, 191, 255, 0.18)'
    this.vitalsEl.style.background = 'rgba(13, 20, 31, 0.58)'

    this.needsEl.style.display = 'grid'
    this.needsEl.style.gap = '7px'
    this.needsEl.style.marginBottom = '10px'
    this.needsEl.style.padding = '8px'
    this.needsEl.style.borderRadius = '8px'
    this.needsEl.style.border = '1px solid rgba(157, 191, 255, 0.18)'
    this.needsEl.style.background = 'rgba(13, 20, 31, 0.58)'

    this.infoEl.style.margin = '0 0 10px 0'
    this.infoEl.style.whiteSpace = 'pre-wrap'
    this.infoEl.style.fontSize = '11px'
    this.infoEl.style.lineHeight = '1.38'
    this.infoEl.style.background = 'rgba(255,255,255,0.04)'
    this.infoEl.style.padding = '8px'
    this.infoEl.style.borderRadius = '6px'

    this.descriptionEl.style.margin = '0'
    this.descriptionEl.style.whiteSpace = 'pre-wrap'
    this.descriptionEl.style.fontSize = '12px'
    this.descriptionEl.style.lineHeight = '1.42'
    this.descriptionEl.style.background = 'rgba(255,255,255,0.04)'
    this.descriptionEl.style.padding = '8px'
    this.descriptionEl.style.borderRadius = '6px'

    this.rawDescriptionEl.style.margin = '8px 0 0 0'
    this.rawDescriptionEl.style.whiteSpace = 'pre-wrap'
    this.rawDescriptionEl.style.fontSize = '11px'
    this.rawDescriptionEl.style.lineHeight = '1.4'
    this.rawDescriptionEl.style.background = 'rgba(9, 14, 24, 0.75)'
    this.rawDescriptionEl.style.border = '1px solid rgba(146, 184, 255, 0.2)'
    this.rawDescriptionEl.style.padding = '8px'
    this.rawDescriptionEl.style.borderRadius = '6px'
    this.rawDescriptionEl.style.display = 'none'

    this.root.appendChild(this.titleEl)
    this.root.appendChild(actions)
    this.root.appendChild(this.statusEl)
    this.root.appendChild(this.vitalsEl)
    this.root.appendChild(this.needsEl)
    this.root.appendChild(this.infoEl)
    this.root.appendChild(this.descriptionEl)
    this.root.appendChild(this.rawDescriptionEl)
    parent.appendChild(this.root)
  }

  show(creature: Creature, species: Species, context: InspectorContext = {}): void {
    this.currentCreature = creature
    this.currentSpecies = species
    this.currentContext = context
    this.root.style.display = 'block'

    this.showRawJson = false
    this.rawDescription = ''
    this.toggleJsonBtn.textContent = 'Mostra JSON'
    this.toggleJsonBtn.disabled = true

    this.titleEl.textContent = `${creature.name} (${species.commonName})`
    this.infoEl.textContent = this.formatCreatureInfo(creature, species, context.biomeName)
    this.renderVitals(creature)
    this.descriptionEl.textContent = ''
    this.rawDescriptionEl.textContent = ''
    this.rawDescriptionEl.style.display = 'none'
    this.statusEl.textContent = 'Caricamento descrizione...'

    void this.loadDescription(false)
  }

  hide(): void {
    this.root.style.display = 'none'
  }

  destroy(): void {
    this.root.remove()
  }

  private async loadDescription(forceRefresh: boolean): Promise<void> {
    if (!this.currentCreature || !this.currentSpecies) {
      return
    }

    const creature = this.currentCreature
    const species = this.currentSpecies

    this.regenerateBtn.disabled = true
    this.statusEl.textContent = forceRefresh ? 'Rigenerazione in corso...' : 'Generazione in corso...'

    try {
      const cached = !forceRefresh ? this.creatureSystem.getCachedDescription(creature.id) : undefined
      const description =
        cached ??
        (await this.descriptionService.generateDescription(creature, species, {
          biomeName: this.currentContext.biomeName,
          forceRefresh,
        }))

      this.creatureSystem.setCachedDescription(creature.id, description)
      creature.description = description
      this.rawDescription = description
      this.toggleJsonBtn.disabled = false
      this.updateDescriptionView()
      this.statusEl.textContent = 'Descrizione pronta (toggle JSON disponibile)'
    } catch {
      this.descriptionEl.textContent =
        'Errore in fase di generazione descrizione. Controlla il provider LLM locale.'
      this.rawDescription = ''
      this.rawDescriptionEl.textContent = ''
      this.rawDescriptionEl.style.display = 'none'
      this.toggleJsonBtn.disabled = true
      this.statusEl.textContent = 'Errore'
    } finally {
      this.regenerateBtn.disabled = false
    }
  }

  private updateDescriptionView(): void {
    this.toggleJsonBtn.textContent = this.showRawJson ? 'Nascondi JSON' : 'Mostra JSON'
    this.descriptionEl.textContent = this.formatDescription(this.rawDescription)
    this.rawDescriptionEl.textContent = this.rawDescription
    this.rawDescriptionEl.style.display = this.showRawJson ? 'block' : 'none'
  }

  private renderVitals(creature: Creature): void {
    const energyMax = Math.max(1, creature.genome.maxEnergy)
    const hungerNeed = clamp01(1 - creature.energy / energyMax)
    const waterNeed = clamp01(creature.waterNeed)
    const thermalNeed = clamp01((creature.tempStress + creature.humidityStress) * 0.5)
    const ageLoad = clamp01(creature.age / Math.max(1, creature.maxAge))
    const vitality = clamp01(
      (1 - hungerNeed) * 0.36 +
      (1 - waterNeed) * 0.34 +
      (1 - thermalNeed) * 0.2 +
      (1 - ageLoad) * 0.1,
    )

    const lifeRows = [
      this.renderBarRow('Energia', clamp01(creature.energy / energyMax), '#73c6ff', `${creature.energy.toFixed(1)}/${energyMax.toFixed(0)}`),
      this.renderBarRow('Salute', clamp01(creature.health / 100), '#6ce59d', `${creature.health.toFixed(1)}/100`),
      this.renderBarRow('Acqua', clamp01(creature.hydration / 100), '#62b3ff', `${creature.hydration.toFixed(1)}/100`),
      this.renderBarRow('Vitalita', vitality, '#a8f590', `${(vitality * 100).toFixed(0)}%`),
    ]
    this.vitalsEl.innerHTML = `<div style="font-size:12px;color:#bfd3f8">Stats Vita</div>${lifeRows.join('')}`

    const needsRows = [
      this.renderBarRow('Bisogno Cibo', hungerNeed, '#ffb16c', `${(hungerNeed * 100).toFixed(0)}%`),
      this.renderBarRow('Bisogno Acqua', waterNeed, '#7dc0ff', `${(waterNeed * 100).toFixed(0)}%`),
      this.renderBarRow('Stress Clima', thermalNeed, '#ff8f8f', `${(thermalNeed * 100).toFixed(0)}%`),
      this.renderBarRow('Fatica Eta', ageLoad, '#d2a7ff', `${(ageLoad * 100).toFixed(0)}%`),
    ]
    this.needsEl.innerHTML = `<div style="font-size:12px;color:#bfd3f8">Bisogni Correnti</div>${needsRows.join('')}`
  }

  private renderBarRow(label: string, value01: number, color: string, valueText: string): string {
    const pct = Math.round(clamp01(value01) * 100)
    return [
      '<div style="display:grid;grid-template-columns:110px 1fr auto;gap:8px;align-items:center;">',
      `<div style="font-size:11px;color:#d8e6ff">${label}</div>`,
      '<div style="height:7px;background:rgba(255,255,255,0.14);border-radius:999px;overflow:hidden;">',
      `<div style="height:100%;width:${pct}%;background:${color};"></div>`,
      '</div>',
      `<div style="font-size:11px;color:#b8ccf2">${valueText}</div>`,
      '</div>',
    ].join('')
  }

  private formatCreatureInfo(creature: Creature, species: Species, biomeName?: string): string {
    return [
      `id: ${creature.id}`,
      `speciesId: ${creature.speciesId}`,
      `specie: ${species.commonName}`,
      `generazione: ${creature.generation}`,
      `eta: ${creature.age.toFixed(1)} / ${creature.maxAge.toFixed(1)}`,
      `posizione tile: (${creature.x}, ${creature.y})`,
      `bioma: ${biomeName ?? 'n.d.'}`,
      `biomi consentiti specie: ${species.allowedBiomes.join(', ')}`,
      `stress temp/umidita: ${creature.tempStress.toFixed(3)} / ${creature.humidityStress.toFixed(3)}`,
      `traits: ${species.traits.join(', ')}`,
      `genome: ${JSON.stringify(creature.genome, null, 2)}`,
    ].join('\n')
  }

  private formatDescription(value: string): string {
    const parsed = this.tryParseDescription(value)
    if (!parsed) {
      return value
    }

    return [
      `Titolo: ${parsed.title ?? '-'}`,
      '',
      `Sintesi: ${parsed.short ?? '-'}`,
      '',
      `Dettaglio: ${parsed.long ?? '-'}`,
      '',
      `Comportamenti: ${(parsed.behaviors ?? []).join(', ') || '-'}`,
      `Dieta: ${parsed.diet ?? '-'}`,
      `Rischi: ${(parsed.risks ?? []).join(', ') || '-'}`,
    ].join('\n')
  }

  private tryParseDescription(value: string): ParsedDescription | null {
    try {
      const parsed = JSON.parse(value) as ParsedDescription
      if (!parsed || typeof parsed !== 'object') {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }
}
