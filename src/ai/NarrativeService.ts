import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { initChatModel } from 'langchain/chat_models/universal'

import { getAiModelConfig, type AiModelConfig } from './AiModelRegistry'
import type {
  CommunicationSummary,
  DialoguePayload,
  Faction,
  FactionNarrative,
  UtteranceTranslation,
} from '../civ/types'

type DialogueContext = {
  factionName: string
  speakerAName: string
  speakerBName: string
  contextSummary: string
  actionContext?: string
  currentIntent?: string
  activePlan?: string
  mentalStateSummary?: string
  recentUtterances?: string[]
}

type AgentBioContext = {
  agentName: string
  factionName: string
  role: string
  energy: number
  hydration: number
  age: number
  goal: string
  inventorySummary: string
  vitals?: string
}

type TranslationContext = {
  communication: CommunicationSummary
  utteranceTokens: string[]
  contextSummary: string
}

type ThoughtGlossContext = {
  agentName: string
  factionName: string
  goal: string
  lastAction: string
  reasons: string[]
  sensorySummary: string
}

type WritingNoteTranslationContext = {
  factionName: string
  literacyLevel: number
  tokenContent: string
  symbolSet: string[]
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * LLM narrativo (locale) per civiltà:
 * - solo testi/nomi/dialoghi/cronache
 * - cache + dedup + throttling
 * - fallback deterministico se provider non disponibile
 *
 * Provider scelto: Ollama locale.
 * TODO: importare GGUF in Ollama e taggare il modello
 * (es: TheBloke/vicuna-7B-1.1-q4_0).
 */
export class NarrativeService {
  private readonly cache = new Map<string, unknown>()
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private modelPromise: Promise<any> | null = null
  private readonly modelConfig: AiModelConfig

  private queue: Promise<void> = Promise.resolve()
  private nextAllowedAt = 0
  private readonly minIntervalMs: number

  constructor(model?: string, baseUrl?: string, minIntervalMs?: number) {
    this.modelConfig = getAiModelConfig('narrative', {
      model,
      baseUrl,
      minIntervalMs,
    })
    this.minIntervalMs = this.modelConfig.minIntervalMs
  }

  async generateFactionIdentity(
    faction: Faction,
    worldSummary: string,
  ): Promise<FactionNarrative> {
    const cacheKey = `identity:${faction.id}:${worldSummary}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached as FactionNarrative
    }

    const existing = this.inFlight.get(cacheKey)
    if (existing) {
      return existing as Promise<FactionNarrative>
    }

    const task = this.runThrottled(async () => {
      try {
        const model = await this.getModel()
        const parser = new StringOutputParser()
        const prompt = ChatPromptTemplate.fromMessages([
          [
            'system',
            [
              'Sei un autore tecnico per un simulatore di civiltà nascente.',
              'Rispondi SOLO JSON valido, senza testo extra.',
              'Lingua: italiano.',
              'Stile: sobrio, plausibile, non fantasy.',
              'Schema:',
              '{"name":"string","motto":"string","religion":"string","coreLaws":["string"]}',
            ].join('\n'),
          ],
          [
            'human',
            [
              'Dati fazione:',
              `id: ${faction.id}`,
              `nome corrente: ${this.factionNameLabel(faction)}`,
              `ideologia: ${faction.ideology}`,
              `religione corrente: ${this.factionReligionLabel(faction)}`,
              `leggi attuali: ${faction.laws.join(', ')}`,
              `cultura: collectivism=${faction.cultureParams.collectivism.toFixed(2)}, aggression=${faction.cultureParams.aggression.toFixed(2)}, spirituality=${faction.cultureParams.spirituality.toFixed(2)}, curiosity=${faction.cultureParams.curiosity.toFixed(2)}`,
              `summary mondo: ${worldSummary}`,
              'Vincoli: massimo 4 leggi brevi.',
            ].join('\n'),
          ],
        ])

        const chain = prompt.pipe(model).pipe(parser)
        const raw = await chain.invoke({})
        const normalized = this.normalizeIdentity(raw, faction)
        this.cache.set(cacheKey, normalized)
        return normalized
      } catch {
        const fallback = this.fallbackIdentity(faction)
        this.cache.set(cacheKey, fallback)
        return fallback
      }
    })

    this.inFlight.set(cacheKey, task)
    try {
      const value = await task
      return value
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  async generateDialogue(context: DialogueContext): Promise<DialoguePayload> {
    const cacheKey = `dialogue:${context.factionName}:${context.speakerAName}:${context.speakerBName}:${context.contextSummary}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached as DialoguePayload
    }

    const existing = this.inFlight.get(cacheKey)
    if (existing) {
      return existing as Promise<DialoguePayload>
    }

    const task = this.runThrottled(async () => {
      try {
        const model = await this.getModel()
        const parser = new StringOutputParser()
        const prompt = ChatPromptTemplate.fromMessages([
          [
            'system',
            [
              'Genera dialoghi brevi per una civiltà primitiva in un simulatore.',
              'Rispondi SOLO JSON valido, nessun testo esterno.',
              'Lingua: italiano.',
              'Schema JSON richiesto:',
              '{"topic":"discovery|trade|war|religion|law|fear|hope","lines":[{"speaker":"A","text":"..."}],"new_terms":["..."],"belief_update":{"spirituality_delta":0.0,"taboo_hazard":false}}',
            ].join('\n'),
          ],
          [
            'human',
            [
              `fazione: ${context.factionName}`,
              `speaker A: ${context.speakerAName}`,
              `speaker B: ${context.speakerBName}`,
              `contesto: ${context.contextSummary}`,
              `action_context: ${context.actionContext ?? '-'}`,
              `intent: ${context.currentIntent ?? '-'}`,
              `active_plan: ${context.activePlan ?? '-'}`,
              `mental_state: ${context.mentalStateSummary ?? '-'}`,
              `recent_utterances: ${(context.recentUtterances ?? []).slice(-5).join(' || ') || '-'}`,
              'Usa massimo 2 linee (A e B).',
              'Crea 0-2 termini nuovi.',
              'Mantieni tono plausibile e da cultura nascente.',
            ].join('\n'),
          ],
        ])

        const chain = prompt.pipe(model).pipe(parser)
        const raw = await chain.invoke({})
        const normalized = this.normalizeDialogue(raw, context)
        this.cache.set(cacheKey, normalized)
        return normalized
      } catch {
        const fallback = this.fallbackDialogue(context)
        this.cache.set(cacheKey, fallback)
        return fallback
      }
    })

    this.inFlight.set(cacheKey, task)
    try {
      const value = await task
      return value
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  async generateChronicle(faction: Faction, recentLogs: string[]): Promise<string> {
    const compactLogs = recentLogs.slice(-20).join(' || ')
    const cacheKey = `chronicle:${faction.id}:${compactLogs}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached as string
    }

    const existing = this.inFlight.get(cacheKey)
    if (existing) {
      return existing as Promise<string>
    }

    const task = this.runThrottled(async () => {
      try {
        const model = await this.getModel()
        const parser = new StringOutputParser()
        const prompt = ChatPromptTemplate.fromMessages([
          [
            'system',
            [
              'Scrivi una cronaca breve (max 90 parole) in italiano.',
              'Tono: rapporto storico di civiltà emergente.',
              'Niente fantasy e niente introduzioni inutili.',
            ].join('\n'),
          ],
          [
            'human',
            [
              `fazione: ${this.factionNameLabel(faction)}`,
              `religione: ${this.factionReligionLabel(faction)}`,
              `leggi: ${faction.laws.join(', ')}`,
              `eventi recenti: ${compactLogs || 'nessun evento rilevante'}`,
            ].join('\n'),
          ],
        ])

        const chain = prompt.pipe(model).pipe(parser)
        const raw = await chain.invoke({})
        const text = raw.trim().replace(/\s+/g, ' ')
        const out = text.slice(0, 420)
        this.cache.set(cacheKey, out)
        return out
      } catch {
        const fallback = this.fallbackChronicle(faction, recentLogs)
        this.cache.set(cacheKey, fallback)
        return fallback
      }
    })

    this.inFlight.set(cacheKey, task)
    try {
      const value = await task
      return value
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  async translateUtterance(context: TranslationContext): Promise<UtteranceTranslation> {
    const lexiconSignature = Object.entries(context.communication.lexicon)
      .map(([k, v]) => `${k}:${v}`)
      .join('|')
    const cacheKey = `translate:${context.communication.grammarLevel}:${lexiconSignature}:${context.utteranceTokens.join('-')}:${context.contextSummary}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached as UtteranceTranslation
    }

    const existing = this.inFlight.get(cacheKey)
    if (existing) {
      return existing as Promise<UtteranceTranslation>
    }

    const task = this.runThrottled(async () => {
      try {
        const model = await this.getModel()
        const parser = new StringOutputParser()
        const prompt = ChatPromptTemplate.fromMessages([
          [
            'system',
            [
              'Sei un traduttore di linguaggio tribale artificiale.',
              'Rispondi SOLO JSON valido senza testo extra.',
              'Lingua output: italiano.',
              'Schema:',
              '{"gloss_it":"string","tone":"string","new_terms":["string"]}',
            ].join('\n'),
          ],
          [
            'human',
            [
              `grammar_level: ${context.communication.grammarLevel}`,
              `lexicon: ${JSON.stringify(context.communication.lexicon)}`,
              `utterance_tokens: ${context.utteranceTokens.join(' ')}`,
              `contesto: ${context.contextSummary}`,
              'Interpreta in modo plausibile da civilta nascente.',
              'Massimo 2 nuovi termini.',
            ].join('\n'),
          ],
        ])

        const chain = prompt.pipe(model).pipe(parser)
        const raw = await chain.invoke({})
        const normalized = this.normalizeTranslation(raw, context)
        this.cache.set(cacheKey, normalized)
        return normalized
      } catch {
        const fallback = this.fallbackTranslation(context)
        this.cache.set(cacheKey, fallback)
        return fallback
      }
    })

    this.inFlight.set(cacheKey, task)
    try {
      const value = await task
      return value
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  async generateAgentBio(context: AgentBioContext): Promise<string> {
    const cacheKey = `agent-bio:${context.agentName}:${context.factionName}:${context.role}:${context.goal}:${context.vitals ?? ''}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached as string
    }

    const existing = this.inFlight.get(cacheKey)
    if (existing) {
      return existing as Promise<string>
    }

    const task = this.runThrottled(async () => {
      try {
        const model = await this.getModel()
        const parser = new StringOutputParser()
        const prompt = ChatPromptTemplate.fromMessages([
          [
            'system',
            [
              'Scrivi una bio breve in italiano (max 80 parole).',
              'Stile: scheda tecnico-sociale per simulatore.',
              'Non usare fantasy.',
            ].join('\n'),
          ],
          [
            'human',
            [
              `agente: ${context.agentName}`,
              `fazione: ${context.factionName}`,
              `ruolo: ${context.role}`,
              `energia: ${context.energy.toFixed(1)}`,
              `idratazione: ${context.hydration.toFixed(1)}`,
              `eta: ${context.age.toFixed(1)}`,
              `goal corrente: ${context.goal}`,
              `inventario: ${context.inventorySummary}`,
              context.vitals ? `condizioni vitali: ${context.vitals}` : '',
            ].join('\n'),
          ],
        ])
        const chain = prompt.pipe(model).pipe(parser)
        const raw = await chain.invoke({})
        const text = raw.trim().replace(/\s+/g, ' ').slice(0, 420)
        this.cache.set(cacheKey, text)
        return text
      } catch {
        const fallback = this.fallbackAgentBio(context)
        this.cache.set(cacheKey, fallback)
        return fallback
      }
    })

    this.inFlight.set(cacheKey, task)
    try {
      const value = await task
      return value
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  async generateThoughtGloss(context: ThoughtGlossContext): Promise<string> {
    const cacheKey = `thought-gloss:${context.agentName}:${context.factionName}:${context.goal}:${context.lastAction}:${context.reasons.join(',')}:${context.sensorySummary}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached as string
    }

    const existing = this.inFlight.get(cacheKey)
    if (existing) {
      return existing as Promise<string>
    }

    const task = this.runThrottled(async () => {
      try {
        const model = await this.getModel()
        const parser = new StringOutputParser()
        const prompt = ChatPromptTemplate.fromMessages([
          [
            'system',
            [
              'Genera una frase breve (max 24 parole), in italiano, come gloss mentale di un agente in simulazione.',
              'Stile tecnico-narrativo, niente fantasy.',
            ].join('\\n'),
          ],
          [
            'human',
            [
              `agente: ${context.agentName}`,
              `fazione: ${context.factionName}`,
              `goal: ${context.goal}`,
              `azione: ${context.lastAction}`,
              `ragioni: ${context.reasons.join(', ')}`,
              `sensori: ${context.sensorySummary}`,
            ].join('\\n'),
          ],
        ])
        const chain = prompt.pipe(model).pipe(parser)
        const raw = await chain.invoke({})
        const text = raw.trim().replace(/\\s+/g, ' ').slice(0, 220)
        this.cache.set(cacheKey, text)
        return text
      } catch {
        const fallback = this.fallbackThoughtGloss(context)
        this.cache.set(cacheKey, fallback)
        return fallback
      }
    })

    this.inFlight.set(cacheKey, task)
    try {
      const value = await task
      return value
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  async translateWritingNote(context: WritingNoteTranslationContext): Promise<string> {
    const cacheKey = `note-translate:${context.factionName}:${context.literacyLevel}:${context.tokenContent}:${context.symbolSet.join('|')}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached as string
    }

    const existing = this.inFlight.get(cacheKey)
    if (existing) {
      return existing as Promise<string>
    }

    const task = this.runThrottled(async () => {
      try {
        const model = await this.getModel()
        const parser = new StringOutputParser()
        const prompt = ChatPromptTemplate.fromMessages([
          [
            'system',
            [
              'Traduci un testo tokenizzato di una scrittura proto-civile in italiano semplice.',
              'Rispondi con una sola frase breve, senza prefazioni.',
            ].join('\\n'),
          ],
          [
            'human',
            [
              `fazione: ${context.factionName}`,
              `livello scrittura: ${context.literacyLevel}`,
              `simboli noti: ${context.symbolSet.join(', ')}`,
              `token: ${context.tokenContent}`,
            ].join('\\n'),
          ],
        ])
        const chain = prompt.pipe(model).pipe(parser)
        const raw = await chain.invoke({})
        const text = raw.trim().replace(/\\s+/g, ' ').slice(0, 280)
        this.cache.set(cacheKey, text)
        return text
      } catch {
        const fallback = this.fallbackWritingNoteTranslation(context)
        this.cache.set(cacheKey, fallback)
        return fallback
      }
    })

    this.inFlight.set(cacheKey, task)
    try {
      const value = await task
      return value
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  private async getModel(): Promise<any> {
    if (this.modelPromise) {
      return this.modelPromise
    }

    this.modelPromise = initChatModel(this.modelConfig.model, {
      modelProvider: this.modelConfig.provider,
      baseUrl: this.modelConfig.baseUrl,
      apiKey: this.modelConfig.apiKey,
      temperature: this.modelConfig.temperature,
      maxTokens: this.modelConfig.maxTokens,
    })

    return this.modelPromise
  }

  private runThrottled<T>(task: () => Promise<T>): Promise<T> {
    const wrapped = this.queue.then(async () => {
      const now = Date.now()
      const wait = this.nextAllowedAt - now
      if (wait > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, wait)
        })
      }
      this.nextAllowedAt = Date.now() + this.minIntervalMs
      return task()
    })

    this.queue = wrapped.then(() => undefined).catch(() => undefined)
    return wrapped
  }

  private normalizeIdentity(raw: string, faction: Faction): FactionNarrative {
    const json = this.extractJson(raw)
    const parsed = JSON.parse(json) as Partial<FactionNarrative>

    const laws = Array.isArray(parsed.coreLaws)
      ? parsed.coreLaws.map((x) => String(x)).slice(0, 4)
      : faction.laws

    return {
      name: String(parsed.name ?? this.factionNameLabel(faction)),
      motto: String(parsed.motto ?? `Onore e raccolto per ${this.factionNameLabel(faction)}`),
      religion: String(parsed.religion ?? this.factionReligionLabel(faction)),
      coreLaws: laws.length > 0 ? laws : faction.laws,
    }
  }

  private normalizeDialogue(raw: string, context: DialogueContext): DialoguePayload {
    const json = this.extractJson(raw)
    const parsed = JSON.parse(json) as Partial<DialoguePayload>

    const topicRaw = String(parsed.topic ?? 'discovery')
    const topic = (
      ['discovery', 'trade', 'war', 'religion', 'law', 'fear', 'hope'].includes(topicRaw)
        ? topicRaw
        : 'discovery'
    ) as DialoguePayload['topic']

    const lines = Array.isArray(parsed.lines)
      ? parsed.lines
          .slice(0, 2)
          .map((line, idx) => {
            const asRecord = line as Record<string, unknown>
            return {
              speaker: String(asRecord.speaker ?? (idx === 0 ? context.speakerAName : context.speakerBName)),
              text: String(asRecord.text ?? 'Osserviamo e impariamo.'),
            }
          })
      : [
          { speaker: context.speakerAName, text: 'Abbiamo trovato nuove tracce nel territorio.' },
          { speaker: context.speakerBName, text: 'Registriamo tutto prima del tramonto.' },
        ]

    const newTerms = Array.isArray(parsed.new_terms)
      ? parsed.new_terms.map((term) => String(term)).slice(0, 2)
      : []

    const beliefRaw = (parsed.belief_update ?? {}) as Record<string, unknown>
    const beliefUpdate = {
      spirituality_delta: clamp(Number(beliefRaw.spirituality_delta ?? 0), -0.08, 0.08),
      taboo_hazard: Boolean(beliefRaw.taboo_hazard ?? false),
    }

    return {
      topic,
      lines,
      new_terms: newTerms,
      belief_update: beliefUpdate,
    }
  }

  private normalizeTranslation(raw: string, context: TranslationContext): UtteranceTranslation {
    const json = this.extractJson(raw)
    const parsed = JSON.parse(json) as Partial<UtteranceTranslation>
    const gloss = String(parsed.gloss_it ?? '').trim()
    const tone = String(parsed.tone ?? '').trim()
    const terms = Array.isArray(parsed.new_terms)
      ? parsed.new_terms.map((x) => String(x)).slice(0, 2)
      : []

    return {
      gloss_it: gloss || this.fallbackTranslation(context).gloss_it,
      tone: tone || 'cauto',
      new_terms: terms,
    }
  }

  private fallbackIdentity(faction: Faction): FactionNarrative {
    const tag = this.hashNumber(`${faction.id}:${faction.cultureParams.spirituality.toFixed(2)}`)
    const suffixes = ['della Valle', 'del Fuoco', 'della Pietra', 'dei Sentieri']
    const suffix = suffixes[tag % suffixes.length] ?? 'delle Colline'

    return {
      name: `${this.factionNameLabel(faction)} ${suffix}`,
      motto: 'Custodire, coltivare, ricordare.',
      religion: faction.cultureParams.spirituality > 0.55 ? 'culto dei segni del cielo' : 'etica del raccolto',
      coreLaws: ['Condividere il cibo', 'Evitare le terre pericolose', 'Difendere i deboli'],
    }
  }

  private fallbackDialogue(context: DialogueContext): DialoguePayload {
    const h = this.hashNumber(`${context.factionName}:${context.contextSummary}`)
    const topics: DialoguePayload['topic'][] = ['discovery', 'trade', 'fear', 'hope', 'religion']
    const topic = topics[h % topics.length] ?? 'discovery'

    return {
      topic,
      lines: [
        {
          speaker: context.speakerAName,
          text: 'Le nostre tracce crescono, ma il mondo resta incerto.',
        },
        {
          speaker: context.speakerBName,
          text: 'Condividiamo la mappa e restiamo uniti.',
        },
      ],
      new_terms: ['karum', 'seldra'].slice(0, (h % 2) + 1),
      belief_update: {
        spirituality_delta: 0,
        taboo_hazard: true,
      },
    }
  }

  private fallbackChronicle(faction: Faction, recentLogs: string[]): string {
    const summary = recentLogs.slice(-3).join(' | ')
    return `${this.factionNameLabel(faction)}: la comunità consolida scorte, amplia insediamenti e tramanda regole comuni. Eventi chiave: ${summary || 'nessuno'}.`
  }

  private fallbackTranslation(context: TranslationContext): UtteranceTranslation {
    const tokenPreview = context.utteranceTokens.slice(0, 6).join(' ')
    const dangerToken = context.communication.lexicon.DANGER
    const containsDanger = context.utteranceTokens.includes(dangerToken)

    return {
      gloss_it: containsDanger
        ? `Avviso collettivo: pericolo vicino. Segnale udito: ${tokenPreview}.`
        : `Messaggio tribale su risorse e cooperazione. Segnale udito: ${tokenPreview}.`,
      tone: containsDanger ? 'allarme' : 'cooperativo',
      new_terms: context.utteranceTokens.slice(0, 2),
    }
  }

  private fallbackAgentBio(context: AgentBioContext): string {
    const vitals = context.vitals ? ` Stato vitale: ${context.vitals}.` : ''
    return `${context.agentName} (${context.role}) appartiene a ${context.factionName}. Mantiene energia ${context.energy.toFixed(1)}, idratazione ${context.hydration.toFixed(1)}, eta ${context.age.toFixed(1)} e opera con obiettivo '${context.goal}'. Dotazione attuale: ${context.inventorySummary}.${vitals} Profilo descrittivo generato in fallback deterministico.`
  }

  private fallbackThoughtGloss(context: ThoughtGlossContext): string {
    const firstReason = context.reasons[0] ?? 'ADAPT'
    return `${context.agentName}: ${context.lastAction} per ${context.goal} (${firstReason.toLowerCase()}).`
  }

  private fallbackWritingNoteTranslation(context: WritingNoteTranslationContext): string {
    const preview = context.tokenContent.split(' ').slice(0, 6).join(' ')
    return `${context.factionName} registra memoria collettiva: ${preview}.`
  }

  private extractJson(raw: string): string {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('JSON not found')
    }
    return raw.slice(start, end + 1)
  }

  private hashNumber(value: string): number {
    let h = 2166136261
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }

  private factionNameLabel(faction: Faction): string {
    const name = faction.name?.trim()
    if (name) {
      return name
    }
    return `Emerging Culture of ${faction.foundingSpeciesId}`
  }

  private factionReligionLabel(faction: Faction): string {
    return faction.religion?.trim() || 'nessuna religione codificata'
  }
}

export type { DialogueContext }
