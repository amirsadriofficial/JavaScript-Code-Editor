import type { HistoryData } from './history/stack'
import type { ScrollPos, TextRange } from './types'

const STORAGE_KEY = 'js-code-editor:v2'
/** Snapshots are whole buffers, so the stored history has to stay small. */
const MAX_STORED_SNAPSHOTS = 20

export type Theme = 'dark' | 'light'

export type PersistedState = {
  value: string
  selection: TextRange
  scroll: ScrollPos
  theme: Theme
  history: HistoryData
  recent: string[]
}

export function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function savePersisted(state: PersistedState): void {
  const trimmed: PersistedState = {
    ...state,
    history: {
      undo: state.history.undo.slice(-MAX_STORED_SNAPSHOTS),
      redo: state.history.redo.slice(-MAX_STORED_SNAPSHOTS),
    },
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Over quota: keep the text, drop the history rather than losing both.
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...trimmed, history: { undo: [], redo: [] } }),
      )
    } catch {
      // Storage unavailable (private mode, disabled). Editing still works.
    }
  }
}

function isValid(state: Partial<PersistedState>): state is PersistedState {
  return (
    typeof state.value === 'string' &&
    typeof state.selection?.start === 'number' &&
    typeof state.selection?.end === 'number' &&
    Array.isArray(state.history?.undo) &&
    Array.isArray(state.history?.redo) &&
    Array.isArray(state.recent)
  )
}
