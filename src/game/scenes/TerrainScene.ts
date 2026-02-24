import { Application, Container, Graphics } from 'pixi.js'

import type { Scene } from './Scene'
import { WorldGenesisAgent } from '../../ai/gene/WorldGenesisAgent'
import { LlmAgent } from '../../ai/llm/LlmAgent'
import {
  AiChatService,
  type AiChatSelectionContext,
} from '../../ai/llm/services/AiChatService'
import { CreatureDescriptionService } from '../../ai/llm/services/CreatureDescriptionService'
import { WorldKnowledgePack } from '../../ai/WorldKnowledgePack'
import { ToolRouter } from '../../ai/llm/tools/ToolRouter'
import { SeededRng } from '../../core/SeededRng'
import { CreatureRenderer } from '../../creatures/CreatureRenderer'
import { CreatureSystem, type Bounds, type CreatureHooks } from '../../creatures/CreatureSystem'
import { SpeciesRegistry } from '../../creatures/SpeciesRegistry'
import type { Species } from '../../creatures/types'
import { CivSystem } from '../../civ/CivSystem'
import type { Agent, AgentInspectorData, CivTimelineCategory, Structure } from '../../civ/types'
import { EventSystem } from '../../events/EventSystem'
import { CraftingEvolutionSystem } from '../../items/CraftingEvolutionSystem'
import { ItemCatalog } from '../../items/ItemCatalog'
import type { HeatmapMode } from '../../render/ChunkedTerrainRenderer'
import { ChunkedTerrainRenderer } from '../../render/ChunkedTerrainRenderer'
import { SimulationLog } from '../../log/SimulationLog'
import { MetricsCollector } from '../../metrics/MetricsCollector'
import type {
  AiChatMessage,
  AiChatSummary,
  OverlayToggleType,
  SimulationSnapshot,
} from '../../ui/overlay/types'
import { OverlayController } from '../../ui/overlay/OverlayController'
import { UISnapshotBuilder } from '../../ui/overlay/UISnapshotBuilder'
import { SelectionManager } from '../../ui/selection/SelectionManager'
import { DEFAULT_SIM_TUNING, type SimTuning } from '../../sim/SimTuning'
import { CreatureInspector } from '../../ui/CreatureInspector'
import { PlantSystem } from '../../world/PlantSystem'
import { createWorldState, type WorldState } from '../../world/WorldState'
import { EnvironmentUpdater } from '../../world/EnvironmentUpdater'
import { Camera2D } from '../camera/Camera2D'
import { TileId } from '../enums/TileId'
import { TerrainGenerator } from '../terrain/TerrainGenerator'
import { screenToWorld } from '../utils/screenToWorld'
import type { TerrainGenConfig, TerrainMap } from '../../types/terrain'

const TARGET_TPS = 20
const FIXED_STEP_MS = 1000 / TARGET_TPS
const PANEL_REFRESH_MS = 150
const MAX_STEPS_PER_FRAME = 6
const DEFAULT_CREATURES = 300
const SPEED_STEPS = [0.25, 0.5, 1, 2, 5, 10]

function clampSpeed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1
  }
  return Math.max(0.25, Math.min(10, value))
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function compactJson(value: unknown, maxLen = 820): string {
  const raw = JSON.stringify(value)
  if (!raw) return '{}'
  if (raw.length <= maxLen) return raw
  return `${raw.slice(0, maxLen)}...`
}

function normalizeReferenceType(value: string): string {
  const lowered = value.trim().toLowerCase()
  if (lowered === 'civ') return 'civilization'
  return lowered
}

function hashColorHex(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hue = h % 360
  const s = 70
  const l = 55
  const sat = s / 100
  const light = l / 100
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number): number => {
    const k = (n + hue / 30) % 12
    const c = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(c * 255)
  }

  return (f(0) << 16) | (f(8) << 8) | f(4)
}

function structureColor(type: string): number {
  switch (type) {
    case 'FarmPlot':
      return 0x86c46b
    case 'House':
      return 0xd9bc8a
    case 'Storage':
      return 0x8f8f9a
    case 'WatchTower':
      return 0xb0b8c8
    case 'Road':
      return 0x8c7555
    case 'Temple':
      return 0xe5e6f0
    case 'Wall':
      return 0x6f7885
    case 'Camp':
    default:
      return 0xc9a66b
  }
}

function tileLabel(tile: TileId): string {
  switch (tile) {
    case TileId.DeepWater:
      return 'DeepWater'
    case TileId.ShallowWater:
      return 'ShallowWater'
    case TileId.Beach:
      return 'Beach'
    case TileId.Grassland:
      return 'Grassland'
    case TileId.Forest:
      return 'Forest'
    case TileId.Jungle:
      return 'Jungle'
    case TileId.Desert:
      return 'Desert'
    case TileId.Savanna:
      return 'Savanna'
    case TileId.Swamp:
      return 'Swamp'
    case TileId.Hills:
      return 'Hills'
    case TileId.Mountain:
      return 'Mountain'
    case TileId.Snow:
      return 'Snow'
    case TileId.Rock:
      return 'Rock'
    case TileId.Lava:
      return 'Lava'
    case TileId.Scorched:
      return 'Scorched'
    default:
      return `Tile-${tile}`
  }
}

type CivLogCategory =
  | 'civ_foundation'
  | 'civ_split'
  | 'civ_build'
  | 'civ_trade'
  | 'civ_war'
  | 'civ_talk'
  | 'civ_religion'
  | 'civ_law'

function mapTimelineToLog(category: CivTimelineCategory): CivLogCategory {
  switch (category) {
    case 'foundation':
      return 'civ_foundation'
    case 'split':
      return 'civ_split'
    case 'build':
      return 'civ_build'
    case 'trade':
      return 'civ_trade'
    case 'war':
      return 'civ_war'
    case 'talk':
      return 'civ_talk'
    case 'religion':
      return 'civ_religion'
    case 'law':
    default:
      return 'civ_law'
  }
}

type PointerDragState = {
  startX: number
  startY: number
  moved: boolean
}

/**
 * TerrainScene integra:
 * - eventi ambientali
 * - fauna/flora darwiniana
 * - civiltà intelligenti con fog-of-war e build
 * - LLM read-only solo per chat/descrizioni UI
 */
export class TerrainScene implements Scene {
  private readonly worldContainer = new Container()
  private readonly camera = new Camera2D({
    zoom: 1,
    minZoom: 0.45,
    maxZoom: 6,
    zoomStep: 0.0017,
  })

  private readonly terrainGenerator = new TerrainGenerator()
  private readonly worldGenesisAgent = new WorldGenesisAgent()
  private readonly llmAgent: LlmAgent
  private readonly descriptionService: CreatureDescriptionService
  private readonly worldKnowledgePack = new WorldKnowledgePack()
  private readonly simLog = new SimulationLog(5000)
  private readonly metrics = new MetricsCollector(10, 900)
  private readonly plantSystem = new PlantSystem()
  private readonly snapshotBuilder = new UISnapshotBuilder(320)
  private readonly selectionManager = new SelectionManager()

  private seed: number
  private terrainMap: TerrainMap
  private worldState: WorldState
  private rng: SeededRng

  private eventSystem: EventSystem
  private environmentUpdater: EnvironmentUpdater
  private readonly speciesRegistry: SpeciesRegistry
  private readonly creatureSystem: CreatureSystem
  private readonly civSystem: CivSystem
  private readonly toolRouter: ToolRouter
  private readonly aiChatService: AiChatService

  private itemCatalog: ItemCatalog | null = null
  private craftingSystem: CraftingEvolutionSystem | null = null
  private resetToken = 0
  private resetInFlight: Promise<void> | null = null

  private terrainRenderer: ChunkedTerrainRenderer | null = null
  private readonly creatureRenderer: CreatureRenderer

  private readonly civTerritoryGraphics = new Graphics()
  private readonly civRelationsGraphics = new Graphics()
  private readonly plantHeatGraphics = new Graphics()
  private readonly civStructuresGraphics = new Graphics()
  private readonly civAgentsGraphics = new Graphics()
  private readonly civNotesGraphics = new Graphics()
  private readonly jumpHighlightGraphics = new Graphics()
  private lastTerritoryVersion = -1
  private lastTerritoryStride = -1
  private jumpHighlightTileX = -1
  private jumpHighlightTileY = -1
  private jumpHighlightEndMs = 0

  private overlay: OverlayController | null = null
  private inspector: CreatureInspector | null = null

  private mounted = false
  private paused = false
  private speedMultiplier = 1
  private fps = 0
  private simTuning: SimTuning = { ...DEFAULT_SIM_TUNING }
  private simAccumulatorMs = 0
  private panelAccumulatorMs = 0

  private overlayMode: HeatmapMode = 'none'
  private eventsOverlayEnabled = true
  private biomeOverlayEnabled = true
  private territoryOverlayEnabled = true

  private pointerState: PointerDragState | null = null
  private lastOverlay = { stormAlpha: 0, heatAlpha: 0, coldAlpha: 0 }
  private readonly seenEventIds = new Set<string>()
  private readonly seenCivTimelineIds = new Set<string>()

  private selectedCivAgentId: string | null = null
  private selectedCivFactionId: string | null = null
  private selectedCivSpeciesId: string | null = null
  private selectedNoteId: string | null = null
  private readonly civAgentBioCache = new Map<string, string>()
  private readonly civAgentBioInFlight = new Set<string>()
  private readonly civThoughtGlossInFlight = new Set<string>()
  private readonly civNoteTranslationInFlight = new Set<string>()

  private readonly civAgentScratch: Agent[] = []
  private readonly civStructureScratch: Structure[] = []
  private agentPopup: HTMLDivElement | null = null
  private lastAgentPopupClientX = 0
  private lastAgentPopupClientY = 0
  private latestSnapshot: SimulationSnapshot | null = null

  private readonly aiChatQuickPrompts = [
    'status world',
    'top species',
    'recent events',
    'why is species X dying?',
  ]
  private readonly aiChatMessages: AiChatMessage[] = []
  private readonly aiChatMaxMessages = 200
  private aiChatBusy = false
  private aiChatFollowSelection = true
  private aiChatExplainMode = true
  private aiChatProvider: AiChatSummary['provider'] = 'offline'
  private aiChatMessageCounter = 1
  private worldGenesisSummary: SimulationSnapshot['worldGenesis'] = null

  private readonly tickHooks: CreatureHooks = {
    onSpeciation: (species, tick) => {
      this.simLog.addSpeciation(
        tick,
        `Nuova specie ${species.id} (${species.commonName}), biomi=${species.allowedBiomes
          .map((b) => tileLabel(b))
          .join(',')}`,
      )
    },
    onIntelligenceAwakening: (species, tick, intelligence) => {
      this.simLog.addCreature(
        tick,
        `Risveglio cognitivo: ${species.commonName} (${species.id}) intelligenza=${intelligence.toFixed(2)}`,
      )
    },
  }

  private readonly onWheel = (event: WheelEvent): void => {
    this.updateCameraBounds()
    this.camera.handleWheel(event, this.app.canvas)
    this.camera.applyTo(this.worldContainer)
    this.renderFrameLayers()
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return
    }

    this.pointerState = {
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    this.camera.handlePointerDown(event)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerState) {
      return
    }

    const dx = event.clientX - this.pointerState.startX
    const dy = event.clientY - this.pointerState.startY
    if (dx * dx + dy * dy > 25) {
      this.pointerState.moved = true
    }

    this.updateCameraBounds()
    this.camera.handlePointerMove(event)
    this.camera.applyTo(this.worldContainer)
    this.renderFrameLayers()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const pointer = this.pointerState
    this.pointerState = null
    this.camera.handlePointerUp()

    if (!pointer || pointer.moved || event.button !== 0) {
      return
    }

    if (!this.isInsideCanvas(event.clientX, event.clientY)) {
      return
    }

    this.handleCanvasClick(event.clientX, event.clientY)
  }

  constructor(
    private readonly app: Application,
    terrainMap: TerrainMap,
    private readonly tileSize: number,
  ) {
    this.seed = terrainMap.seed | 0
    this.terrainMap = terrainMap
    this.worldState = createWorldState(this.terrainMap, this.seed, 64)
    this.rng = new SeededRng((this.seed ^ 0x7f4a7c15) >>> 0)

    this.eventSystem = new EventSystem(this.seed, {
      spawnCooldownTicks: 90,
      maxActiveEvents: 4,
    })
    this.environmentUpdater = new EnvironmentUpdater(this.seed ^ 0x19a4d5b7)

    this.speciesRegistry = new SpeciesRegistry(this.seed ^ 0x1234abcd)
    this.creatureSystem = new CreatureSystem(this.speciesRegistry)
    this.creatureRenderer = new CreatureRenderer(this.creatureSystem, this.tileSize)

    this.civSystem = new CivSystem(this.seed ^ 0x5ac3a771, this.worldState.width, this.worldState.height)

    this.toolRouter = new ToolRouter({
      getWorldState: () => this.worldState,
      getSnapshot: () => this.latestSnapshot,
      getSpeciesStats: () => this.creatureSystem.getSpeciesStats(),
      getCreatureSystem: () => this.creatureSystem,
      getCivSystem: () => this.civSystem,
      getEventSystem: () => this.eventSystem,
      getLogEntries: (limit?: number) => this.simLog.getEntries(limit ?? 300),
    })

    this.llmAgent = new LlmAgent(this.toolRouter)
    this.aiChatService = this.llmAgent.chat()
    this.descriptionService = this.llmAgent.creatureDescription()
    this.aiChatProvider = this.aiChatService.getProvider()
  }

  mount(): void {
    if (this.mounted) {
      return
    }
    this.mounted = true

    this.app.stage.addChild(this.worldContainer)
    this.app.canvas.style.touchAction = 'none'

    void this.resetSimulation(this.seed, this.terrainMap)

    this.inspector = new CreatureInspector(
      this.descriptionService,
      this.creatureSystem,
      this.app.canvas.parentElement ?? document.body,
    )

    this.overlay = new OverlayController()
    this.overlay.mount(this.app.canvas.parentElement ?? document.body)
    this.overlay.onAction((action, payload) => {
      if (action === 'playPause') {
        this.togglePause()
        return
      }
      if (action === 'speedDown') {
        this.stepSpeed(-1)
        return
      }
      if (action === 'speedUp') {
        this.stepSpeed(1)
        return
      }
      if (action === 'reset' && payload && 'seed' in payload && typeof payload.seed === 'number') {
        void this.resetSimulation(payload.seed)
        return
      }
      if (
        action === 'focusWorldPoint' &&
        payload &&
        'x' in payload &&
        'y' in payload &&
        typeof payload.x === 'number' &&
        typeof payload.y === 'number'
      ) {
        this.focusCameraOnTileWithHighlight(payload.x, payload.y)
        return
      }
      if (
        action === 'inspectCivAgent' &&
        payload &&
        'agentId' in payload &&
        typeof payload.agentId === 'string'
      ) {
        const agent = this.civSystem.getAgentById(payload.agentId)
        if (!agent) {
          return
        }
        this.selectedCivAgentId = agent.id
        this.selectedCivFactionId = agent.factionId
        this.selectedCivSpeciesId = null
        this.selectedNoteId = null
        this.selectionManager.selectCreature(agent.id, agent.name)
        this.focusCameraOnTile(agent.x, agent.y)
        this.requestAgentNarrativeBio(agent.id)
        this.updateOverlayNow()
        return
      }
      if (
        action === 'selectCivFaction' &&
        payload &&
        'factionId' in payload &&
        typeof payload.factionId === 'string'
      ) {
        this.selectedCivFactionId = payload.factionId
        this.selectedCivAgentId = null
        this.selectedCivSpeciesId = null
        this.selectedNoteId = null
        this.hideAgentPopup()
        const faction = this.civSystem.getFactionById(payload.factionId)
        if (faction) {
          this.selectionManager.selectCivilization(payload.factionId, faction.name ?? payload.factionId)
          this.focusCameraOnTileWithHighlight(faction.homeCenterX, faction.homeCenterY)
        } else {
          this.selectionManager.selectCivilization(payload.factionId, payload.factionId)
        }
        this.updateOverlayNow()
        return
      }
      if (
        action === 'filterCivBySpecies' &&
        payload &&
        'speciesId' in payload &&
        typeof payload.speciesId === 'string'
      ) {
        this.selectedCivSpeciesId = payload.speciesId
        this.selectionManager.selectSpecies(payload.speciesId, payload.speciesId)
        const match = this.civSystem
          .getFactionSummaries()
          .find(
            (faction) =>
              faction.foundingSpeciesId === payload.speciesId ||
              faction.dominantSpeciesId === payload.speciesId,
          )
        if (match) {
          this.selectedCivFactionId = match.id
          const faction = this.civSystem.getFactionById(match.id)
          if (faction) {
            this.focusCameraOnTileWithHighlight(faction.homeCenterX, faction.homeCenterY)
          }
        } else {
          this.selectedCivFactionId = null
        }
        this.selectedCivAgentId = null
        this.selectedNoteId = null
        this.hideAgentPopup()
        this.updateOverlayNow()
        return
      }
      if (
        action === 'selectCivNote' &&
        payload &&
        'noteId' in payload &&
        typeof payload.noteId === 'string'
      ) {
        this.selectedNoteId = payload.noteId
        this.selectedCivAgentId = null
        this.selectedCivSpeciesId = null
        this.hideAgentPopup()
        const note = this.civSystem.getNoteById(payload.noteId)
        if (note) {
          this.selectionManager.selectNote(note.id, note.id)
          this.selectedCivFactionId = note.factionId
          this.focusCameraOnTileWithHighlight(note.x, note.y)
        }
        this.updateOverlayNow()
        return
      }
      if (
        action === 'requestAgentThoughtGloss' &&
        payload &&
        'agentId' in payload &&
        typeof payload.agentId === 'string'
      ) {
        this.requestAgentThoughtGloss(payload.agentId)
        return
      }
      if (
        action === 'requestNoteTranslation' &&
        payload &&
        'noteId' in payload &&
        typeof payload.noteId === 'string'
      ) {
        this.requestNoteTranslation(payload.noteId)
        return
      }
      if (
        action === 'aiChatSendMessage' &&
        payload &&
        'text' in payload &&
        typeof payload.text === 'string'
      ) {
        void this.submitAiChatMessage(payload.text)
        return
      }
      if (
        action === 'aiChatSetFollowSelection' &&
        payload &&
        'enabled' in payload &&
        typeof payload.enabled === 'boolean'
      ) {
        this.aiChatFollowSelection = payload.enabled
        this.updateOverlayNow()
        return
      }
      if (
        action === 'aiChatSetExplainMode' &&
        payload &&
        'enabled' in payload &&
        typeof payload.enabled === 'boolean'
      ) {
        this.aiChatExplainMode = payload.enabled
        this.updateOverlayNow()
        return
      }
      if (
        action === 'aiChatJumpToReference' &&
        payload &&
        'referenceType' in payload &&
        'id' in payload &&
        typeof payload.referenceType === 'string' &&
        typeof payload.id === 'string'
      ) {
        this.jumpToReference(payload.referenceType, payload.id)
        return
      }
      if (
        action === 'toggleOverlay' &&
        payload &&
        'type' in payload &&
        'enabled' in payload &&
        typeof payload.type === 'string' &&
        typeof payload.enabled === 'boolean'
      ) {
        this.applyOverlayToggle(payload.type as OverlayToggleType, payload.enabled)
        return
      }
      if (
        action === 'setTuningParam' &&
        payload &&
        'name' in payload &&
        'value' in payload &&
        typeof payload.name === 'string' &&
        typeof payload.value === 'number'
      ) {
        this.applyTuningParam(payload.name, payload.value)
      }
    })

    this.createAgentPopup()
    this.bindInput()
    this.renderFrameLayers()
    this.updateOverlayNow()
  }

  update(deltaMs: number): void {
    if (!this.mounted) {
      return
    }

    if (deltaMs > 0) {
      const instantFps = 1000 / deltaMs
      this.fps = this.fps <= 0 ? instantFps : this.fps * 0.88 + instantFps * 0.12
    }

    this.updateCameraBounds()
    this.camera.applyTo(this.worldContainer)

    if (this.resetInFlight) {
      this.renderFrameLayers()
      this.panelAccumulatorMs += deltaMs
      if (this.panelAccumulatorMs >= PANEL_REFRESH_MS) {
        this.panelAccumulatorMs = 0
        this.updateOverlayNow()
      }
      return
    }

    if (!this.paused) {
      this.simAccumulatorMs += deltaMs * this.speedMultiplier * this.simTuning.simulationSpeed
      let steps = 0

      while (this.simAccumulatorMs >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        this.simAccumulatorMs -= FIXED_STEP_MS
        this.stepSimulationTick()
        steps++
      }
    }

    this.processNarrativeQueue()
    this.renderFrameLayers()

    this.panelAccumulatorMs += deltaMs
    if (this.panelAccumulatorMs >= PANEL_REFRESH_MS) {
      this.panelAccumulatorMs = 0
      this.updateOverlayNow()
    }
  }

  destroy(): void {
    this.unbindInput()
    this.overlay?.unmount()
    this.overlay = null
    this.destroyAgentPopup()

    this.inspector?.destroy()
    this.inspector = null

    if (this.terrainRenderer) {
      this.terrainRenderer.destroy()
      this.terrainRenderer = null
    }
    this.worldContainer.destroy({ children: true })

    this.mounted = false
  }

  private bindInput(): void {
    this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.app.canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
  }

  private unbindInput(): void {
    this.app.canvas.removeEventListener('wheel', this.onWheel)
    this.app.canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
  }

  private async resetSimulation(seed: number, mapOverride?: TerrainMap): Promise<void> {
    const token = ++this.resetToken
    const task = this.resetSimulationInternal(token, seed, mapOverride)
    this.resetInFlight = task
    try {
      await task
    } finally {
      if (this.resetInFlight === task) {
        this.resetInFlight = null
      }
    }
  }

  private async resetSimulationInternal(
    token: number,
    seed: number,
    mapOverride?: TerrainMap,
  ): Promise<void> {
    this.seed = seed | 0
    this.simAccumulatorMs = 0
    this.panelAccumulatorMs = 0
    this.lastOverlay = { stormAlpha: 0, heatAlpha: 0, coldAlpha: 0 }
    this.seenEventIds.clear()
    this.seenCivTimelineIds.clear()
    this.metrics.clear()
    this.snapshotBuilder.reset()
    this.simLog.clear()
    this.selectedCivAgentId = null
    this.selectedCivFactionId = null
    this.selectedCivSpeciesId = null
    this.selectedNoteId = null
    this.selectionManager.clear()
    this.latestSnapshot = null
    this.civAgentBioCache.clear()
    this.civAgentBioInFlight.clear()
    this.civThoughtGlossInFlight.clear()
    this.civNoteTranslationInFlight.clear()
    this.lastTerritoryVersion = -1
    this.lastTerritoryStride = -1
    this.jumpHighlightTileX = -1
    this.jumpHighlightTileY = -1
    this.jumpHighlightEndMs = 0
    this.aiChatBusy = false
    this.worldGenesisSummary = null

    this.terrainMap = mapOverride ?? this.generateTerrainMap(this.seed)
    this.worldState = createWorldState(this.terrainMap, this.seed, 64)
    this.rng.reseed((this.seed ^ 0x7f4a7c15) >>> 0)

    try {
      const genesisResult = this.worldGenesisAgent.generate(this.seed)
      const applied = this.worldGenesisAgent.applyBestConfig(
        this.worldState,
        this.simTuning,
        genesisResult.bestConfig,
        this.seed,
      )
      this.simTuning = applied.tuning
      this.worldGenesisSummary = this.worldGenesisAgent.toOverlaySummary(genesisResult)
      this.simLog.addInfo(
        this.worldState.tick,
        `World genesis tuned: survival=${genesisResult.report.bestScores.survivalScore.toFixed(3)} biodiversity=${genesisResult.report.bestScores.biodiversityScore.toFixed(3)} stability=${genesisResult.report.bestScores.stabilityScore.toFixed(3)}`,
      )
    } catch (error) {
      this.simLog.add(
        'info',
        this.worldState.tick,
        `World genesis tuner fallback: ${error instanceof Error ? error.message : 'unknown_error'}`,
        'warn',
      )
    }

    this.eventSystem = new EventSystem(this.seed, {
      spawnCooldownTicks: 90,
      maxActiveEvents: 4,
    })
    this.eventSystem.setEventRateMultiplier(this.simTuning.eventRate)
    this.environmentUpdater = new EnvironmentUpdater(this.seed ^ 0x19a4d5b7)

    this.speciesRegistry.reset(this.seed ^ 0x1234abcd)
    this.creatureSystem.reset(this.seed ^ 0x55aa33ff)
    this.creatureSystem.setTuning({
      baseMetabolism: this.simTuning.baseMetabolism,
      reproductionThreshold: this.simTuning.reproductionThreshold,
      reproductionCost: this.simTuning.reproductionCost,
      mutationRate: this.simTuning.mutationRate,
    })
    this.creatureSystem.spawnInitialPopulation(
      DEFAULT_CREATURES,
      this.worldState,
      this.rng,
      this.worldState.tick,
    )

    const catalog = this.createEmergencyItemCatalog(this.seed)
    this.simLog.addInfo(
      this.worldState.tick,
      'Item catalog deterministico locale applicato (LLM disabilitato su simulation path).',
    )

    if (token !== this.resetToken) {
      return
    }
    this.itemCatalog = catalog
    this.craftingSystem = new CraftingEvolutionSystem(catalog, (this.seed ^ 0x2c7f6a9b) >>> 0)
    this.civSystem.setItemSystems(catalog, this.craftingSystem)

    this.civSystem.reset(
      this.worldState,
      this.rng,
      this.worldState.tick,
      this.creatureSystem.getSpeciesStats(),
    )

    if (!this.terrainRenderer) {
      this.terrainRenderer = new ChunkedTerrainRenderer(this.worldState, {
        tileSize: this.tileSize,
      })
      this.terrainRenderer.mount(this.worldContainer)
      this.creatureRenderer.mount(this.worldContainer)

      this.plantHeatGraphics.zIndex = 24
      this.civTerritoryGraphics.zIndex = 25
      this.civRelationsGraphics.zIndex = 26
      this.civStructuresGraphics.zIndex = 27
      this.civNotesGraphics.zIndex = 28
      this.civAgentsGraphics.zIndex = 29
      this.jumpHighlightGraphics.zIndex = 30
      this.worldContainer.sortableChildren = true
      this.worldContainer.addChild(
        this.plantHeatGraphics,
        this.civTerritoryGraphics,
        this.civRelationsGraphics,
        this.civStructuresGraphics,
        this.civNotesGraphics,
        this.civAgentsGraphics,
        this.jumpHighlightGraphics,
      )
    } else {
      this.terrainRenderer.setWorld(this.worldState)
    }

    if (token !== this.resetToken) {
      return
    }

    this.terrainRenderer.setHeatmapMode(this.overlayMode)
    this.terrainRenderer.setTerrainVisible(this.biomeOverlayEnabled)
    this.terrainRenderer.setEventsOverlayEnabled(this.eventsOverlayEnabled)
    this.terrainRenderer.setAtmosphereOverlay(this.lastOverlay)
    this.terrainRenderer.renderAll()

    const worldWidthPx = this.worldState.width * this.tileSize
    const worldHeightPx = this.worldState.height * this.tileSize
    this.camera.setBounds(this.app.screen.width, this.app.screen.height, worldWidthPx, worldHeightPx)
    this.camera.centerOn(this.app.screen.width, this.app.screen.height, worldWidthPx, worldHeightPx)
    this.camera.applyTo(this.worldContainer)

    this.simLog.addInfo(
      this.worldState.tick,
      `Reset simulation seed=${this.seed} world=${this.worldState.width}x${this.worldState.height} items=${catalog.items.length}`,
    )

    this.updateOverlayNow()
    this.renderFrameLayers()
  }

  private createEmergencyItemCatalog(seed: number): ItemCatalog {
    return new ItemCatalog(seed, [
      {
        id: 'stone',
        name: 'Stone',
        category: 'resource',
        baseProperties: { weight: 1.2, buildValue: 3 },
        naturalSpawn: true,
        allowedBiomes: [TileId.Rock, TileId.Hills, TileId.Mountain, TileId.Scorched],
      },
      {
        id: 'flint',
        name: 'Flint',
        category: 'resource',
        baseProperties: { weight: 0.8, buildValue: 2, damage: 1 },
        naturalSpawn: true,
        allowedBiomes: [TileId.Rock, TileId.Hills, TileId.Beach],
      },
      {
        id: 'branch',
        name: 'Branch',
        category: 'resource',
        baseProperties: { weight: 0.6, buildValue: 2 },
        naturalSpawn: true,
        allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Jungle, TileId.Savanna],
      },
      {
        id: 'plant-fiber',
        name: 'Plant Fiber',
        category: 'resource',
        baseProperties: { weight: 0.3, buildValue: 1 },
        naturalSpawn: true,
        allowedBiomes: [TileId.Forest, TileId.Jungle, TileId.Swamp, TileId.Grassland],
      },
      {
        id: 'berry-cluster',
        name: 'Berry Cluster',
        category: 'food',
        baseProperties: { weight: 0.35, nutrition: 12 },
        naturalSpawn: true,
        allowedBiomes: [TileId.Forest, TileId.Jungle, TileId.Grassland, TileId.Swamp],
      },
      {
        id: 'wild-root',
        name: 'Wild Root',
        category: 'food',
        baseProperties: { weight: 0.45, nutrition: 11 },
        naturalSpawn: true,
        allowedBiomes: [TileId.Grassland, TileId.Savanna, TileId.Forest],
      },
      {
        id: 'clay-lump',
        name: 'Clay Lump',
        category: 'resource',
        baseProperties: { weight: 1.1, buildValue: 4 },
        naturalSpawn: true,
        allowedBiomes: [TileId.Swamp, TileId.Beach, TileId.Grassland],
      },
      {
        id: 'stone-knife',
        name: 'Stone Knife',
        category: 'tool',
        baseProperties: { weight: 0.55, durability: 52, damage: 5 },
        naturalSpawn: false,
        allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Hills],
      },
      {
        id: 'stone-axe',
        name: 'Stone Axe',
        category: 'tool',
        baseProperties: { weight: 1.8, durability: 70, damage: 8 },
        naturalSpawn: false,
        allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Hills],
      },
      {
        id: 'fiber-rope',
        name: 'Fiber Rope',
        category: 'tool',
        baseProperties: { weight: 0.45, durability: 58 },
        naturalSpawn: false,
        allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Savanna],
      },
      {
        id: 'wood-spear',
        name: 'Wood Spear',
        category: 'weapon',
        baseProperties: { weight: 1.35, durability: 48, damage: 12 },
        naturalSpawn: false,
        allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Savanna],
      },
      {
        id: 'woven-basket',
        name: 'Woven Basket',
        category: 'tool',
        baseProperties: { weight: 0.9, durability: 42, storage: 24 },
        naturalSpawn: false,
        allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Savanna],
      },
      {
        id: 'wood-plank',
        name: 'Wood Plank',
        category: 'structure_part',
        baseProperties: { weight: 1.3, buildValue: 8 },
        naturalSpawn: false,
        allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Hills],
      },
      {
        id: 'clay-brick',
        name: 'Clay Brick',
        category: 'structure_part',
        baseProperties: { weight: 2.0, buildValue: 12 },
        naturalSpawn: false,
        allowedBiomes: [TileId.Grassland, TileId.Swamp, TileId.Beach],
      },
      {
        id: 'ceramic-jar',
        name: 'Ceramic Jar',
        category: 'artifact',
        baseProperties: { weight: 1.0, durability: 38, storage: 18 },
        naturalSpawn: false,
        allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Savanna],
      },
    ])
  }

  private generateTerrainMap(seed: number): TerrainMap {
    const cfg: TerrainGenConfig = {
      width: this.terrainMap.width,
      height: this.terrainMap.height,
      seed,
      heightScale: 96,
      moistureScale: 78,
      tempScale: 120,
      seaLevel: 0.42,
      shallowWater: 0.48,
      beachBand: 0.03,
      mountainLevel: 0.8,
      snowTemp: 0.34,
    }

    return this.terrainGenerator.generate(cfg)
  }

  private stepSimulationTick(): void {
    this.worldState.tick += 1
    const tick = this.worldState.tick

    const eventResult = this.eventSystem.step(this.worldState, this.rng, tick)
    this.lastOverlay = eventResult.overlay

    this.environmentUpdater.step(this.worldState, this.rng, tick, 1200)
    this.plantSystem.step(this.worldState, this.simTuning, 2200)

    const creatureStep = this.creatureSystem.step(
      this.worldState,
      this.rng,
      1,
      tick,
      this.tickHooks,
    )

    if (creatureStep.births > 0) {
      this.simLog.addBirth(tick, `Nascite fauna tick=${tick}: +${creatureStep.births}`)
    }
    if (creatureStep.deaths > 0) {
      this.simLog.addDeath(tick, `Morti fauna tick=${tick}: -${creatureStep.deaths}`)
    }

    const civStep = this.civSystem.step(
      this.worldState,
      this.rng,
      tick,
      this.creatureSystem.getSpeciesStats(),
    )
    if (civStep.births > 0) {
      this.simLog.addBirth(tick, `Nascite civili tick=${tick}: +${civStep.births}`, { domain: 'civ' })
    }
    if (civStep.deaths > 0) {
      this.simLog.addDeath(tick, `Morti civili tick=${tick}: -${civStep.deaths}`, { domain: 'civ' })
    }
    if (civStep.newFactions > 0) {
      this.simLog.addCiv('civ_split', tick, `Nuove fazioni da scissione: ${civStep.newFactions}`)
    }
    if (civStep.talks > 0) {
      this.simLog.addCiv('civ_talk', tick, `Dialoghi civili: ${civStep.talks}`)
    }
    if (civStep.completedBuildings > 0) {
      this.simLog.addCiv('civ_build', tick, `Costruzioni completate: ${civStep.completedBuildings}`)
    }
    if (civStep.notesWritten > 0) {
      this.simLog.addCiv('civ_law', tick, `Note scritte: ${civStep.notesWritten}`)
    }

    this.captureRecentEventLogs()
    this.captureCivTimelineLogs()

    if (tick % 20 === 0) {
      this.simLog.addInfo(
        tick,
        `Fauna=${this.creatureSystem.getPopulation()} Civ=${this.civSystem.getAgents().length} Fazioni=${this.civSystem.getFactions().length}`,
      )
    }

    if (tick % 10 === 0) {
      this.metrics.sample(tick, this.worldState, this.creatureSystem.getSpeciesStats())
    }
  }

  private renderFrameLayers(): void {
    if (!this.terrainRenderer) {
      return
    }

    this.terrainRenderer.setAtmosphereOverlay(this.lastOverlay)
    this.terrainRenderer.renderDirty()

    const zoom = this.camera.zoom
    this.creatureRenderer.setDetailVisible(zoom >= 3)

    const bounds = this.computeViewportTileBounds()
    this.creatureRenderer.renderCreatures({ zoom, bounds })
    this.renderPlantHeatmap(bounds, zoom)
    this.renderCivLayers(bounds, zoom)
    this.renderJumpHighlight()
  }

  private updateCameraBounds(): void {
    const worldWidthPx = this.worldState.width * this.tileSize
    const worldHeightPx = this.worldState.height * this.tileSize
    this.camera.setBounds(this.app.screen.width, this.app.screen.height, worldWidthPx, worldHeightPx)
  }

  private renderPlantHeatmap(bounds: Bounds, zoom: number): void {
    this.plantHeatGraphics.clear()
    if (zoom >= 1.5) {
      return
    }

    const stride = zoom < 0.9 ? 8 : 5
    const cellSize = stride * this.tileSize

    for (let y = bounds.minY; y <= bounds.maxY; y += stride) {
      for (let x = bounds.minX; x <= bounds.maxX; x += stride) {
        const idx = this.worldState.index(x, y)
        const biomass = (this.worldState.plantBiomass[idx] ?? 0) / Math.max(1, this.simTuning.plantMaxBiomass)
        if (biomass <= 0.05) {
          continue
        }

        const alpha = Math.min(0.35, 0.06 + biomass * 0.38)
        const color = biomass > 0.72 ? 0x66ff6a : biomass > 0.42 ? 0x46c55d : 0x2f7642
        this.plantHeatGraphics
          .rect(x * this.tileSize, y * this.tileSize, cellSize, cellSize)
          .fill({ color, alpha })
      }
    }
  }

  private renderCivLayers(bounds: Bounds, zoom: number): void {
    this.renderTerritoryOverlay(zoom)
    this.renderRelationsOverlay(zoom)

    this.civStructuresGraphics.clear()
    if (zoom < 1.5) {
      const factions = this.civSystem.getFactionSummaries()
      for (let i = 0; i < factions.length; i++) {
        const faction = factions[i]
        if (!faction) continue
        const color = hashColorHex(faction.id)
        const px = faction.homeCenterX * this.tileSize
        const py = faction.homeCenterY * this.tileSize
        const size = this.tileSize * 2
        this.civStructuresGraphics
          .rect(px - size * 0.25, py - size * 0.25, size, size)
          .fill({ color, alpha: 0.55 })
      }
    } else {
      const structures = this.civSystem.queryStructuresInRect(bounds, this.civStructureScratch)
      for (let i = 0; i < structures.length; i++) {
        const structure = structures[i]
        if (!structure) continue

        const px = structure.x * this.tileSize
        const py = structure.y * this.tileSize
        const color = structureColor(structure.type)
        const alpha = structure.completed ? 0.9 : 0.55

        this.civStructuresGraphics
          .rect(px + 1, py + 1, Math.max(1, this.tileSize - 2), Math.max(1, this.tileSize - 2))
          .fill({ color, alpha })

        if (zoom >= 3) {
          this.civStructuresGraphics
            .rect(px + 1, py + 1, Math.max(1, this.tileSize - 2), Math.max(1, this.tileSize - 2))
            .stroke({ color: 0x111111, alpha: 0.8, width: 1 })
        }
      }
    }

    this.renderNotesOverlay(bounds, zoom)

    this.civAgentsGraphics.clear()
    if (zoom < 1.5) {
      return
    }

    const agents = this.civSystem.queryAgentsInRect(bounds, this.civAgentScratch)
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      if (!agent) continue

      const color = hashColorHex(agent.factionId)
      const px = agent.x * this.tileSize
      const py = agent.y * this.tileSize
      const margin = Math.max(1, this.tileSize * 0.18)
      const size = Math.max(1, this.tileSize - margin * 2)

      this.civAgentsGraphics
        .rect(px + margin, py + margin, size, size)
        .fill({ color, alpha: 0.92 })

      if (zoom >= 3) {
        this.civAgentsGraphics
          .rect(px + margin, py + margin, size, size)
          .stroke({ color: 0x06090f, width: 1, alpha: 0.9 })

        const eNorm = Math.max(0, Math.min(1, agent.energy / 140))
        const energyColor = eNorm > 0.66 ? 0x70f06d : eNorm > 0.33 ? 0xffd95c : 0xff7465
        const marker = Math.max(1, this.tileSize * 0.24)
        this.civAgentsGraphics
          .rect(px + this.tileSize - marker - 1, py + 1, marker, marker)
          .fill({ color: energyColor, alpha: 0.9 })
      }
    }
  }

  private renderTerritoryOverlay(zoom: number): void {
    if (!this.territoryOverlayEnabled) {
      this.civTerritoryGraphics.clear()
      return
    }

    const territory = this.civSystem.getTerritoryMap()
    const stride = zoom < 1.2 ? 8 : zoom < 2 ? 5 : 3
    if (territory.version === this.lastTerritoryVersion && stride === this.lastTerritoryStride) {
      return
    }

    this.lastTerritoryVersion = territory.version
    this.lastTerritoryStride = stride
    this.civTerritoryGraphics.clear()

    const alpha = zoom < 1.2 ? 0.22 : 0.14
    const size = stride * this.tileSize

    for (let y = 0; y < this.worldState.height; y += stride) {
      for (let x = 0; x < this.worldState.width; x += stride) {
        const idx = this.worldState.index(x, y)
        const marker = territory.ownerMap[idx] ?? 0
        if (marker <= 0) {
          continue
        }

        const factionId = territory.factionOrder[marker - 1]
        if (!factionId) {
          continue
        }

        const color = hashColorHex(factionId)
        const control = (territory.controlMap[idx] ?? 0) / 255
        this.civTerritoryGraphics
          .rect(x * this.tileSize, y * this.tileSize, size, size)
          .fill({ color, alpha: alpha * (0.35 + control * 0.9) })

        if ((territory.borderMap[idx] ?? 0) === 1 && zoom >= 1.1) {
          this.civTerritoryGraphics
            .rect(x * this.tileSize, y * this.tileSize, size, size)
            .stroke({ color: 0xf2f6ff, width: 1, alpha: 0.22 })
        }
      }
    }
  }

  private renderRelationsOverlay(zoom: number): void {
    this.civRelationsGraphics.clear()
    if (!this.territoryOverlayEnabled) {
      return
    }
    if (zoom < 0.7) {
      return
    }

    const factions = this.civSystem.getFactionSummaries()
    const factionById = new Map(factions.map((faction) => [faction.id, faction]))
    const relations = this.civSystem.getRelationSummaries()

    for (let i = 0; i < relations.length; i++) {
      const relation = relations[i]
      if (!relation || relation.status === 'neutral') continue
      const from = factionById.get(relation.fromId)
      const to = factionById.get(relation.toId)
      if (!from || !to) continue

      const x1 = (from.homeCenterX + 0.5) * this.tileSize
      const y1 = (from.homeCenterY + 0.5) * this.tileSize
      const x2 = (to.homeCenterX + 0.5) * this.tileSize
      const y2 = (to.homeCenterY + 0.5) * this.tileSize

      const color =
        relation.status === 'trade'
          ? 0x6ce7a9 // verde trade
          : relation.status === 'ally'
            ? 0x69adff // blu alleanza
            : 0xff7272 // rosso guerra
      const width = 0.8 + relation.intensity * (zoom < 1.4 ? 2.2 : 3.2)
      const alpha = 0.25 + relation.intensity * 0.4

      this.civRelationsGraphics
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({ color, width, alpha })
    }
  }

  private renderNotesOverlay(bounds: Bounds, zoom: number): void {
    this.civNotesGraphics.clear()
    if (!this.territoryOverlayEnabled) {
      return
    }
    if (zoom < 1.1) {
      return
    }

    const notes = this.civSystem.getNotes(300)
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]
      if (!note) continue
      if (
        note.x < bounds.minX ||
        note.y < bounds.minY ||
        note.x > bounds.maxX ||
        note.y > bounds.maxY
      ) {
        continue
      }

      const baseColor = hashColorHex(note.factionId)
      const size = Math.max(2, this.tileSize * 0.38)
      const px = note.x * this.tileSize + this.tileSize * 0.5
      const py = note.y * this.tileSize + this.tileSize * 0.5
      const selected = this.selectedNoteId === note.id

      this.civNotesGraphics
        .rect(px - size * 0.5, py - size * 0.5, size, size)
        .fill({ color: baseColor, alpha: selected ? 0.98 : 0.72 })
      this.civNotesGraphics
        .rect(px - size * 0.5, py - size * 0.5, size, size)
        .stroke({ color: 0xf4f8ff, width: selected ? 2 : 1, alpha: selected ? 0.9 : 0.35 })
    }
  }

  private renderJumpHighlight(): void {
    this.jumpHighlightGraphics.clear()
    const now = Date.now()
    if (this.jumpHighlightEndMs <= now || this.jumpHighlightTileX < 0 || this.jumpHighlightTileY < 0) {
      return
    }

    const msLeft = this.jumpHighlightEndMs - now
    const phase = now * 0.011
    const alpha = Math.max(0.12, Math.min(0.95, msLeft / 1200))
    const cx = (this.jumpHighlightTileX + 0.5) * this.tileSize
    const cy = (this.jumpHighlightTileY + 0.5) * this.tileSize
    const radius = this.tileSize * (0.65 + Math.sin(phase) * 0.2)

    this.jumpHighlightGraphics
      .circle(cx, cy, Math.max(4, radius))
      .stroke({ color: 0xf7fcff, width: 2, alpha })
    this.jumpHighlightGraphics
      .circle(cx, cy, Math.max(2, radius * 0.52))
      .stroke({ color: 0x89cdff, width: 1.5, alpha: alpha * 0.8 })
  }

  private computeViewportTileBounds(): Bounds {
    const scale = this.worldContainer.scale.x || 1
    const minWorldX = (0 - this.worldContainer.position.x) / scale
    const minWorldY = (0 - this.worldContainer.position.y) / scale
    const maxWorldX = (this.app.screen.width - this.worldContainer.position.x) / scale
    const maxWorldY = (this.app.screen.height - this.worldContainer.position.y) / scale

    const minX = clampInt(Math.floor(minWorldX / this.tileSize) - 2, 0, this.worldState.width - 1)
    const minY = clampInt(Math.floor(minWorldY / this.tileSize) - 2, 0, this.worldState.height - 1)
    const maxX = clampInt(Math.ceil(maxWorldX / this.tileSize) + 2, 0, this.worldState.width - 1)
    const maxY = clampInt(Math.ceil(maxWorldY / this.tileSize) + 2, 0, this.worldState.height - 1)

    return { minX, minY, maxX, maxY }
  }

  private handleCanvasClick(clientX: number, clientY: number): void {
    const point = screenToWorld(this.app.canvas, this.worldContainer, clientX, clientY)
    const tileX = point.x / this.tileSize
    const tileY = point.y / this.tileSize
    const tileXI = Math.floor(tileX)
    const tileYI = Math.floor(tileY)

    const note = this.civSystem.getNoteAtTile(tileXI, tileYI)
    if (note) {
      this.selectedNoteId = note.id
      this.selectedCivFactionId = note.factionId
      this.selectedCivAgentId = null
      this.selectedCivSpeciesId = null
      this.selectionManager.selectNote(note.id, note.id)
      this.hideAgentPopup()
      this.inspector?.hide()
      this.focusCameraOnTileWithHighlight(note.x, note.y)
      this.requestNoteTranslation(note.id)
      this.overlay?.openTab('civilizations')
      this.updateOverlayNow()
      return
    }

    const civAgent = this.civSystem.getAgentAtTile(tileX, tileY)
    if (civAgent) {
      this.selectedCivAgentId = civAgent.id
      this.selectedCivFactionId = civAgent.factionId
      this.selectedCivSpeciesId = null
      this.selectedNoteId = null
      this.selectionManager.selectCreature(civAgent.id, civAgent.name)
      this.lastAgentPopupClientX = clientX
      this.lastAgentPopupClientY = clientY
      this.updateAgentPopupForSelected(clientX, clientY)
      this.requestAgentNarrativeBio(civAgent.id)
      this.inspector?.hide()
      this.overlay?.openTab('civilizations')
      this.updateOverlayNow()
      return
    }

    this.selectedCivAgentId = null
    this.hideAgentPopup()

    const territoryFactionId = this.civSystem.getTerritoryOwnerAt(tileXI, tileYI)
    if (territoryFactionId) {
      this.selectedCivFactionId = territoryFactionId
      this.selectedCivSpeciesId = null
      this.selectedNoteId = null
      this.selectionManager.selectCivilization(territoryFactionId, territoryFactionId)
      this.inspector?.hide()
      this.focusCameraOnTileWithHighlight(tileXI, tileYI)
      this.overlay?.openTab('civilizations')
      this.updateOverlayNow()
      return
    }

    const picked = this.creatureRenderer.pickCreatureAtWorld(point.x, point.y)
    if (!picked) {
      this.inspector?.hide()
      return
    }

    const species: Species | undefined = this.creatureSystem.getSpeciesById(picked.speciesId)
    if (!species) {
      this.simLog.addInfo(this.worldState.tick, `Specie non trovata per creatura ${picked.id}`)
      return
    }

    const idx = this.worldState.index(picked.x, picked.y)
    const tile = this.worldState.tiles[idx] as TileId
    this.selectionManager.selectCreature(picked.id, picked.name)
    this.inspector?.show(picked, species, {
      biomeName: tileLabel(tile),
    })
  }

  private requestAgentNarrativeBio(agentId: string): void {
    if (this.civAgentBioCache.has(agentId) || this.civAgentBioInFlight.has(agentId)) {
      return
    }

    const data = this.civSystem.getAgentInspectorData(agentId)
    if (!data) {
      return
    }

    this.civAgentBioInFlight.add(agentId)
    const bio = [
      `${data.name} (${data.role}) · ${data.factionName}`,
      `Goal: ${data.goal}`,
      `Energy=${data.energy.toFixed(1)} Hydration=${data.hydration.toFixed(1)} Age=${data.age.toFixed(1)}`,
      `Vitals: vitality=${(data.vitality * 100).toFixed(0)}% hunger=${(data.hunger * 100).toFixed(0)}% waterNeed=${(data.waterNeed * 100).toFixed(0)}% hazardStress=${(data.hazardStress * 100).toFixed(0)}%`,
      `Inventory: food=${data.inventory.food.toFixed(1)} wood=${data.inventory.wood.toFixed(1)} stone=${data.inventory.stone.toFixed(1)} ore=${data.inventory.ore.toFixed(1)}`,
      `Thought: ${data.currentThought || 'n/a'}`,
    ].join('\n')
    this.civAgentBioCache.set(agentId, bio)
    this.civAgentBioInFlight.delete(agentId)

    if (this.selectedCivAgentId === agentId) {
      this.updateAgentPopupForSelected(this.lastAgentPopupClientX, this.lastAgentPopupClientY)
    }
  }

  private requestAgentThoughtGloss(agentId: string): void {
    if (this.civThoughtGlossInFlight.has(agentId)) {
      return
    }
    const data = this.civSystem.getAgentInspectorData(agentId)
    if (!data || data.thoughtGloss) {
      return
    }

    this.civThoughtGlossInFlight.add(agentId)
    const reasons = data.mentalState.lastReasonCodes.join(', ') || 'none'
    const gloss = [
      `Goal=${data.goal}; state=${data.activityState}.`,
      `Signals: food=${(data.mentalState.perceivedFoodLevel * 100).toFixed(0)}% threat=${(data.mentalState.perceivedThreatLevel * 100).toFixed(0)}% stress=${(data.mentalState.stressLevel * 100).toFixed(0)}%.`,
      `Reason codes: ${reasons}.`,
    ].join(' ')

    this.civSystem.setAgentThoughtGloss(agentId, gloss)
    this.civThoughtGlossInFlight.delete(agentId)
    if (this.selectedCivAgentId === agentId) {
      this.updateAgentPopupForSelected(this.lastAgentPopupClientX, this.lastAgentPopupClientY)
    }
    this.updateOverlayNow()
  }

  private requestNoteTranslation(noteId: string): void {
    if (this.civNoteTranslationInFlight.has(noteId)) {
      return
    }
    const note = this.civSystem.getNoteById(noteId)
    if (!note || note.translatedContent) {
      return
    }
    const faction = this.civSystem.getFactionById(note.factionId)
    if (!faction) {
      return
    }

    this.civNoteTranslationInFlight.add(noteId)
    const translated = [
      `[${faction.name ?? faction.id}]`,
      `t${note.createdAtTick}`,
      note.tokenContent.slice(0, 180),
    ].join(' ')
    this.civSystem.setNoteTranslation(noteId, translated)
    this.civNoteTranslationInFlight.delete(noteId)
    this.updateOverlayNow()
  }

  private captureRecentEventLogs(): void {
    const recent = this.eventSystem.getRecentEvents()
    for (let i = 0; i < recent.length; i++) {
      const event = recent[i]
      if (!event || this.seenEventIds.has(event.id)) {
        continue
      }

      this.seenEventIds.add(event.id)
      this.simLog.addEvent(
        event.tick,
        `${event.type} @ (${event.x}, ${event.y})`,
        {
          eventId: event.id,
          x: event.x,
          y: event.y,
        },
      )
    }

    if (this.seenEventIds.size > 256) {
      const toDrop = this.seenEventIds.size - 256
      let dropped = 0
      for (const id of this.seenEventIds) {
        this.seenEventIds.delete(id)
        dropped++
        if (dropped >= toDrop) {
          break
        }
      }
    }
  }

  private captureCivTimelineLogs(): void {
    const timeline = this.civSystem.getTimeline(240)
    for (let i = 0; i < timeline.length; i++) {
      const entry = timeline[i]
      if (!entry || this.seenCivTimelineIds.has(entry.id)) {
        continue
      }

      this.seenCivTimelineIds.add(entry.id)
      this.simLog.addCiv(mapTimelineToLog(entry.category), entry.tick, entry.message, {
        position:
          typeof entry.x === 'number' && typeof entry.y === 'number'
            ? { x: entry.x, y: entry.y }
            : undefined,
        factionId: entry.factionId,
        subjectId: entry.id,
      })
    }

    if (this.seenCivTimelineIds.size > 512) {
      const toDrop = this.seenCivTimelineIds.size - 512
      let dropped = 0
      for (const id of this.seenCivTimelineIds) {
        this.seenCivTimelineIds.delete(id)
        dropped++
        if (dropped >= toDrop) {
          break
        }
      }
    }
  }

  private processNarrativeQueue(): void {
    const request = this.civSystem.dequeueNarrativeRequest()
    if (!request) {
      return
    }

    if (request.type === 'faction_identity') {
      const faction = this.civSystem.getFactions().find((f) => f.id === request.factionId)
      if (!faction) {
        return
      }
      const identityName = faction.name ?? `Collective ${faction.foundingSpeciesId}`
      const religionName = faction.religion ?? `Culto di ${faction.identitySymbol ?? 'Equilibrio'}`
      this.civSystem.applyFactionNarrative(
        request.factionId,
        {
          name: identityName,
          motto: `Ordine, adattamento e continuita su seed ${this.seed}.`,
          religion: religionName,
          coreLaws: [
            'Conservare risorse critiche.',
            'Difendere il territorio vitale.',
            'Trasmettere conoscenza tecnica.',
          ],
        },
        request.tick,
      )
      this.simLog.addCiv('civ_foundation', request.tick, `Narrativa fazione aggiornata: ${identityName}`, {
        factionId: request.factionId,
        subjectId: request.id,
      })
      return
    }

    if (request.type === 'dialogue') {
      const tone = request.payload.contextSummary.toLowerCase().includes('war') ? 'alert' : 'neutral'
      this.civSystem.applyDialogueTranslation(request.payload.dialogueId, {
        gloss_it: `${request.payload.speakerAName} e ${request.payload.speakerBName}: ${request.payload.contextSummary}`.slice(0, 180),
        tone,
        new_terms: request.payload.utteranceTokens.slice(0, 4),
      })
      return
    }

    const chronicle = request.payload.recentLogs.slice(-3).join(' | ').slice(0, 180) || 'Cronaca sintetica locale.'
    this.civSystem.addChronicle(request.factionId, request.tick, chronicle)
  }

  private pushAiChatMessage(
    role: AiChatMessage['role'],
    content: string,
    options?: {
      pending?: boolean
      references?: AiChatMessage['references']
      suggestedQuestions?: string[]
      error?: string
    },
  ): string {
    const id = `aichat-${this.aiChatMessageCounter++}`
    this.aiChatMessages.push({
      id,
      role,
      tick: this.worldState.tick,
      createdAtMs: Date.now(),
      content,
      pending: options?.pending ?? false,
      error: options?.error,
      references: options?.references ? options.references.map((ref) => ({ ...ref })) : [],
      suggestedQuestions: options?.suggestedQuestions ? [...options.suggestedQuestions] : [],
    })
    if (this.aiChatMessages.length > this.aiChatMaxMessages) {
      this.aiChatMessages.splice(0, this.aiChatMessages.length - this.aiChatMaxMessages)
    }
    return id
  }

  private resolveAiPendingMessage(
    messageId: string,
    update: {
      content: string
      references?: AiChatMessage['references']
      suggestedQuestions?: string[]
      error?: string
    },
  ): void {
    const index = this.aiChatMessages.findIndex((message) => message.id === messageId)
    if (index === -1) {
      this.pushAiChatMessage('assistant', update.content, {
        pending: false,
        references: update.references,
        suggestedQuestions: update.suggestedQuestions,
        error: update.error,
      })
      return
    }
    const message = this.aiChatMessages[index]
    if (!message) {
      return
    }
    message.pending = false
    message.content = update.content
    message.error = update.error
    message.references = update.references ? update.references.map((ref) => ({ ...ref })) : []
    message.suggestedQuestions = update.suggestedQuestions ? [...update.suggestedQuestions] : []
  }

  private buildAiHistoryForService(): Array<{ role: 'user' | 'assistant'; text: string }> {
    const out: Array<{ role: 'user' | 'assistant'; text: string }> = []
    const start = Math.max(0, this.aiChatMessages.length - 20)
    for (let i = start; i < this.aiChatMessages.length; i++) {
      const message = this.aiChatMessages[i]
      if (!message) continue
      if (message.pending) continue
      if (message.role !== 'user' && message.role !== 'assistant') continue
      out.push({
        role: message.role,
        text: message.content,
      })
    }
    return out
  }

  private buildAiSelectionContext(): AiChatSelectionContext | null {
    const selection = this.selectionManager.getSelection()
    if (!selection) {
      return null
    }
    return {
      type: selection.type,
      id: selection.id,
      label: selection.label ?? `${selection.type}:${selection.id}`,
    }
  }

  private buildAiContextInspector(): AiChatSummary['contextInspector'] {
    const selection = this.selectionManager.getSelection()
    if (!selection) {
      return {
        selectionType: null,
        selectionId: null,
        title: 'No selected entity',
        lines: ['Select an entity on map/panels or keep Follow Selection off.'],
        payloadPreview: '',
      }
    }

    if (selection.type === 'species') {
      const stat = this.creatureSystem.getSpeciesStats().find((row) => row.speciesId === selection.id)
      if (!stat) {
        return {
          selectionType: 'species',
          selectionId: selection.id,
          title: `Species ${selection.id}`,
          lines: ['Species not found in current snapshot.'],
          payloadPreview: '',
        }
      }
      return {
        selectionType: 'species',
        selectionId: selection.id,
        title: `Species ${stat.commonName} [${stat.speciesId}]`,
        lines: [
          `population=${stat.population} intelligence=${stat.intelligence.toFixed(3)} language=${stat.languageLevel.toFixed(3)}`,
          `cognition=${stat.cognitionStage} eventPressure=${stat.eventPressure.toFixed(3)}`,
          `avgEnergy=${stat.avgEnergy.toFixed(2)} vitality=${stat.vitality.toFixed(2)} traits=${stat.traits.join(', ') || '-'}`,
        ],
        payloadPreview: compactJson({
          speciesId: stat.speciesId,
          population: stat.population,
          intelligence: stat.intelligence,
          languageLevel: stat.languageLevel,
          traits: stat.traits,
          lineageIds: stat.lineageIds,
        }),
      }
    }

    if (selection.type === 'creature') {
      const creature = this.creatureSystem.getCreatures().find((row) => row.id === selection.id)
      if (creature) {
        return {
          selectionType: 'creature',
          selectionId: selection.id,
          title: `Creature ${creature.name} [${creature.id}]`,
          lines: [
            `species=${creature.speciesId} pos=(${creature.x}, ${creature.y})`,
            `energy=${creature.energy.toFixed(1)} hydration=${creature.hydration.toFixed(1)} health=${creature.health.toFixed(1)}`,
            `age=${creature.age.toFixed(1)} generation=${creature.generation} tempStress=${creature.tempStress.toFixed(2)} humidityStress=${creature.humidityStress.toFixed(2)}`,
          ],
          payloadPreview: compactJson({
            id: creature.id,
            speciesId: creature.speciesId,
            energy: creature.energy,
            hydration: creature.hydration,
            health: creature.health,
            x: creature.x,
            y: creature.y,
          }),
        }
      }

      const member = this.civSystem.getAgentInspectorData(selection.id)
      if (member) {
        return {
          selectionType: 'creature',
          selectionId: selection.id,
          title: `Member ${member.name} [${member.agentId}]`,
          lines: [
            `faction=${member.factionName} role=${member.role} species=${member.speciesId}`,
            `goal=${member.goal} state=${member.activityState} energy=${member.energy.toFixed(1)} hydration=${member.hydration.toFixed(1)}`,
            `mental: reasons=${member.mentalState.lastReasonCodes.join(', ') || '-'} stress=${(member.mentalState.stressLevel * 100).toFixed(0)}%`,
          ],
          payloadPreview: compactJson({
            agentId: member.agentId,
            factionId: member.factionId,
            role: member.role,
            goal: member.goal,
            state: member.activityState,
            mentalState: member.mentalState,
            inventoryRows: member.inventoryRows,
          }),
        }
      }

      return {
        selectionType: 'creature',
        selectionId: selection.id,
        title: `Creature ${selection.id}`,
        lines: ['Entity not found. It may have died or been removed.'],
        payloadPreview: '',
      }
    }

    if (selection.type === 'civilization') {
      const faction = this.civSystem.getFactionSummaries().find((row) => row.id === selection.id)
      if (!faction) {
        return {
          selectionType: 'civilization',
          selectionId: selection.id,
          title: `Civilization ${selection.id}`,
          lines: ['Civilization not found.'],
          payloadPreview: '',
        }
      }
      return {
        selectionType: 'civilization',
        selectionId: selection.id,
        title: `Civilization ${faction.name} [${faction.id}]`,
        lines: [
          `population=${faction.population} tech=${faction.techLevel.toFixed(2)} literacy=${faction.literacyLevel} state=${faction.state}`,
          `foundingSpecies=${faction.foundingSpeciesId} dominantSpecies=${faction.dominantSpeciesId}`,
          `strategy=${faction.strategy} territoryTiles=${faction.territoryTiles}`,
        ],
        payloadPreview: compactJson({
          id: faction.id,
          name: faction.name,
          population: faction.population,
          strategy: faction.strategy,
          culture: {
            collectivism: faction.collectivism,
            aggression: faction.aggression,
            curiosity: faction.curiosity,
            spirituality: faction.spirituality,
          },
        }),
      }
    }

    if (selection.type === 'event') {
      const active = this.eventSystem.getActiveEvents().find((event) => event.id === selection.id)
      const recent = this.eventSystem.getRecentEvents().find((event) => event.id === selection.id)
      const eventRow = active ?? recent
      if (!eventRow) {
        return {
          selectionType: 'event',
          selectionId: selection.id,
          title: `Event ${selection.id}`,
          lines: ['Event not found in active/recent buffers.'],
          payloadPreview: '',
        }
      }
      return {
        selectionType: 'event',
        selectionId: selection.id,
        title: `Event ${eventRow.type} [${eventRow.id}]`,
        lines: [
          `position=(${eventRow.x}, ${eventRow.y})`,
          active
            ? `remainingTicks=${Math.max(0, active.durationTicks - active.elapsedTicks)}`
            : `tick=${recent?.tick ?? this.worldState.tick}`,
        ],
        payloadPreview: compactJson(eventRow),
      }
    }

    if (selection.type === 'note') {
      const note = this.civSystem.getNoteById(selection.id)
      if (!note) {
        return {
          selectionType: 'note',
          selectionId: selection.id,
          title: `Note ${selection.id}`,
          lines: ['Note not found.'],
          payloadPreview: '',
        }
      }
      return {
        selectionType: 'note',
        selectionId: selection.id,
        title: `Note ${note.id}`,
        lines: [
          `faction=${note.factionId} author=${note.authorId} tick=${note.createdAtTick}`,
          `position=(${note.x}, ${note.y})`,
          note.translatedContent ? `translated=${note.translatedContent}` : 'translated=not available',
        ],
        payloadPreview: compactJson(note),
      }
    }

    if (selection.type === 'era') {
      return {
        selectionType: 'era',
        selectionId: selection.id,
        title: `Era ${selection.id}`,
        lines: ['Use AI tools getEra/listEras for detailed aggregates in this period.'],
        payloadPreview: '',
      }
    }

    return {
      selectionType: selection.type,
      selectionId: selection.id,
      title: `${selection.type} ${selection.id}`,
      lines: ['No dedicated inspector for this selection type.'],
      payloadPreview: '',
    }
  }

  private buildAiChatSummary(): AiChatSummary {
    return {
      provider: this.aiChatProvider,
      busy: this.aiChatBusy,
      followSelection: this.aiChatFollowSelection,
      explainMode: this.aiChatExplainMode,
      maxMessages: this.aiChatMaxMessages,
      quickPrompts: [...this.aiChatQuickPrompts],
      messages: this.aiChatMessages.map((message) => ({
        ...message,
        references: message.references.map((ref) => ({ ...ref })),
        suggestedQuestions: [...message.suggestedQuestions],
      })),
      contextInspector: this.buildAiContextInspector(),
    }
  }

  private async submitAiChatMessage(text: string): Promise<void> {
    const question = text.trim()
    if (!question) {
      return
    }
    if (this.aiChatBusy) {
      this.pushAiChatMessage('system', 'Una richiesta AI e gia in corso. Attendi la risposta corrente.')
      this.updateOverlayNow()
      return
    }

    this.pushAiChatMessage('user', question)
    const pendingId = this.pushAiChatMessage('assistant', 'Analisi in corso...', { pending: true })
    this.aiChatBusy = true
    this.updateOverlayNow()

    if (!this.latestSnapshot) {
      this.updateOverlayNow()
    }
    const snapshot = this.latestSnapshot
    if (!snapshot) {
      this.resolveAiPendingMessage(pendingId, {
        content: 'Snapshot non disponibile: riprova dopo qualche tick.',
        error: 'snapshot_unavailable',
      })
      this.aiChatBusy = false
      this.updateOverlayNow()
      return
    }

    const basePack = this.worldKnowledgePack.buildBasePack(snapshot)

    try {
      const result = await this.aiChatService.ask({
        question,
        mode: this.aiChatExplainMode ? 'explain' : 'default',
        history: this.buildAiHistoryForService(),
        worldPackText: basePack.text,
        worldPackHash: basePack.summary.hash,
        followSelection: this.aiChatFollowSelection,
        selection: this.aiChatFollowSelection ? this.buildAiSelectionContext() : null,
      })

      this.resolveAiPendingMessage(pendingId, {
        content: result.answer,
        references: result.references,
        suggestedQuestions: result.suggested_questions,
      })
    } catch (error) {
      this.resolveAiPendingMessage(pendingId, {
        content: 'Il modello locale non ha risposto correttamente. Controlla provider/baseUrl e riprova.',
        error: error instanceof Error ? error.message : 'ai_request_failed',
      })
    } finally {
      this.aiChatBusy = false
      this.updateOverlayNow()
    }
  }

  private jumpToReference(referenceType: string, id: string): void {
    const type = normalizeReferenceType(referenceType)
    const entityId = id.trim()
    if (!entityId) {
      return
    }

    if (type === 'species') {
      this.selectedCivSpeciesId = entityId
      this.selectionManager.selectSpecies(entityId, entityId)
      const creature = this.creatureSystem.getCreatures().find((row) => row.speciesId === entityId)
      if (creature) {
        this.focusCameraOnTileWithHighlight(creature.x, creature.y)
      }
      this.overlay?.openTab('species')
      this.updateOverlayNow()
      return
    }

    if (type === 'creature') {
      const creature = this.creatureSystem.getCreatures().find((row) => row.id === entityId)
      if (creature) {
        this.selectionManager.selectCreature(entityId, creature.name)
        this.focusCameraOnTileWithHighlight(creature.x, creature.y)
        this.overlay?.openTab('species')
        this.updateOverlayNow()
        return
      }

      const agent = this.civSystem.getAgentById(entityId)
      if (agent) {
        this.selectedCivAgentId = agent.id
        this.selectedCivFactionId = agent.factionId
        this.selectedCivSpeciesId = null
        this.selectedNoteId = null
        this.selectionManager.selectCreature(agent.id, agent.name)
        this.focusCameraOnTileWithHighlight(agent.x, agent.y)
        this.requestAgentNarrativeBio(agent.id)
        this.overlay?.openTab('individuals')
        this.updateOverlayNow()
      }
      return
    }

    if (type === 'civilization') {
      const faction = this.civSystem.getFactionById(entityId)
      if (!faction) {
        return
      }
      this.selectedCivFactionId = faction.id
      this.selectedCivAgentId = null
      this.selectedCivSpeciesId = null
      this.selectedNoteId = null
      this.selectionManager.selectCivilization(entityId, faction.name ?? entityId)
      this.focusCameraOnTileWithHighlight(faction.homeCenterX, faction.homeCenterY)
      this.overlay?.openTab('civilizations')
      this.updateOverlayNow()
      return
    }

    if (type === 'event') {
      const active = this.eventSystem.getActiveEvents().find((event) => event.id === entityId)
      const recent = this.eventSystem.getRecentEvents().find((event) => event.id === entityId)
      const row = active ?? recent
      if (!row) {
        return
      }
      this.selectionManager.selectEvent(entityId, row.type)
      this.focusCameraOnTileWithHighlight(row.x, row.y)
      this.overlay?.openTab('events')
      this.updateOverlayNow()
      return
    }

    if (type === 'era') {
      this.selectionManager.setSelection({ type: 'era', id: entityId, label: entityId })
      this.overlay?.openTab('logs')
      this.updateOverlayNow()
      return
    }

    if (type === 'note') {
      const note = this.civSystem.getNoteById(entityId)
      if (!note) {
        return
      }
      this.selectedNoteId = note.id
      this.selectedCivFactionId = note.factionId
      this.selectedCivAgentId = null
      this.selectedCivSpeciesId = null
      this.selectionManager.selectNote(note.id, note.id)
      this.focusCameraOnTileWithHighlight(note.x, note.y)
      this.overlay?.openTab('civilizations')
      this.updateOverlayNow()
    }
  }

  private updateOverlayNow(): void {
    if (!this.overlay) {
      return
    }

    let selectedAgent: AgentInspectorData | null = null
    if (this.selectedCivAgentId) {
      selectedAgent = this.civSystem.getAgentInspectorData(this.selectedCivAgentId)
      if (selectedAgent) {
        selectedAgent.narrativeBio = this.civAgentBioCache.get(this.selectedCivAgentId)
      } else {
        this.selectedCivAgentId = null
      }
    }

    let selectedFactionId = this.selectedCivFactionId
    if (selectedAgent?.factionId) {
      selectedFactionId = selectedAgent.factionId
    }
    if (selectedFactionId && !this.civSystem.getFactionById(selectedFactionId)) {
      selectedFactionId = null
    }
    this.selectedCivFactionId = selectedFactionId

    const snapshot = this.snapshotBuilder.build({
      tick: this.worldState.tick,
      fps: this.fps > 0 ? this.fps : null,
      speed: this.speedMultiplier * this.simTuning.simulationSpeed,
      paused: this.paused,
      seed: this.seed,
      world: this.worldState,
      speciesStats: this.creatureSystem.getSpeciesStats(),
      activeEvents: this.eventSystem.getActiveEvents(),
      recentEvents: this.eventSystem.getRecentEvents(),
      logs: this.simLog.getEntries(1200),
      civFactions: this.civSystem.getFactionSummaries(),
      civTimeline: this.civSystem.getTimeline(320),
      civDialogues: this.civSystem.getDialogues(140),
      civMetrics: this.civSystem.getMetrics(320),
      civMembers: this.civSystem.getFactionMembers(null, 1200),
      civTerritories: this.civSystem.getTerritorySummary(3, 4800),
      civNotes: this.civSystem.getNotes(320),
      civRelations: this.civSystem.getRelationSummaries(),
      civRelationSeries: this.civSystem.getRelationSeries(220),
      civEthnicities: this.civSystem.getEthnicitySummaries(),
      civReligions: this.civSystem.getReligionSummaries(),
      selectedFactionId,
      selectedSpeciesId: this.selectedCivSpeciesId,
      civItems: this.civSystem.getItemsSnapshot(this.worldState.tick, selectedFactionId),
      selectedAgent,
      aiChat: this.buildAiChatSummary(),
      worldGenesis: this.worldGenesisSummary,
      overlayToggles: this.getOverlayToggleState(),
      tuning: this.simTuning,
    })

    this.latestSnapshot = snapshot
    this.overlay.setSnapshot(snapshot)
  }

  private getOverlayToggleState(): {
    temperature: boolean
    humidity: boolean
    fertility: boolean
    hazard: boolean
    biomes: boolean
  } {
    return {
      temperature: this.overlayMode === 'temperature',
      humidity: this.overlayMode === 'humidity',
      fertility: this.overlayMode === 'fertility',
      hazard: this.overlayMode === 'hazard',
      biomes: this.biomeOverlayEnabled,
    }
  }

  private applyOverlayToggle(type: OverlayToggleType, enabled: boolean): void {
    if (type === 'biomes') {
      this.biomeOverlayEnabled = enabled
      this.terrainRenderer?.setTerrainVisible(enabled)
      this.renderFrameLayers()
      this.updateOverlayNow()
      return
    }

    const modeByType: Record<Exclude<OverlayToggleType, 'biomes'>, HeatmapMode> = {
      temperature: 'temperature',
      humidity: 'humidity',
      fertility: 'fertility',
      hazard: 'hazard',
    }
    const mappedMode = modeByType[type as Exclude<OverlayToggleType, 'biomes'>]
    if (!mappedMode) {
      return
    }

    if (enabled) {
      this.setOverlayMode(mappedMode)
      return
    }

    if (this.overlayMode === mappedMode) {
      this.setOverlayMode('none')
    } else {
      this.updateOverlayNow()
    }
  }

  private applyTuningParam(name: string, value: number): void {
    if (!Number.isFinite(value)) {
      return
    }

    const next = { ...this.simTuning }
    if (name in next) {
      ;(next as Record<string, number>)[name] = value
      this.simTuning = next
      this.creatureSystem.setTuning({
        baseMetabolism: this.simTuning.baseMetabolism,
        reproductionThreshold: this.simTuning.reproductionThreshold,
        reproductionCost: this.simTuning.reproductionCost,
        mutationRate: this.simTuning.mutationRate,
      })
      this.eventSystem.setEventRateMultiplier(this.simTuning.eventRate)
      if (name === 'simulationSpeed') {
        this.simAccumulatorMs = 0
      }
      this.updateOverlayNow()
    }
  }

  private setOverlayMode(mode: HeatmapMode): void {
    this.overlayMode = mode
    this.terrainRenderer?.setHeatmapMode(mode)
    this.renderFrameLayers()
    this.updateOverlayNow()
  }

  private toggleEventsOverlay(): void {
    this.eventsOverlayEnabled = !this.eventsOverlayEnabled
    this.terrainRenderer?.setEventsOverlayEnabled(this.eventsOverlayEnabled)
    this.renderFrameLayers()
    this.updateOverlayNow()
  }

  private toggleTerritoryOverlay(): void {
    this.territoryOverlayEnabled = !this.territoryOverlayEnabled
    if (!this.territoryOverlayEnabled) {
      this.civTerritoryGraphics.clear()
      this.civRelationsGraphics.clear()
      this.civNotesGraphics.clear()
    } else {
      this.lastTerritoryVersion = -1
    }
    this.renderFrameLayers()
    this.updateOverlayNow()
  }

  private togglePause(): void {
    this.paused = !this.paused
    this.updateOverlayNow()
  }

  private setSpeed(speed: number): void {
    this.speedMultiplier = clampSpeed(speed)
    this.updateOverlayNow()
  }

  private stepSpeed(direction: -1 | 1): void {
    let nearest = 0
    let nearestDelta = Number.POSITIVE_INFINITY
    for (let i = 0; i < SPEED_STEPS.length; i++) {
      const delta = Math.abs(SPEED_STEPS[i]! - this.speedMultiplier)
      if (delta < nearestDelta) {
        nearestDelta = delta
        nearest = i
      }
    }

    const nextIndex = clampInt(nearest + direction, 0, SPEED_STEPS.length - 1)
    this.setSpeed(SPEED_STEPS[nextIndex] ?? this.speedMultiplier)
  }

  private focusCameraOnTile(tileX: number, tileY: number): void {
    const worldX = (tileX + 0.5) * this.tileSize
    const worldY = (tileY + 0.5) * this.tileSize
    const x = this.app.screen.width * 0.5 - worldX * this.camera.zoom
    const y = this.app.screen.height * 0.5 - worldY * this.camera.zoom
    this.camera.setPosition(x, y)
    this.camera.applyTo(this.worldContainer)
    this.renderFrameLayers()
  }

  private triggerJumpHighlight(tileX: number, tileY: number, durationMs = 1800): void {
    this.jumpHighlightTileX = Math.floor(tileX)
    this.jumpHighlightTileY = Math.floor(tileY)
    this.jumpHighlightEndMs = Date.now() + Math.max(400, durationMs)
  }

  private focusCameraOnTileWithHighlight(tileX: number, tileY: number): void {
    this.focusCameraOnTile(tileX, tileY)
    this.triggerJumpHighlight(tileX, tileY)
  }

  private isInsideCanvas(clientX: number, clientY: number): boolean {
    const rect = this.app.canvas.getBoundingClientRect()
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    )
  }

  private createAgentPopup(): void {
    if (this.agentPopup) {
      return
    }
    const host = this.app.canvas.parentElement ?? document.body
    const panel = document.createElement('div')
    panel.className = 'bi-agent-popup'
    host.appendChild(panel)
    this.agentPopup = panel
  }

  private destroyAgentPopup(): void {
    this.agentPopup?.remove()
    this.agentPopup = null
  }

  private hideAgentPopup(): void {
    if (!this.agentPopup) {
      return
    }
    this.agentPopup.style.display = 'none'
  }

  private updateAgentPopupForSelected(clientX: number, clientY: number): void {
    if (!this.selectedCivAgentId) {
      this.hideAgentPopup()
      return
    }

    const data = this.civSystem.getAgentInspectorData(this.selectedCivAgentId)
    if (!data || !this.agentPopup) {
      this.hideAgentPopup()
      return
    }

    const bio = this.civAgentBioCache.get(this.selectedCivAgentId)
    const carryLine = `carry: ${data.currentCarryWeight.toFixed(2)} / ${data.maxCarryWeight.toFixed(2)}`
    const eq = data.equipmentSlots
    const inventoryLine = data.inventoryRows
      .slice(0, 6)
      .map((row) => `${row.itemName}x${row.quantity}`)
      .join(' ')
    const text = [
      `${data.name} (${data.role})`,
      `fazione: ${data.factionName}`,
      `goal: ${data.goal} | state: ${data.activityState}`,
      `energia: ${data.energy.toFixed(1)}  eta: ${data.age.toFixed(1)}`,
      `idratazione: ${data.hydration.toFixed(1)}  vitalita: ${(data.vitality * 100).toFixed(0)}%`,
      `fame: ${(data.hunger * 100).toFixed(0)}%  bisogno acqua: ${(data.waterNeed * 100).toFixed(0)}%  stress pericolo: ${(data.hazardStress * 100).toFixed(0)}%`,
      `pensiero: ${data.currentThought || '-'}`,
      `motivazioni: ${data.mentalState.lastReasonCodes.join(', ') || '-'}`,
      `sensori: food=${(data.mentalState.perceivedFoodLevel * 100).toFixed(0)}% threat=${(data.mentalState.perceivedThreatLevel * 100).toFixed(0)}% stress=${(data.mentalState.stressLevel * 100).toFixed(0)}% loyalty=${(data.mentalState.loyaltyToFaction * 100).toFixed(0)}%`,
      `pos: (${data.x}, ${data.y})`,
      `inv: f=${data.inventory.food.toFixed(1)} w=${data.inventory.wood.toFixed(1)} s=${data.inventory.stone.toFixed(1)} o=${data.inventory.ore.toFixed(1)}`,
      `items: ${inventoryLine || '-'} | ${carryLine}`,
      `equip: main=${eq.mainHand ?? '-'} off=${eq.offHand ?? '-'} body=${eq.body ?? '-'} util=${eq.utility ?? '-'}`,
      `utter: ${data.lastUtteranceTokens.join(' ') || '-'}`,
      `gloss: ${data.lastUtteranceGloss ?? '-'}`,
      `thought gloss: ${data.thoughtGloss ?? '-'}`,
      '',
      bio ? bio.slice(0, 220) : 'bio: loading...',
    ].join('\n')

    this.agentPopup.textContent = text
    this.agentPopup.style.display = 'block'

    const popupWidth = 320
    const popupHeight = 320
    const margin = 12
    const x = Math.max(margin, Math.min(window.innerWidth - popupWidth - margin, clientX + 14))
    const y = Math.max(margin, Math.min(window.innerHeight - popupHeight - margin, clientY + 14))
    this.agentPopup.style.left = `${x}px`
    this.agentPopup.style.top = `${y}px`
  }
}
