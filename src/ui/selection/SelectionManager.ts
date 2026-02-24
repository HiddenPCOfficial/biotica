export type SelectionType =
  | 'species'
  | 'creature'
  | 'civilization'
  | 'event'
  | 'era'
  | 'note'
  | 'structure'
  | 'ethnicity'
  | 'religion'

export type SelectionRef = {
  type: SelectionType
  id: string
  label?: string
}

type SelectionListener = (selection: SelectionRef | null) => void

/**
 * Gestore selezione UI cross-panel.
 */
export class SelectionManager {
  private selection: SelectionRef | null = null
  private readonly listeners = new Set<SelectionListener>()

  getSelection(): SelectionRef | null {
    return this.selection ? { ...this.selection } : null
  }

  clear(): void {
    this.setSelection(null)
  }

  setSelection(selection: SelectionRef | null): void {
    const next = selection ? { ...selection } : null
    const prev = this.selection
    if (
      prev?.type === next?.type &&
      prev?.id === next?.id &&
      prev?.label === next?.label
    ) {
      return
    }
    this.selection = next
    for (const listener of this.listeners) {
      listener(this.selection ? { ...this.selection } : null)
    }
  }

  selectSpecies(id: string, label?: string): void {
    this.setSelection({ type: 'species', id, label })
  }

  selectCreature(id: string, label?: string): void {
    this.setSelection({ type: 'creature', id, label })
  }

  selectCivilization(id: string, label?: string): void {
    this.setSelection({ type: 'civilization', id, label })
  }

  selectEvent(id: string, label?: string): void {
    this.setSelection({ type: 'event', id, label })
  }

  selectNote(id: string, label?: string): void {
    this.setSelection({ type: 'note', id, label })
  }

  selectStructure(id: string, label?: string): void {
    this.setSelection({ type: 'structure', id, label })
  }

  onChange(listener: SelectionListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
