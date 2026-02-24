import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { initChatModel } from 'langchain/chat_models/universal'

import { getAiModelConfig, type AiModelConfig } from './AiModelRegistry'
import type { Creature, Species } from '../creatures/types'

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

/**
 * Servizio LLM per descrizioni creature.
 *
 * Provider scelto: Ollama locale (CPU-friendly).
 * TODO locale: importare il modello quantizzato in Ollama e taggarlo, poi usare lo stesso nome in `model`.
 * Esempio:
 *   ollama create TheBloke/vicuna-7B-1.1-q4_0 -f Modelfile
 */
export class CreatureDescriptionService {
  private readonly cache = new Map<string, string>()
  private readonly inFlight = new Map<string, Promise<string>>()
  private modelPromise: Promise<any> | null = null
  private readonly modelConfig: AiModelConfig

  constructor(model?: string, baseUrl?: string) {
    this.modelConfig = getAiModelConfig('creatureDescription', {
      model,
      baseUrl,
    })
  }

  getCachedDescription(creatureId: string): string | undefined {
    return this.cache.get(creatureId)
  }

  setCachedDescription(creatureId: string, description: string): void {
    this.cache.set(creatureId, description)
  }

  async generateDescription(
    creature: Creature,
    species: Species,
    context: DescriptionContext = {},
  ): Promise<string> {
    const cacheKey = creature.id

    if (!context.forceRefresh) {
      const cached = this.cache.get(cacheKey) ?? creature.description
      if (cached) {
        return cached
      }
    }

    const existingTask = this.inFlight.get(cacheKey)
    if (existingTask) {
      return existingTask
    }

    const task = this.generateDescriptionInternal(creature, species, context)
    this.inFlight.set(cacheKey, task)

    try {
      const description = await task
      this.cache.set(cacheKey, description)
      return description
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  private async generateDescriptionInternal(
    creature: Creature,
    species: Species,
    context: DescriptionContext,
  ): Promise<string> {
    try {
      const llmDescription = await this.generateWithLangChain(creature, species, context)
      return llmDescription
    } catch {
      return this.generateDeterministicFallback(creature, species, context.biomeName)
    }
  }

  private async generateWithLangChain(
    creature: Creature,
    species: Species,
    context: DescriptionContext,
  ): Promise<string> {
    const model = await this.getModel()

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        [
          'Sei un assistente per un simulatore scientifico chiamato Biotica.',
          'Descrivi organismi artificiali in modo plausibile e tecnico.',
          'Lingua: italiano.',
          'Stile: chiaro, sobrio, non fantasy.',
          'Rispondi SOLO con JSON valido, senza testo extra.',
          'Schema richiesto:',
          '{"title":"string","short":"string","long":"string","behaviors":["string"],"diet":"string","risks":["string"]}',
        ].join('\n'),
      ],
      [
        'human',
        [
          'DATI CREATURE:',
          'id: {id}',
          'speciesId: {speciesId}',
          'nome: {name}',
          'energia: {energy}',
          'idratazione: {hydration}',
          'fabbisognoAcqua(0..1): {waterNeed}',
          'eta: {age}',
          'generazione: {generation}',
          'stressTermico: {tempStress}',
          'stressUmidita: {humidityStress}',
          'posizioneTile: ({x}, {y})',
          'genoma: {genomeJson}',
          '',
          'DATI SPECIE:',
          'nomeComune: {commonName}',
          'biomiConsentiti: {allowedBiomes}',
          'tratti: {traits}',
          'stilePrompt: {promptStyle}',
          '',
          'CONTESTO AMBIENTE:',
          'bioma/tile: {biomeName}',
          '',
          'Vincoli:',
          '- solo JSON valido',
          '- massimo 2-4 comportamenti',
          '- rischi realistici e misurabili',
          '- tono da report di simulazione sperimentale',
        ].join('\n'),
      ],
    ])

    const parser = new StringOutputParser()
    const chain = prompt.pipe(model).pipe(parser)

    const raw = await chain.invoke({
      id: creature.id,
      speciesId: creature.speciesId,
      name: creature.name,
      energy: String(creature.energy),
      hydration: String(creature.hydration.toFixed(2)),
      waterNeed: String(creature.waterNeed.toFixed(3)),
      age: String(creature.age),
      generation: String(creature.generation),
      tempStress: String(creature.tempStress.toFixed(3)),
      humidityStress: String(creature.humidityStress.toFixed(3)),
      x: String(creature.x),
      y: String(creature.y),
      genomeJson: JSON.stringify(creature.genome),
      commonName: species.commonName,
      allowedBiomes: species.allowedBiomes.join(', '),
      traits: species.traits.join(', '),
      promptStyle: species.promptStyle,
      biomeName: context.biomeName ?? 'non disponibile',
    })

    const normalized = this.normalizeJsonResponse(raw)
    return JSON.stringify(normalized, null, 2)
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
    const h = this.hashString(token)

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

    const pick = (items: string[], offset: number): string => {
      const index = (h + offset) % items.length
      return items[index] ?? items[0] ?? 'dato non disponibile'
    }

    const payload: DescriptionPayload = {
      title: `${species.commonName} ${creature.id}`,
      short: `Organismo artificiale osservato in bioma ${biomeName ?? 'non classificato'}.`,
      long: [
        `Il soggetto ${creature.name} mostra un profilo energetico di ${creature.energy.toFixed(1)}, idratazione ${creature.hydration.toFixed(1)} e un'eta stimata di ${creature.age} cicli.`,
        `Il comportamento e coerente con i tratti di specie (${species.traits.join(', ')}).`,
        `Bisogni correnti: acqua=${creature.waterNeed.toFixed(2)} stressTermico=${creature.tempStress.toFixed(2)} stressUmidita=${creature.humidityStress.toFixed(2)}.`,
        'Descrizione prodotta in fallback deterministico per assenza del modello locale.',
      ].join(' '),
      behaviors: [pick(behaviorOptions, 1), pick(behaviorOptions, 2), pick(behaviorOptions, 3)],
      diet: pick(dietOptions, 5),
      risks: [pick(riskOptions, 7), pick(riskOptions, 9)],
    }

    return JSON.stringify(payload, null, 2)
  }

  private hashString(input: string): number {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
  }
}
