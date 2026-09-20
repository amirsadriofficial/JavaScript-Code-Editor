/**
 * Public surface of the editor core.
 *
 * Everything reachable from here is plain TypeScript with no DOM and no
 * framework dependency. The view layer imports from this module and nothing
 * deeper, which is what keeps the editing primitive replaceable without
 * touching application logic.
 */
export { EditorController } from './editor-controller'
export { HistoryStack } from './history/stack'
export { createModel, textOf } from './model'
export { lineIndexAt, visualColumn } from './document'
export { loadPersisted, savePersisted } from './persist'
export { SAMPLE_CODE } from './sample'

export type { AnalyzedDocument } from './document'
export type { EditorModel } from './model'
export type { EditorOutcome } from './actions'
export type { HistoryData } from './history/stack'
export type { LineScan, ScanState } from './highlight/scan'
export type { PersistedState, Theme } from './persist'
export type { SyntaxIssue } from './lint/obvious'
export type {
  PrimitiveChange,
  PrimitiveKeyEvent,
  TextPrimitiveProps,
} from './primitive/types'
export type {
  ChangeOrigin,
  ScrollPos,
  Suggestion,
  SuggestionSession,
  TextRange,
  Token,
} from './types'
