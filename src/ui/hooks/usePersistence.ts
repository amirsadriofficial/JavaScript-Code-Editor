import { useEffect } from 'react'
import {
  savePersisted,
  type HistoryStack,
  type ScrollPos,
  type TextRange,
  type Theme,
} from '../../core'

const SAVE_DELAY_MS = 600

export type PersistenceInputs = {
  value: string
  selection: TextRange
  scroll: ScrollPos
  theme: Theme
  recent: string[]
  history: HistoryStack
}

/**
 * Writes the session to localStorage once the user pauses.
 *
 * Snapshotting the history and serialising the buffer both cost real time, so
 * they happen inside the timeout rather than on the keystroke path.
 */
export function usePersistence({
  value,
  selection,
  scroll,
  theme,
  recent,
  history,
}: PersistenceInputs): void {
  useEffect(() => {
    const id = window.setTimeout(() => {
      savePersisted({
        value,
        selection,
        scroll,
        theme,
        recent,
        history: history.serialize(),
      })
    }, SAVE_DELAY_MS)

    return () => window.clearTimeout(id)
  }, [value, selection, scroll, theme, recent, history])
}
