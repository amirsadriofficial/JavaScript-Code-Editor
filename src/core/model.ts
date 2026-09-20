import { analyze, type AnalyzedDocument } from './document'
import { buildSuggestions } from './suggestions/engine'
import type { SuggestionSession, TextRange } from './types'

const MAX_RECENT = 32

/**
 * The whole editable state. The analyzed document is part of the model so
 * text, tokens, diagnostics and completions can never drift apart.
 */
export type EditorModel = {
  doc: AnalyzedDocument
  selection: TextRange
  suggestions: SuggestionSession | null
  /** Accepted labels, most recent first. Feeds suggestion ranking. */
  recent: string[]
}

export function textOf(model: EditorModel): string {
  return model.doc.text
}

function completeAt(
  doc: AnalyzedDocument,
  selection: TextRange,
  recent: string[],
): SuggestionSession | null {
  if (selection.start !== selection.end) return null
  return buildSuggestions(doc, selection.start, { recent })
}

export function createModel(
  text: string,
  selection: TextRange = { start: 0, end: 0 },
  recent: string[] = [],
): EditorModel {
  const doc = analyze(text)
  const clamped = clampRange(selection, text.length)
  return {
    doc,
    selection: clamped,
    suggestions: completeAt(doc, clamped, recent),
    recent,
  }
}

/** New buffer contents — re-analyzes. */
export function withText(
  model: EditorModel,
  text: string,
  selection: TextRange,
): EditorModel {
  // Handing the old document back lets the analysis reuse every line the
  // edit did not touch.
  const doc =
    text === model.doc.text ? model.doc : analyze(text, model.doc)
  const clamped = clampRange(selection, text.length)
  return {
    ...model,
    doc,
    selection: clamped,
    suggestions: completeAt(doc, clamped, model.recent),
  }
}

/** Caret moved without editing — reuses the existing analysis. */
export function withSelection(
  model: EditorModel,
  selection: TextRange,
): EditorModel {
  const clamped = clampRange(selection, model.doc.text.length)
  if (
    clamped.start === model.selection.start &&
    clamped.end === model.selection.end
  ) {
    return model
  }
  return {
    ...model,
    selection: clamped,
    suggestions: completeAt(model.doc, clamped, model.recent),
  }
}

export function withRecent(model: EditorModel, label: string): EditorModel {
  return {
    ...model,
    recent: [label, ...model.recent.filter((r) => r !== label)].slice(
      0,
      MAX_RECENT,
    ),
  }
}

function clampRange(range: TextRange, length: number): TextRange {
  const start = Math.min(Math.max(range.start, 0), length)
  const end = Math.min(Math.max(range.end, start), length)
  return { start, end }
}
