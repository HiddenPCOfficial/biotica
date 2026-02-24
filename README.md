# Biotica

Simulatore evolutivo in TypeScript + PixiJS con architettura AI separata in due agenti:

- `LLM Agent` per testo UI (chat Q&A e descrizioni on-demand)
- `Gene Agent` deterministico (Mini NSGA-II) per world genesis/tuning numerico

## Requisiti

- Node.js `20+`
- npm
- Ollama locale installato

## Setup rapido

```sh
npm install
ollama serve
ollama pull ministral-3
npm run dev
```

Apri l'app su `http://localhost:5173`.

## Configurazione `.env`

Il progetto usa questo split (già presente in `.env`):

```env
# LLM AGENT (SOLO CHAT + DESCRIZIONI)
VITE_AI_PROVIDER=ollama
VITE_AI_BASE_URL=/ollama
VITE_AI_MODEL=ministral-3
VITE_AI_CHAT_MODEL=ministral-3
VITE_AI_CREATURE_DESCRIPTION_MODEL=ministral-3
VITE_AI_NARRATIVE_MODEL=ministral-3
VITE_AI_TIMEOUT_MS=30000
VITE_AI_MIN_INTERVAL_MS=250
VITE_AI_STREAMING=false
VITE_AI_CACHE_TTL_MS=300000
VITE_AI_CACHE_MAX_ENTRIES=512

# GENE AGENT (Mini NSGA-II) - NON LLM
VITE_GENE_AGENT_ENABLED=true
VITE_GENE_AGENT_POPULATION=16
VITE_GENE_AGENT_GENERATIONS=4
VITE_GENE_AGENT_SIM_TICKS=5000
VITE_GENE_AGENT_VALIDATION_SEEDS=2
VITE_GENE_AGENT_MUTATION_RATE=0.15
VITE_GENE_AGENT_CROSSOVER_RATE=0.7
VITE_GENE_OBJ_SURVIVAL=1.0
VITE_GENE_OBJ_BIODIVERSITY=0.8
VITE_GENE_OBJ_STABILITY=1.2
VITE_GENE_OBJ_RESOURCE_BALANCE=1.0
VITE_GENE_OBJ_CATASTROPHE_TOLERANCE=0.6
```

## Architettura AI

### 1) LLM Agent (read-only testo)

Path principali:

- `src/ai/core/`
- `src/ai/llm/`

Responsabilità:

- Chat sul mondo (`AI Chat` tab)
- Descrizioni creature/specie/civiltà on-demand
- Caching + rate limiting + streaming opzionale

Vincoli:

- Non modifica la simulazione
- Non è nel tick loop

### 2) Gene Agent (Mini NSGA-II, non LLM)

Path principali:

- `src/ai/gene/GeneAgentConfig.ts`
- `src/ai/gene/EvoTunerAgent.ts`
- `src/ai/gene/HeadlessSimulator.ts`
- `src/ai/gene/EcoObjectives.ts`
- `src/ai/gene/WorldGenesisAgent.ts`

Responsabilità:

- Tuning deterministico dei parametri world genesis
- Valutazione multi-obiettivo su simulazioni headless
- Report explainable con score/reason codes

Vincoli:

- Nessun provider LLM
- Nessuna env `VITE_AI_*`
- Determinismo via `SeededRng` (no `Math.random`)

## Integrazione runtime

Sequenza reset/new world:

1. `WorldGenesisAgent.generate(seed)`
2. `applyBestConfig(...)` su `WorldState`
3. avvio simulazione

LLM creato separatamente per UI:

- chat
- inspector descrizioni

## Scripts

```sh
npm run dev
npm run type-check
npm run build-only
npm run build
```

## Troubleshooting

### `ollama http 404: 404 page not found`

Causa tipica: proxy senza rewrite. Il progetto usa già:

- `vite.config.ts` con proxy `/ollama` -> `http://127.0.0.1:11434`
- `rewrite: (path) => path.replace(/^\\/ollama/, '')`

Dopo modifiche a `vite.config.ts`, riavvia sempre `npm run dev`.

### `Failed to fetch`

- Verifica che Ollama sia attivo: `ollama serve`
- Verifica modello installato: `ollama list`
- Test rapido: `curl http://127.0.0.1:11434/api/tags`

### In produzione (build/preview)

Il path `/ollama` è proxy dev Vite. In deploy statico imposta:

```env
VITE_AI_BASE_URL=http://127.0.0.1:11434
```

oppure usa un reverse proxy server-side equivalente.
