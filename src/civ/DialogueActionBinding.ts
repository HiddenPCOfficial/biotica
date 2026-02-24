import type { Agent, AgentPlan, PlanActionStep, ReasonCode } from './types'

export type DialogueBindingInput = {
  tick: number
  factionId: string
  factionName: string
  speakerA: Agent
  speakerB: Agent
  planA: AgentPlan | null
  planB: AgentPlan | null
  stepA: PlanActionStep | null
  stepB: PlanActionStep | null
}

export type DialogueBindingResult = {
  topic: string
  lineA: string
  lineB: string
  actionContext: string
  recentFactionUtterances: string[]
}

function hashText(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function gestureFromStep(step: PlanActionStep | null): string {
  if (!step) return 'Mentre osserva l area'
  switch (step.actionType) {
    case 'gather_resource':
      return 'Mentre raccoglie risorse'
    case 'hunt_prey':
      return 'Mentre segue tracce nel terreno'
    case 'construct':
      return 'Mentre alza una struttura'
    case 'fortify_border':
      return 'Mentre rinforza il confine'
    case 'farm_plot':
      return 'Mentre prepara il campo'
    case 'trade_exchange':
      return 'Mentre conta beni da scambiare'
    case 'defend_area':
      return 'Mentre presidia il perimetro'
    case 'invent_tool':
      return 'Mentre prova nuovi utensili'
    case 'write_record':
      return 'Mentre incide appunti'
    case 'negotiate_terms':
      return 'Mentre parla al consiglio'
    case 'claim_territory':
      return 'Mentre marca il nuovo confine'
    case 'domesticate':
      return 'Mentre osserva specie mansuete'
    case 'relocate_home':
      return 'Mentre guida il gruppo verso una nuova base'
    case 'move_to':
      return 'Mentre avanza verso il target'
    case 'observe':
    default:
      return 'Mentre studia l ambiente'
  }
}

function topicFromIntent(intent: AgentPlan['intent'] | null): string {
  if (!intent) return 'discovery'
  switch (intent) {
    case 'trade':
    case 'negotiate':
      return 'trade'
    case 'defend':
    case 'fortify':
      return 'war'
    case 'write':
      return 'law'
    case 'build':
    case 'farm':
    case 'domesticate_species':
      return 'hope'
    case 'migrate':
      return 'fear'
    default:
      return 'discovery'
  }
}

function lineTemplates(intent: AgentPlan['intent'] | null): string[] {
  switch (intent) {
    case 'build':
      return [
        'Se completiamo questo riparo, la notte non ci spezza.',
        'Tengo il ritmo: prima materiali, poi struttura.',
        'Questa costruzione deve reggere anche con eventi duri.',
      ]
    case 'fortify':
      return [
        'Qui chiudiamo il varco e riduciamo il rischio.',
        'Prima i pali, poi una linea difensiva continua.',
        'Non arretriamo: fortifichiamo adesso.',
      ]
    case 'migrate':
      return [
        'Questa zona non regge, ci spostiamo in un punto migliore.',
        'Nuovo centro, nuove scorte: muoviamoci in ordine.',
        'Seguite il percorso, rifondiamo il campo oltre il pericolo.',
      ]
    case 'farm':
      return [
        'Stabiliamo un campo produttivo e meno dipendente dal caso.',
        'Coltiviamo qui: resa alta e stress basso.',
        'La raccolta regolare ci tiene vivi nei cicli duri.',
      ]
    case 'trade':
      return [
        'Scambiamo bene ora, evitiamo conflitti dopo.',
        'Porto risorse in eccesso, torno con ciò che manca.',
        'Un patto locale ci fa risparmiare energia.',
      ]
    case 'defend':
      return [
        'Presidiamo il perimetro, nessun varco scoperto.',
        'Resto in guardia: priorita sicurezza del gruppo.',
        'Difesa attiva, poi possiamo tornare alle scorte.',
      ]
    case 'invent':
      return [
        'Provo una variante: se funziona, guadagniamo efficienza.',
        'Sperimentiamo ora, standardizziamo dopo.',
        'Nuovo strumento, meno sprechi nelle prossime fasi.',
      ]
    case 'write':
      return [
        'Segno cio che impariamo: errore una volta sola.',
        'Scrivere ora ci evita caos nei prossimi turni.',
        'Registro decisioni e risultati per tutto il gruppo.',
      ]
    case 'negotiate':
      return [
        'Coordiniamo i ruoli, poi eseguiamo senza attrito.',
        'Serve allineamento rapido: obiettivo unico e chiaro.',
        'Accordo breve, azione immediata.',
      ]
    case 'expand_territory':
      return [
        'Estendiamo il confine dove possiamo mantenere controllo.',
        'Nuovo avamposto, stessa disciplina.',
        'Prendiamo spazio solo se possiamo difenderlo.',
      ]
    case 'domesticate_species':
      return [
        'Se stabilizziamo le specie vicine, la resa cresce.',
        'Osservo i pattern: possiamo integrare questa specie.',
        'Domestichiamo con cautela, poi aumentiamo scala.',
      ]
    case 'hunt':
      return [
        'Cerco prede utili, ritorno con risorse ad alta resa.',
        'Resto mobile e riduco il rischio durante la caccia.',
        'Tracce fresche: agisco rapido e torno subito.',
      ]
    case 'gather':
      return [
        'Raccolgo adesso per assorbire i picchi di consumo.',
        'Serve una riserva pulita prima del prossimo evento.',
        'Prendo il necessario senza disperdere energia.',
      ]
    case 'explore':
    default:
      return [
        'Leggo il territorio e aggiorno la rotta migliore.',
        'Esploro ora per evitare errori su larga scala.',
        'Nuove informazioni prima della prossima decisione.',
      ]
  }
}

/**
 * Vincola il testo al piano realmente attivo e riduce ripetizioni.
 */
export class DialogueActionBinding {
  private readonly factionMemory = new Map<string, string[]>()

  build(input: DialogueBindingInput): DialogueBindingResult {
    const recent = this.factionMemory.get(input.factionId) ?? []
    const intentA = input.planA?.intent ?? null
    const intentB = input.planB?.intent ?? intentA
    const topic = topicFromIntent(intentA)

    const textA = this.pickTemplate(input, intentA, input.speakerA.id, input.stepA?.targetLabel ?? 'target', recent)
    const textB = this.pickTemplate(input, intentB, input.speakerB.id, input.stepB?.targetLabel ?? 'target', recent)

    const lineA = `[${gestureFromStep(input.stepA)}] "${textA}"`
    const lineB = `[${gestureFromStep(input.stepB)}] "${textB}"`

    const actionContext = [
      `faction=${input.factionName}`,
      `intentA=${intentA ?? 'none'}`,
      `intentB=${intentB ?? 'none'}`,
      `stepA=${input.stepA?.actionType ?? 'none'} target=${input.stepA?.targetLabel ?? '-'}`,
      `stepB=${input.stepB?.actionType ?? 'none'} target=${input.stepB?.targetLabel ?? '-'}`,
      `toneA=${input.speakerA.mentalState.emotionalTone}`,
      `toneB=${input.speakerB.mentalState.emotionalTone}`,
      `reasonsA=${input.speakerA.mentalState.lastReasonCodes.join(',') || 'none'}`,
      `reasonsB=${input.speakerB.mentalState.lastReasonCodes.join(',') || 'none'}`,
    ].join(' | ')

    this.remember(input.factionId, lineA)
    this.remember(input.factionId, lineB)

    return {
      topic,
      lineA,
      lineB,
      actionContext,
      recentFactionUtterances: [...(this.factionMemory.get(input.factionId) ?? [])],
    }
  }

  private pickTemplate(
    input: DialogueBindingInput,
    intent: AgentPlan['intent'] | null,
    speakerId: string,
    targetLabel: string,
    recent: string[],
  ): string {
    const options = lineTemplates(intent)
    if (options.length === 0) {
      return 'Procediamo con il piano corrente.'
    }

    const key = `${input.tick}:${input.factionId}:${speakerId}:${intent ?? 'none'}:${targetLabel}`
    let index = hashText(key) % options.length

    for (let i = 0; i < options.length; i++) {
      const candidate = options[(index + i) % options.length]
      if (!candidate) continue
      const seenRecently = recent.some((row) => this.similarity(row, candidate) > 0.86)
      if (!seenRecently) {
        return candidate
      }
    }

    return options[index] ?? options[0] ?? 'Manteniamo il piano.'
  }

  private similarity(a: string, b: string): number {
    const na = a.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim()
    const nb = b.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim()
    if (!na || !nb) return 0
    if (na === nb) return 1
    const wa = new Set(na.split(/\s+/))
    const wb = new Set(nb.split(/\s+/))
    let shared = 0
    for (const token of wa) {
      if (wb.has(token)) shared += 1
    }
    return shared / Math.max(1, Math.max(wa.size, wb.size))
  }

  private remember(factionId: string, utterance: string): void {
    const list = this.factionMemory.get(factionId) ?? []
    list.push(utterance)
    if (list.length > 5) {
      list.splice(0, list.length - 5)
    }
    this.factionMemory.set(factionId, list)
  }
}
