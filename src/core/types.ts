/** Half-open offset range into the buffer. Also used for the caret (start === end). */
export type TextRange = {
  start: number
  end: number
}

export type ScrollPos = {
  top: number
  left: number
}

export type TokenKind =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'identifier'
  | 'punctuation'
  | 'plain'

export type Token = {
  kind: TokenKind
  value: string
  start: number
  end: number
}

export type SuggestionKind = 'keyword' | 'builtin' | 'variable' | 'function'

export type Suggestion = {
  label: string
  insertText: string
  kind: SuggestionKind
  score: number
  /**
   * Absolute offset where `insertText` starts replacing the buffer.
   * Differs per candidate: `Math.random` replaces from before the dot,
   * `random` replaces from after it.
   */
  replaceStart: number
}

export type SuggestionSession = {
  candidates: Suggestion[]
  index: number
  /** Caret offset; the replaced range is [candidate.replaceStart, replaceEnd). */
  replaceEnd: number
}

export type EditorSnapshot = {
  value: string
  selection: TextRange
}

/** Where a change came from. Drives undo coalescing. */
export type ChangeOrigin =
  | 'input'
  | 'paste'
  | 'cut'
  | 'accept'
  | 'autoclose'
  | 'indent'
  | 'undo'
  | 'redo'
