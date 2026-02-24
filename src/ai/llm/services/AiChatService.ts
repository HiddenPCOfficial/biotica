import { AiCache } from '../../core/AiCache'
import { readAiCoreConfig } from '../../core/AiConfig'
import { resolveLlmModel } from '../../core/AiModelResolver'
import { AiRateLimiter } from '../../core/AiRateLimiter'
import { LlmClient, type LlmMessage } from '../LlmClient'
import type { ToolCallResult } from '../tools/ToolRouter'
import type { ToolRouter } from '../tools/ToolRouter'
import type { AiToolName } from '../tools/tools'
import { AI_TOOL_DEFINITIONS } from '../tools/tools'

type ChatRole = 'system' | 'user' | 'assistant'

type ChatMessage = {
  role: ChatRole
  content: string
}

const ALLOWED_REFERENCE_TYPES = new Set([
  'species',
  'creature',
  'civilization',
  'event',
  'era',
  'note',
  'ethnicity',
  'religion',
])

function hashText(value: string): string {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function toLowerSafe(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function extractJson(raw: string): string {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON object not found in LLM output')
  }
  return raw.slice(start, end + 1)
}

function normalizeToolName(value: unknown): AiToolName | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  for (let i = 0; i < AI_TOOL_DEFINITIONS.length; i++) {
    const def = AI_TOOL_DEFINITIONS[i]
    if (!def) continue
    if (def.name === raw) {
      return def.name
    }
  }
  return null
}

function compactJson(value: unknown, maxLen = 2200): string {
  const text = JSON.stringify(value)
  if (!text) return '{}'
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}...`
}

function formatToolsForPrompt(): string {
  return AI_TOOL_DEFINITIONS.map((def) => {
    return `- ${def.name}: ${def.description}; input=${JSON.stringify(def.inputSchema)}`
  }).join('\n')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function cloneResult(value: AiChatResult): AiChatResult {
  return {
    ...value,
    references: value.references.map((ref) => ({ ...ref })),
    suggested_questions: [...value.suggested_questions],
    toolCalls: value.toolCalls.map((call) => ({
      ...call,
      input: { ...call.input },
    })),
  }
}

export type AiChatReference = {
  type: string
  id: string
  label: string
}

export type AiChatResult = {
  answer: string
  references: AiChatReference[]
  suggested_questions: string[]
  toolCalls: Array<{
    tool: AiToolName
    input: Record<string, unknown>
    ok: boolean
  }>
  cacheKey: string
}

export type AiChatHistoryMessage = {
  role: 'user' | 'assistant'
  text: string
}

export type AiChatSelectionContext = {
  type: 'species' | 'creature' | 'civilization' | 'event' | 'era' | 'note' | 'ethnicity' | 'religion'
  id: string
  label: string
}

export type AiChatRequest = {
  question: string
  mode: 'default' | 'explain'
  history: readonly AiChatHistoryMessage[]
  worldPackText: string
  worldPackHash: string
  followSelection: boolean
  selection?: AiChatSelectionContext | null
  stream?: boolean
  onToken?: (token: string) => void
}

type StepOutput =
  | {
      kind: 'tool'
      tool: AiToolName
      input: Record<string, unknown>
      reason: string
    }
  | {
      kind: 'final'
      answer: string
      references: AiChatReference[]
      suggested_questions: string[]
    }

type ToolObservation = {
  tool: AiToolName
  input: Record<string, unknown>
  result: ToolCallResult
}

/**
 * Servizio Q&A LLM locale read-only:
 * - tool calling via ReAct JSON loop
 * - cache + throttling
 * - streaming opzionale sul passo finale
 */
export class AiChatService {
  private readonly model: string
  private readonly temperature: number
  private readonly maxTokens: number
  private readonly maxToolCalls: number
  private readonly maxSteps: number
  private readonly maxHistory: number
  private readonly enableStreaming: boolean

  private readonly client: LlmClient
  private readonly rateLimiter: AiRateLimiter
  private readonly cache: AiCache<AiChatResult>
  private readonly inFlight = new Map<string, Promise<AiChatResult>>()

  constructor(
    private readonly toolRouter: ToolRouter,
    options: {
      model?: string
      temperature?: number
      maxTokens?: number
      minIntervalMs?: number
      maxToolCalls?: number
      maxSteps?: number
      maxHistory?: number
      cacheTtlMs?: number
      cacheMaxEntries?: number
      enableStreaming?: boolean
      client?: LlmClient
      rateLimiter?: AiRateLimiter
      cache?: AiCache<AiChatResult>
    } = {},
  ) {
    const coreConfig = readAiCoreConfig()
    this.model = options.model ?? resolveLlmModel('CHAT')
    this.temperature = Math.max(0, Math.min(2, options.temperature ?? 0.1))
    this.maxTokens = clampInt(options.maxTokens ?? 720, 128, 4096)
    this.maxToolCalls = clampInt(options.maxToolCalls ?? 3, 1, 6)
    this.maxSteps = clampInt(options.maxSteps ?? 4, 2, 10)
    this.maxHistory = clampInt(options.maxHistory ?? 12, 2, 30)
    this.enableStreaming = options.enableStreaming ?? coreConfig.llm.enableStreaming

    this.client = options.client ?? new LlmClient({
      provider: coreConfig.llm.provider,
      baseUrl: coreConfig.llm.baseUrl,
      timeoutMs: coreConfig.llm.timeoutMs,
    })

    this.rateLimiter = options.rateLimiter ?? new AiRateLimiter({
      minIntervalMs: options.minIntervalMs ?? coreConfig.llm.minIntervalMs,
    })

    this.cache = options.cache ?? new AiCache<AiChatResult>({
      maxEntries: options.cacheMaxEntries ?? coreConfig.llm.cacheMaxEntries,
      ttlMs: options.cacheTtlMs ?? coreConfig.llm.cacheTtlMs,
    })
  }

  getProvider(): 'ollama' | 'llamaCpp' {
    return this.client.getProvider()
  }

  async ask(request: AiChatRequest): Promise<AiChatResult> {
    const normalizedRequest = {
      question: request.question.trim(),
      mode: request.mode,
      history: request.history.slice(-this.maxHistory),
      worldPackHash: request.worldPackHash,
      followSelection: request.followSelection,
      selection: request.followSelection ? request.selection ?? null : null,
      stream: Boolean(request.stream && this.enableStreaming),
    }

    const requestKey = hashText(JSON.stringify(normalizedRequest))
    const cached = this.cache.get(requestKey)
    if (cached) {
      return cloneResult(cached)
    }

    const pending = this.inFlight.get(requestKey)
    if (pending) {
      return pending.then((value) => cloneResult(value))
    }

    const task = this.rateLimiter.run(() => this.executeRequest(request, requestKey))
    this.inFlight.set(requestKey, task)

    task.finally(() => {
      this.inFlight.delete(requestKey)
    })

    return task.then((value) => cloneResult(value))
  }

  private async executeRequest(request: AiChatRequest, requestKey: string): Promise<AiChatResult> {
    const observations: ToolObservation[] = []
    const toolCalls: AiChatResult['toolCalls'] = []
    let loopError: unknown = null

    if (request.followSelection && request.selection) {
      const initial = await this.buildSelectionObservation(request.selection)
      if (initial) {
        observations.push(initial)
        toolCalls.push({
          tool: initial.tool,
          input: { ...initial.input },
          ok: initial.result.ok,
        })
      }
    }

    try {
      for (let step = 0; step < this.maxSteps; step++) {
        const output = await this.generateStepOutput(request, observations, step)
        if (output.kind === 'final') {
          const finalResult: AiChatResult = {
            answer: output.answer,
            references: output.references,
            suggested_questions: output.suggested_questions,
            toolCalls,
            cacheKey: requestKey,
          }
          this.cache.set(requestKey, cloneResult(finalResult))
          return finalResult
        }

        if (toolCalls.length >= this.maxToolCalls) {
          observations.push({
            tool: output.tool,
            input: output.input,
            result: {
              ok: false,
              tool: output.tool,
              data: null,
              error: `tool budget exceeded (${this.maxToolCalls})`,
            },
          })
          continue
        }

        const toolResult = await this.toolRouter.callTool(output.tool, output.input)
        observations.push({
          tool: output.tool,
          input: output.input,
          result: toolResult,
        })
        toolCalls.push({
          tool: output.tool,
          input: { ...output.input },
          ok: toolResult.ok,
        })
      }
    } catch (error) {
      loopError = error
      observations.push({
        tool: 'getWorldSummary',
        input: {},
        result: {
          ok: false,
          tool: 'getWorldSummary',
          data: null,
          error: error instanceof Error ? error.message : 'ai_loop_failed',
        },
      })
    }

    const toolOnly = await this.buildToolOnlyFallback(request, toolCalls, loopError)
    if (toolOnly) {
      toolOnly.cacheKey = requestKey
      this.cache.set(requestKey, cloneResult(toolOnly))
      return toolOnly
    }

    const fallback = this.fallbackFinal(request, observations, toolCalls)
    fallback.cacheKey = requestKey
    this.cache.set(requestKey, cloneResult(fallback))
    return fallback
  }

  private async buildSelectionObservation(
    selection: AiChatSelectionContext,
  ): Promise<ToolObservation | null> {
    switch (selection.type) {
      case 'species': {
        return {
          tool: 'getSpecies',
          input: { speciesId: selection.id },
          result: await this.toolRouter.callTool('getSpecies', { speciesId: selection.id }),
        }
      }
      case 'creature': {
        return {
          tool: 'getCreature',
          input: { creatureId: selection.id },
          result: await this.toolRouter.callTool('getCreature', { creatureId: selection.id }),
        }
      }
      case 'civilization': {
        return {
          tool: 'getCiv',
          input: { civId: selection.id },
          result: await this.toolRouter.callTool('getCiv', { civId: selection.id }),
        }
      }
      case 'event': {
        return {
          tool: 'getEvent',
          input: { eventId: selection.id },
          result: await this.toolRouter.callTool('getEvent', { eventId: selection.id }),
        }
      }
      case 'era': {
        return {
          tool: 'getEra',
          input: { eraId: selection.id },
          result: await this.toolRouter.callTool('getEra', { eraId: selection.id }),
        }
      }
      default:
        return null
    }
  }

  private async generateStepOutput(
    request: AiChatRequest,
    observations: readonly ToolObservation[],
    step: number,
  ): Promise<StepOutput> {
    const historyTail = request.history.slice(-8)
    const historyText = historyTail
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.text}`)
      .join('\n')

    const selectionLine = request.followSelection && request.selection
      ? `Selection in focus: ${request.selection.type}[${request.selection.id}] ${request.selection.label}`
      : 'Selection in focus: none'

    const observationText = observations.length > 0
      ? observations
          .map((item, index) => {
            const status = item.result.ok ? 'ok' : `error=${item.result.error ?? 'unknown'}`
            const data = item.result.ok ? compactJson(item.result.data, 1800) : '{}'
            return `OBS#${index + 1} tool=${item.tool} input=${compactJson(item.input, 400)} status=${status} data=${data}`
          })
          .join('\n')
      : 'OBS: none'

    const outputSchema = [
      '{"kind":"tool","tool":"<toolName>","input":{...},"reason":"short"}',
      '{"kind":"final","answer":"string","references":[{"type":"species|creature|civilization|event|era|note|ethnicity|religion","id":"id","label":"label"}],"suggested_questions":["q1","q2"]}',
    ].join('\n')

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: [
          'You are Biotica simulator analyst. Use only provided context and tool observations.',
          'Never invent hidden data. If data is missing, request one tool call.',
          'At each step output only one JSON object following allowed schema.',
          'Do not include markdown fences. No extra text before/after JSON.',
          'When possible include IDs in references so UI can jump to entities.',
          'Use Italian language for answer.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Step ${step + 1}`,
          `Mode: ${request.mode}`,
          `Tool budget total: ${this.maxToolCalls}`,
          `Tools available:\n${formatToolsForPrompt()}`,
          `World pack:\n${request.worldPackText}`,
          selectionLine,
          historyText ? `History:\n${historyText}` : 'History: none',
          observationText,
          `User question: ${request.question}`,
          'If mode is explain, structure answer with explicit cause -> effect bullets.',
          `Output JSON schema (choose one):\n${outputSchema}`,
        ].join('\n\n'),
      },
    ]

    const isFinalStep = step >= this.maxSteps - 1
    const raw = await this.invokeChat(messages, true, isFinalStep && Boolean(request.stream), request.onToken)
    return this.parseStep(raw)
  }

  private parseStep(raw: string): StepOutput {
    try {
      const json = extractJson(raw)
      const parsed = JSON.parse(json) as Record<string, unknown>

      const kind = toLowerSafe(parsed.kind)
      if (kind === 'tool') {
        const tool = normalizeToolName(parsed.tool)
        if (!tool) {
          throw new Error('invalid tool name')
        }
        const input = parsed.input && typeof parsed.input === 'object'
          ? (parsed.input as Record<string, unknown>)
          : {}
        const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 180) : 'missing data'
        return {
          kind: 'tool',
          tool,
          input,
          reason,
        }
      }

      const answer = typeof parsed.answer === 'string'
        ? parsed.answer.trim()
        : String(parsed.final ?? '').trim()
      const references = this.normalizeReferences(parsed.references)
      const suggested = this.normalizeSuggested(parsed.suggested_questions)
      return {
        kind: 'final',
        answer: answer || 'Non ho dati sufficienti per una risposta affidabile con il contesto corrente.',
        references,
        suggested_questions: suggested,
      }
    } catch {
      return {
        kind: 'final',
        answer: raw.trim() || 'Risposta non disponibile.',
        references: [],
        suggested_questions: [],
      }
    }
  }

  private normalizeReferences(value: unknown): AiChatReference[] {
    if (!Array.isArray(value)) {
      return []
    }
    const out: AiChatReference[] = []
    for (let i = 0; i < value.length; i++) {
      const row = value[i]
      if (!row || typeof row !== 'object') continue
      const rec = row as Record<string, unknown>
      let type = typeof rec.type === 'string' ? rec.type.trim().toLowerCase() : ''
      if (type === 'civ') type = 'civilization'
      if (!ALLOWED_REFERENCE_TYPES.has(type)) continue
      const id = typeof rec.id === 'string' ? rec.id.trim() : ''
      if (!id) continue
      const label = typeof rec.label === 'string' && rec.label.trim().length > 0
        ? rec.label.trim().slice(0, 120)
        : `${type}:${id}`
      out.push({ type, id, label })
      if (out.length >= 12) break
    }
    return out
  }

  private normalizeSuggested(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return []
    }
    const out: string[] = []
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (typeof item !== 'string') continue
      const text = item.trim().replace(/\s+/g, ' ')
      if (!text) continue
      out.push(text.slice(0, 180))
      if (out.length >= 4) break
    }
    return out
  }

  private async recordToolCall(
    tool: AiToolName,
    input: Record<string, unknown>,
    toolCalls: AiChatResult['toolCalls'],
  ): Promise<ToolCallResult> {
    const result = await this.toolRouter.callTool(tool, input)
    toolCalls.push({
      tool,
      input: { ...input },
      ok: result.ok,
    })
    return result
  }

  private async buildToolOnlyFallback(
    request: AiChatRequest,
    toolCalls: AiChatResult['toolCalls'],
    loopError: unknown,
  ): Promise<AiChatResult | null> {
    const worldSummaryResult = await this.recordToolCall('getWorldSummary', {}, toolCalls)
    if (!worldSummaryResult.ok) {
      return null
    }

    const worldSummary = asRecord(worldSummaryResult.data)
    if (!worldSummary) {
      return null
    }

    const climate = asRecord(worldSummary.climate) ?? {}
    const topSpeciesRaw = Array.isArray(worldSummary.topSpecies) ? worldSummary.topSpecies : []
    const topCivsRaw = Array.isArray(worldSummary.topCivilizations) ? worldSummary.topCivilizations : []
    const activeEventsRaw = Array.isArray(worldSummary.activeEvents) ? worldSummary.activeEvents : []

    const question = request.question.toLowerCase()
    const wantsTopSpecies =
      question.includes('species') ||
      question.includes('specie') ||
      question.includes('top')
    const wantsEnergyTrend =
      wantsTopSpecies &&
      (question.includes('energia') ||
        question.includes('energy') ||
        question.includes('trend') ||
        question.includes('andamento'))
    const wantsEvents = question.includes('event') || question.includes('evento')
    const wantsCivs =
      question.includes('civ') || question.includes('civil') || question.includes('faction')

    let topSpeciesRows: unknown[] = topSpeciesRaw
    if (wantsTopSpecies) {
      const topSpeciesResult = await this.recordToolCall('getTopSpecies', { size: 5, page: 0 }, toolCalls)
      if (topSpeciesResult.ok) {
        const topData = asRecord(topSpeciesResult.data)
        const items = topData && Array.isArray(topData.items) ? topData.items : null
        if (items && items.length > 0) {
          topSpeciesRows = items
        }
      }
    }

    const references: AiChatReference[] = []
    const referenceKeys = new Set<string>()
    const pushReference = (type: AiChatReference['type'], id: string, label: string): void => {
      if (!id) return
      const key = `${type}:${id}`
      if (referenceKeys.has(key)) return
      referenceKeys.add(key)
      references.push({ type, id, label: label || `${type}:${id}` })
    }

    const topSpeciesLines: string[] = []
    const topSpeciesEnergyLines: string[] = []
    for (let i = 0; i < topSpeciesRows.length && i < 5; i++) {
      const row = asRecord(topSpeciesRows[i])
      if (!row) continue
      const id = asString(row.speciesId)
      const name = asString(row.commonName) || asString(row.name) || id
      const population = asNumber(row.population)
      const avgEnergy = asNumber(row.avgEnergy)
      const avgHydration = asNumber(row.avgHydration)
      const vitality = asNumber(row.vitality)
      const avgTempStress = asNumber(row.avgTempStress)
      const avgHumidityStress = asNumber(row.avgHumidityStress)
      if (!id && !name) continue
      topSpeciesLines.push(`${name || id}: ${Math.round(population)}`)

      if (wantsEnergyTrend) {
        const stress = (avgTempStress + avgHumidityStress) * 0.5
        let trend = 'instabile'
        if (avgEnergy >= 65 && vitality >= 0.62 && stress <= 0.18) {
          trend = 'stabile'
        } else if (avgEnergy >= 45 && vitality >= 0.45 && stress <= 0.3) {
          trend = 'laterale'
        } else if (avgEnergy > 0 || vitality > 0) {
          trend = 'in calo'
        }

        topSpeciesEnergyLines.push(
          `${i + 1}) ${name || id}: pop=${Math.round(population)} energy=${avgEnergy.toFixed(1)} hydration=${avgHydration.toFixed(1)} vitality=${vitality.toFixed(2)} trend=${trend}`,
        )
      }

      if (id) {
        pushReference('species', id, name || id)
      }
    }

    const topCivLines: string[] = []
    for (let i = 0; i < topCivsRaw.length && i < 4; i++) {
      const row = asRecord(topCivsRaw[i])
      if (!row) continue
      const id = asString(row.id)
      const name = asString(row.name) || id
      const population = asNumber(row.population)
      if (!id && !name) continue
      topCivLines.push(`${name || id}: ${Math.round(population)}`)
      if (id) {
        pushReference('civilization', id, name || id)
      }
    }

    const activeEventLines: string[] = []
    for (let i = 0; i < activeEventsRaw.length && i < 4; i++) {
      const row = asRecord(activeEventsRaw[i])
      if (!row) continue
      const id = asString(row.id)
      const type = asString(row.type) || 'event'
      const x = Math.round(asNumber(row.x))
      const y = Math.round(asNumber(row.y))
      const remaining = Math.round(asNumber(row.remainingTicks))
      activeEventLines.push(`${type} @ (${x}, ${y}) rem=${remaining}`)
      if (id) {
        pushReference('event', id, `${type} (${id})`)
      }
    }

    const loopErrorMessage =
      loopError instanceof Error
        ? loopError.message
        : loopError
          ? String(loopError)
          : ''

    const lines: string[] = []
    // lines.push(
    //   `LLM locale non raggiungibile (${this.client.getProvider()} @ ${this.client.getBaseUrl()}). Risposta in modalità tool-only.`,
    // )
    lines.push(
      `Tick ${Math.round(asNumber(worldSummary.tick))} · Era ${asString(worldSummary.eraId)} · Pop ${Math.round(asNumber(worldSummary.totalPopulation))} · Biodiversity ${Math.round(asNumber(worldSummary.biodiversity))}`,
    )
    lines.push(
      `Climate: temp=${asNumber(climate.temperature).toFixed(3)} hum=${asNumber(climate.humidity).toFixed(3)} fert=${asNumber(climate.fertility).toFixed(3)} hazard=${asNumber(climate.hazard).toFixed(3)}`,
    )
    lines.push(`Biomass total: ${asNumber(worldSummary.biomassTotal).toFixed(1)}`)

    if (wantsEnergyTrend && topSpeciesEnergyLines.length > 0) {
      lines.push('Top 5 species con trend energia (proxy locale su energia+stress, non serie storica):')
      lines.push(topSpeciesEnergyLines.join('\n'))
    } else if (topSpeciesLines.length > 0) {
      lines.push(`Top species: ${topSpeciesLines.join(' | ')}`)
    }
    if (wantsCivs && topCivLines.length > 0) {
      lines.push(`Top civilizations: ${topCivLines.join(' | ')}`)
    }
    if (wantsEvents && activeEventLines.length > 0) {
      lines.push(`Active events: ${activeEventLines.join(' | ')}`)
    }
    if (loopErrorMessage) {
      lines.push(`Diagnostic: ${loopErrorMessage}`)
    }

    return {
      answer: lines.join('\n'),
      references: references.slice(0, 12),
      suggested_questions: [
        'Mostrami i top 5 species con trend energia',
        'Ci sono eventi attivi pericolosi adesso?',
        'Qual e la civilta dominante e dove si trova?',
      ],
      toolCalls,
      cacheKey: '',
    }
  }

  private fallbackFinal(
    request: AiChatRequest,
    observations: readonly ToolObservation[],
    toolCalls: AiChatResult['toolCalls'],
  ): AiChatResult {
    const obsPreview = observations
      .slice(-2)
      .map((obs) => `${obs.tool}: ${obs.result.ok ? 'ok' : obs.result.error ?? 'error'}`)
      .join(' | ')

    const answer = [
      'Non sono riuscito a completare una risposta strutturata dal modello locale entro i limiti di step.',
      `Domanda: ${request.question}`,
      `Osservazioni: ${obsPreview || 'nessuna'}`,
      'Prova a riformulare con un target esplicito (speciesId, creatureId, civId o eventId).',
    ].join('\n')

    return {
      answer,
      references: [],
      suggested_questions: [
        'Mostrami un riepilogo del mondo corrente',
        'Quali sono le specie piu popolose adesso?',
      ],
      toolCalls,
      cacheKey: '',
    }
  }

  private async invokeChat(
    messages: readonly ChatMessage[],
    jsonMode: boolean,
    stream = false,
    onToken?: (token: string) => void,
  ): Promise<string> {
    const payload: LlmMessage[] = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    return this.client.complete({
      model: this.model,
      messages: payload,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      jsonMode,
      stream,
      onToken,
    })
  }
}
