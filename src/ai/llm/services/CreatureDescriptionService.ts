import { AiCache } from '../../core/AiCache'
import { readAiCoreConfig } from '../../core/AiConfig'
import { resolveLlmModel } from '../../core/AiModelResolver'
import { AiRateLimiter } from '../../core/AiRateLimiter'
import { LlmClient, type LlmMessage } from '../LlmClient'
import type { Creature, Species } from '../../../creatures/types'

type DescriptionContext = {
  biomeName?: string
  forceRefresh?: boolean
}

type DescriptionPayload = {
  title: string
  short: string
  long: string
  behaviors: string[]
  diet: string
  risks: string[]
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pickByHash(items: readonly string[], hash: number, offset: number): string {
  const index = (hash + offset) % items.length
  return items[index] ?? items[0] ?? 'dato non disponibile'
}

/**
 * Servizio LLM read-only per descrizioni on-demand.
 * Nessun utilizzo nel tick loop.
 */
export class CreatureDescriptionService {
  private readonly model: string
  private readonly temperature: number
  private readonly maxTokens: number
  private readonly client: LlmClient
  private readonly rateLimiter: AiRateLimiter
  private readonly cache: AiCache<string>
  private readonly inFlight = new Map<string, Promise<string>>()

  constructor(options: {
    model?: string
    temperature?: number
    maxTokens?: number
    minIntervalMs?: number
    cacheTtlMs?: number
    cacheMaxEntries?: number
    client?: LlmClient
    rateLimiter?: AiRateLimiter
    cache?: AiCache<string>
  } = {}) {
    const coreConfig = readAiCoreConfig()
    this.model = options.model ?? resolveLlmModel('CREATURE_DESCRIPTION')
    this.temperature = clamp(options.temperature ?? 0.2, 0, 2)
    this.maxTokens = Math.max(128, Math.floor(options.maxTokens ?? 600))

    this.client = options.client ?? new LlmClient({
      provider: coreConfig.llm.provider,
      baseUrl: coreConfig.llm.baseUrl,
      timeoutMs: coreConfig.llm.timeoutMs,
    })

    this.rateLimiter = options.rateLimiter ?? new AiRateLimiter({
      minIntervalMs: options.minIntervalMs ?? Math.max(120, coreConfig.llm.minIntervalMs),
    })

    this.cache = options.cache ?? new AiCache<string>({
      maxEntries: options.cacheMaxEntries ?? coreConfig.llm.cacheMaxEntries,
      ttlMs: options.cacheTtlMs ?? coreConfig.llm.cacheTtlMs,
    })
  }

  getCachedDescription(entityId: string): string | undefined {
    return this.cache.get(entityId) ?? undefined
  }

  setCachedDescription(entityId: string, description: string): void {
    this.cache.set(entityId, description)
  }

  async generateDescription(
    creature: Creature,
    species: Species,
    context: DescriptionContext = {},
  ): Promise<string> {
    const cacheKey = `creature:${creature.id}`

    if (!context.forceRefresh) {
      const cached = this.cache.get(cacheKey) ?? creature.description
      if (cached) {
        return cached
      }
    }

    const pending = this.inFlight.get(cacheKey)
    if (pending) {
      return pending
    }

    const task = this.rateLimiter.run(() =>
      this.generateDescriptionInternal(creature, species, context, cacheKey),
    )
    this.inFlight.set(cacheKey, task)

    task.finally(() => {
      this.inFlight.delete(cacheKey)
    })

    return task
  }

  async generateSpeciesDescription(input: {
    species: Species
    population: number
    intelligence: number
    vitality: number
    forceRefresh?: boolean
  }): Promise<string> {
    const cacheKey = `species:${input.species.id}`
    if (!input.forceRefresh) {
      const cached = this.cache.get(cacheKey)
      if (cached) return cached
    }

    const pending = this.inFlight.get(cacheKey)
    if (pending) return pending

    const task = this.rateLimiter.run(async () => {
      const messages: LlmMessage[] = [
        {
          role: 'system',
          content:
            'Sei un biologo computazionale di Biotica. Rispondi in italiano tecnico con JSON valido e nessun testo extra.',
        },
        {
          role: 'user',
          content: [
            'Genera descrizione specie in JSON:',
            '{"title":"string","short":"string","long":"string","behaviors":["string"],"diet":"string","risks":["string"]}',
            `speciesId: ${input.species.id}`,
            `commonName: ${input.species.commonName}`,
            `traits: ${input.species.traits.join(', ') || '-'}`,
            `allowedBiomes: ${input.species.allowedBiomes.join(',')}`,
            `population: ${input.population}`,
            `intelligence: ${input.intelligence.toFixed(3)}`,
            `vitality: ${input.vitality.toFixed(3)}`,
          ].join('\n'),
        },
      ]

      try {
        const raw = await this.client.complete({
          model: this.model,
          messages,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          jsonMode: true,
        })
        const normalized = this.normalizeJsonResponse(raw)
        const text = JSON.stringify(normalized, null, 2)
        this.cache.set(cacheKey, text)
        return text
      } catch {
        const fallback = this.generateDeterministicSpeciesFallback(input.species, input.population)
        this.cache.set(cacheKey, fallback)
        return fallback
      }
    })

    this.inFlight.set(cacheKey, task)
    task.finally(() => {
      this.inFlight.delete(cacheKey)
    })
    return task
  }

  async generateCivilizationDescription(input: {
    civilizationId: string
    name: string
    population: number
    techLevel: number
    literacyLevel: number
    strategy: string
    forceRefresh?: boolean
  }): Promise<string> {
    const cacheKey = `civ:${input.civilizationId}`
    if (!input.forceRefresh) {
      const cached = this.cache.get(cacheKey)
      if (cached) return cached
    }

    const pending = this.inFlight.get(cacheKey)
    if (pending) return pending

    const task = this.rateLimiter.run(async () => {
      const messages: LlmMessage[] = [
        {
          role: 'system',
          content:
            'Sei un analista socio-ecologico di Biotica. Rispondi in italiano tecnico con JSON valido e nessun testo extra.',
        },
        {
          role: 'user',
          content: [
            'Genera descrizione civilta in JSON:',
            '{"title":"string","short":"string","long":"string","behaviors":["string"],"diet":"string","risks":["string"]}',
            `id: ${input.civilizationId}`,
            `name: ${input.name}`,
            `population: ${input.population}`,
            `techLevel: ${input.techLevel.toFixed(2)}`,
            `literacyLevel: ${input.literacyLevel.toFixed(2)}`,
            `strategy: ${input.strategy}`,
          ].join('\n'),
        },
      ]

      try {
        const raw = await this.client.complete({
          model: this.model,
          messages,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          jsonMode: true,
        })
        const normalized = this.normalizeJsonResponse(raw)
        const text = JSON.stringify(normalized, null, 2)
        this.cache.set(cacheKey, text)
        return text
      } catch {
        const fallback = this.generateDeterministicCivFallback(input)
        this.cache.set(cacheKey, fallback)
        return fallback
      }
    })

    this.inFlight.set(cacheKey, task)
    task.finally(() => {
      this.inFlight.delete(cacheKey)
    })
    return task
  }

  private async generateDescriptionInternal(
    creature: Creature,
    species: Species,
    context: DescriptionContext,
    cacheKey: string,
  ): Promise<string> {
    try {
      const llmDescription = await this.generateWithLlm(creature, species, context)
      this.cache.set(cacheKey, llmDescription)
      return llmDescription
    } catch {
      const fallback = this.generateDeterministicFallback(creature, species, context.biomeName)
      this.cache.set(cacheKey, fallback)
      return fallback
    }
  }

  private async generateWithLlm(
    creature: Creature,
    species: Species,
    context: DescriptionContext,
  ): Promise<string> {
    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: [
          'Sei un assistente per un simulatore scientifico chiamato Biotica.',
          'Descrivi organismi artificiali in modo plausibile e tecnico.',
          'Lingua: italiano.',
          'Stile: chiaro, sobrio, non fantasy.',
          'Rispondi SOLO con JSON valido, senza testo extra.',
          'Schema richiesto:',
          '{"title":"string","short":"string","long":"string","behaviors":["string"],"diet":"string","risks":["string"]}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          'DATI CREATURE:',
          `id: ${creature.id}`,
          `speciesId: ${creature.speciesId}`,
          `nome: ${creature.name}`,
          `energia: ${creature.energy.toFixed(2)}`,
          `idratazione: ${creature.hydration.toFixed(2)}`,
          `fabbisognoAcqua(0..1): ${creature.waterNeed.toFixed(3)}`,
          `eta: ${creature.age}`,
          `generazione: ${creature.generation}`,
          `stressTermico: ${creature.tempStress.toFixed(3)}`,
          `stressUmidita: ${creature.humidityStress.toFixed(3)}`,
          `posizioneTile: (${creature.x}, ${creature.y})`,
          `genoma: ${JSON.stringify(creature.genome)}`,
          '',
          'DATI SPECIE:',
          `nomeComune: ${species.commonName}`,
          `biomiConsentiti: ${species.allowedBiomes.join(', ')}`,
          `tratti: ${species.traits.join(', ')}`,
          `stilePrompt: ${species.promptStyle}`,
          '',
          'CONTESTO AMBIENTE:',
          `bioma/tile: ${context.biomeName ?? 'non disponibile'}`,
          '',
          'Vincoli:',
          '- solo JSON valido',
          '- massimo 2-4 comportamenti',
          '- rischi realistici e misurabili',
          '- tono da report di simulazione sperimentale',
        ].join('\n'),
      },
    ]

    const raw = await this.client.complete({
      model: this.model,
      messages,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      jsonMode: true,
    })

    const normalized = this.normalizeJsonResponse(raw)
    return JSON.stringify(normalized, null, 2)
  }

  private normalizeJsonResponse(raw: string): DescriptionPayload {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Invalid LLM JSON shape')
    }

    const jsonSlice = raw.slice(start, end + 1)
    const parsed = JSON.parse(jsonSlice) as Partial<DescriptionPayload>

    return {
      title: String(parsed.title ?? 'Profilo organismo'),
      short: String(parsed.short ?? 'Descrizione non disponibile'),
      long: String(parsed.long ?? 'Nessun approfondimento generato'),
      behaviors: Array.isArray(parsed.behaviors)
        ? parsed.behaviors.map((item) => String(item)).slice(0, 4)
        : ['Comportamento non classificato'],
      diet: String(parsed.diet ?? 'Dieta non classificata'),
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.map((item) => String(item)).slice(0, 4)
        : ['Rischi non classificati'],
    }
  }

  private generateDeterministicFallback(
    creature: Creature,
    species: Species,
    biomeName?: string,
  ): string {
    const token = `${creature.id}:${species.id}:${creature.energy}:${creature.age}:${creature.x}:${creature.y}`
    const h = hashString(token)

    const behaviorOptions = [
      'micro-spostamenti su gradiente energetico',
      'periodi di quiescenza adattiva',
      'oscillazione tra esplorazione e conservazione',
      'aggregazione locale con conspecifici',
      'evitamento di aree a stress ambientale',
    ]

    const dietOptions = [
      'assorbimento di nutrienti minerali dispersi',
      'consumo opportunistico di biomassa artificiale',
      'metabolismo misto foto-eterotrofo',
      'ciclo metabolico a bassa intensita energetica',
    ]

    const riskOptions = [
      'collasso energetico in scarsita prolungata',
      'riduzione fertilita sotto stress termico',
      'instabilita comportamentale in alta densita',
      'sensibilita a variazioni rapide di umidita',
    ]

    const payload: DescriptionPayload = {
      title: `${species.commonName} ${creature.id}`,
      short: `Organismo artificiale osservato in bioma ${biomeName ?? 'non classificato'}.`,
      long: [
        `Il soggetto ${creature.name} mostra un profilo energetico di ${creature.energy.toFixed(1)}, idratazione ${creature.hydration.toFixed(1)} e un'eta stimata di ${creature.age} cicli.`,
        `Il comportamento e coerente con i tratti di specie (${species.traits.join(', ')}).`,
        `Bisogni correnti: acqua=${creature.waterNeed.toFixed(2)} stressTermico=${creature.tempStress.toFixed(2)} stressUmidita=${creature.humidityStress.toFixed(2)}.`,
        'Descrizione prodotta in fallback deterministico per assenza del modello locale.',
      ].join(' '),
      behaviors: [
        pickByHash(behaviorOptions, h, 1),
        pickByHash(behaviorOptions, h, 2),
        pickByHash(behaviorOptions, h, 3),
      ],
      diet: pickByHash(dietOptions, h, 5),
      risks: [pickByHash(riskOptions, h, 7), pickByHash(riskOptions, h, 9)],
    }

    return JSON.stringify(payload, null, 2)
  }

  private generateDeterministicSpeciesFallback(species: Species, population: number): string {
    const h = hashString(`${species.id}:${population}`)
    const payload: DescriptionPayload = {
      title: `${species.commonName} [${species.id}]`,
      short: 'Profilo specie sintetizzato in modalità deterministica locale.',
      long: `Specie con popolazione ${population}, adattata ai biomi ${species.allowedBiomes.join(', ')}. Tratti osservati: ${species.traits.join(', ') || 'non classificati'}.`,
      behaviors: [
        pickByHash(['dispersione locale', 'gregarismo moderato', 'foraggiamento opportunistico'], h, 1),
        pickByHash(['riproduzione prudente', 'espansione rapida', 'stasi adattiva'], h, 2),
      ],
      diet: pickByHash(['onnivora adattiva', 'fitotrofia prevalente', 'mix opportunistico'], h, 3),
      risks: [
        pickByHash(['bassa resilienza a shock climatici', 'stress da competizione intra-specifica'], h, 4),
      ],
    }
    return JSON.stringify(payload, null, 2)
  }

  private generateDeterministicCivFallback(input: {
    civilizationId: string
    name: string
    population: number
    techLevel: number
    literacyLevel: number
    strategy: string
  }): string {
    const h = hashString(`${input.civilizationId}:${input.population}:${input.strategy}`)
    const payload: DescriptionPayload = {
      title: `${input.name} [${input.civilizationId}]`,
      short: 'Profilo civilta sintetizzato in modalità deterministica locale.',
      long: `Civilta con popolazione ${input.population}, livello tecnologico ${input.techLevel.toFixed(2)} e alfabetizzazione ${input.literacyLevel.toFixed(2)}. Strategia prevalente: ${input.strategy}.`,
      behaviors: [
        pickByHash(['espansione territoriale controllata', 'consolidamento infrastrutturale'], h, 1),
        pickByHash(['ottimizzazione risorse', 'diplomazia selettiva', 'difesa dei confini'], h, 2),
      ],
      diet: pickByHash(['economia mista produzione/scambio', 'economia di sussistenza locale'], h, 3),
      risks: [
        pickByHash(['fragilita logistica in stress ambientale', 'tensioni socio-politiche interne'], h, 4),
      ],
    }
    return JSON.stringify(payload, null, 2)
  }
}
