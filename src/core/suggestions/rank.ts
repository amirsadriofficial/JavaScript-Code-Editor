import type { Suggestion } from '../types'

/**
 * Ghost text can only ever *append* to what the caret has already typed, so a
 * candidate is only usable when it extends the typed text. Fuzzy and
 * substring matches are deliberately rejected: rendering them at the caret
 * would read as duplicated characters.
 */
export function prefixScore(label: string, typed: string): number | null {
  if (label.length <= typed.length) return null

  if (label.startsWith(typed)) {
    return 1000 - (label.length - typed.length)
  }

  if (label.toLowerCase().startsWith(typed.toLowerCase())) {
    return 700 - (label.length - typed.length)
  }

  return null
}

export function rankSuggestions(items: Suggestion[]): Suggestion[] {
  return [...items].sort(
    (a, b) =>
      b.score - a.score ||
      a.insertText.length - b.insertText.length ||
      a.label.localeCompare(b.label),
  )
}
