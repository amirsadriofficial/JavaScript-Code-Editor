import { isCodeOffset } from '../document'
import { JS_KEYWORDS } from '../highlight/keywords'
import { BUILTIN_GLOBALS, BUILTIN_MEMBERS } from './builtins'
import { prefixScore, rankSuggestions } from './rank'
import type { AnalyzedDocument } from '../document'
import type { Suggestion, SuggestionKind, SuggestionSession } from '../types'

const WORD_CHAR = /[A-Za-z0-9_$]/
const DEFAULT_LIMIT = 8

const RECENT_BOOST = 400
const LOCAL_BOOST = 250
const BUILTIN_BOOST = 60

export type CompletionContext = {
  /** Text the caret has typed since the last `.`, e.g. `ma` in `arr.ma`. */
  word: string
  wordStart: number
  /** Full dotted path, e.g. `arr.ma`. Equals `word` when there is no dot. */
  path: string
  pathStart: number
  /** True when a `.` precedes the word, so only members make sense. */
  hasQualifier: boolean
}

export function readContext(text: string, cursor: number): CompletionContext {
  let wordStart = cursor
  while (wordStart > 0 && WORD_CHAR.test(text[wordStart - 1]!)) {
    wordStart -= 1
  }

  let pathStart = wordStart
  while (
    pathStart > 1 &&
    text[pathStart - 1] === '.' &&
    WORD_CHAR.test(text[pathStart - 2]!)
  ) {
    pathStart -= 1
    while (pathStart > 0 && WORD_CHAR.test(text[pathStart - 1]!)) {
      pathStart -= 1
    }
  }

  return {
    word: text.slice(wordStart, cursor),
    wordStart,
    path: text.slice(pathStart, cursor),
    pathStart,
    hasQualifier: pathStart < wordStart,
  }
}

export type SuggestOptions = {
  /** Labels accepted recently, most recent first. */
  recent?: string[]
  limit?: number
}

export function buildSuggestions(
  doc: AnalyzedDocument,
  cursor: number,
  options: SuggestOptions = {},
): SuggestionSession | null {
  if (cursor < 0 || cursor > doc.text.length) return null
  if (!isCodeOffset(doc, cursor)) return null

  const context = readContext(doc.text, cursor)
  if (context.word.length === 0) return null

  const recent = options.recent ?? []
  const recentBoost = (label: string) => {
    const index = recent.indexOf(label)
    return index === -1 ? 0 : RECENT_BOOST - index
  }

  const candidates: Suggestion[] = []

  const offer = (
    label: string,
    kind: SuggestionKind,
    typed: string,
    replaceStart: number,
    bonus: number,
  ) => {
    const base = prefixScore(label, typed)
    if (base === null) return
    candidates.push({
      label,
      insertText: label,
      kind,
      score: base + bonus + recentBoost(label),
      replaceStart,
    })
  }

  // Namespaced globals match against the whole path: `Math.ra` -> `Math.random`.
  for (const label of BUILTIN_GLOBALS) {
    offer(label, 'builtin', context.path, context.pathStart, BUILTIN_BOOST)
  }

  if (context.hasQualifier) {
    // After a dot only members are meaningful — `arr.ma` must not offer `Math`.
    for (const label of BUILTIN_MEMBERS) {
      offer(label, 'builtin', context.word, context.wordStart, BUILTIN_BOOST)
    }
  } else {
    for (const label of JS_KEYWORDS) {
      offer(label, 'keyword', context.word, context.wordStart, 0)
    }

    for (const symbol of doc.identifiers) {
      // Skip bindings whose block has already closed, and the declaration
      // the caret is sitting inside right now.
      if (cursor > symbol.scopeEnd) continue
      if (symbol.offset === context.wordStart) continue

      const proximity = symbol.offset <= cursor ? 40 : 0
      offer(
        symbol.name,
        symbol.kind,
        context.word,
        context.wordStart,
        LOCAL_BOOST + proximity,
      )
    }
  }

  const ranked = dedupe(rankSuggestions(candidates)).slice(
    0,
    options.limit ?? DEFAULT_LIMIT,
  )
  if (ranked.length === 0) return null

  return { candidates: ranked, index: 0, replaceEnd: cursor }
}

function dedupe(items: Suggestion[]): Suggestion[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.replaceStart}:${item.insertText}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function activeSuggestion(
  session: SuggestionSession | null,
): Suggestion | null {
  if (!session) return null
  return session.candidates[session.index] ?? null
}

/**
 * The characters the ghost layer draws after the caret. The engine guarantees
 * every candidate extends the typed text, so this is always a pure suffix.
 */
export function ghostSuffix(session: SuggestionSession | null): string {
  const suggestion = activeSuggestion(session)
  if (!suggestion || !session) return ''
  return suggestion.insertText.slice(session.replaceEnd - suggestion.replaceStart)
}

export function cycleSuggestion(
  session: SuggestionSession,
  delta: number,
): SuggestionSession {
  const count = session.candidates.length
  if (count === 0) return session
  const index = (((session.index + delta) % count) + count) % count
  return { ...session, index }
}
