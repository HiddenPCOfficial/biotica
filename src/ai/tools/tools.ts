export type AiToolName =
  | 'getWorldSummary'
  | 'getTopSpecies'
  | 'getSpecies'
  | 'getSpeciesLineage'
  | 'getCreature'
  | 'searchCreatures'
  | 'getCiv'
  | 'listCivs'
  | 'getTerritory'
  | 'listActiveEvents'
  | 'getEvent'
  | 'listEras'
  | 'getEra'
  | 'queryRegion'
  | 'getRecentLogs'

export type AiToolDefinition = {
  name: AiToolName
  description: string
  inputSchema: Record<string, unknown>
}

export const AI_TOOL_DEFINITIONS: readonly AiToolDefinition[] = [
  {
    name: 'getWorldSummary',
    description: 'Ritorna stato sintetico del mondo corrente.',
    inputSchema: {},
  },
  {
    name: 'getTopSpecies',
    description: 'Ritorna specie ordinate per popolazione.',
    inputSchema: {
      page: 'number optional (default 0)',
      size: 'number optional (default 10)',
      limit: 'alias di size',
    },
  },
  {
    name: 'getSpecies',
    description: 'Dettagli completi di una specie.',
    inputSchema: { speciesId: 'string required' },
  },
  {
    name: 'getSpeciesLineage',
    description: 'Lineage della specie selezionata.',
    inputSchema: { speciesId: 'string required' },
  },
  {
    name: 'getCreature',
    description: 'Dettagli completi della creatura.',
    inputSchema: { creatureId: 'string required' },
  },
  {
    name: 'searchCreatures',
    description: 'Cerca creature per id, nome, specie o testo libero.',
    inputSchema: { query: 'string required', limit: 'number optional (default 20)' },
  },
  {
    name: 'getCiv',
    description: 'Dettagli di una civiltà/fazione.',
    inputSchema: { civId: 'string required' },
  },
  {
    name: 'listCivs',
    description: 'Lista civiltà attive.',
    inputSchema: { limit: 'number optional (default 10)' },
  },
  {
    name: 'getTerritory',
    description: 'Dati territorio di una civiltà.',
    inputSchema: { civId: 'string required' },
  },
  {
    name: 'listActiveEvents',
    description: 'Eventi ambientali attivi/recenti.',
    inputSchema: {},
  },
  {
    name: 'getEvent',
    description: 'Dettagli di un evento.',
    inputSchema: { eventId: 'string required' },
  },
  {
    name: 'listEras',
    description: 'Lista ere storiche inferite.',
    inputSchema: {},
  },
  {
    name: 'getEra',
    description: 'Dettaglio era storica inferita.',
    inputSchema: { eraId: 'string required' },
  },
  {
    name: 'queryRegion',
    description: 'Statistiche aggregate in rettangolo mappa.',
    inputSchema: { x0: 'number', y0: 'number', x1: 'number', y1: 'number' },
  },
  {
    name: 'getRecentLogs',
    description: 'Log recenti filtrabili per categoria/severità.',
    inputSchema: {
      category: 'string optional',
      severity: 'string optional',
      limit: 'number optional (default 40)',
      page: 'number optional (default 0)',
    },
  },
] as const
