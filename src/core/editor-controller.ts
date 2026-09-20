import { update, type EditorOutcome } from './actions'
import { handleEditorKey } from './edit/keys'
import { HistoryStack } from './history/stack'
import {
  textOf,
  withRecent,
  withSelection,
  withText,
  type EditorModel,
} from './model'
import { activeSuggestion, cycleSuggestion, ghostSuffix } from './suggestions/engine'
import type { PrimitiveChange, PrimitiveKeyEvent } from './primitive/types'
import type { ChangeOrigin, TextRange } from './types'

/** Only a continuous run of plain typing collapses into one undo step. */
const COALESCING_ORIGINS = new Set<ChangeOrigin>(['input'])

/**
 * Owns undo history and turns events into new models. Holds no DOM
 * references, so it is unaffected by swapping the editing primitive.
 */
export class EditorController {
  readonly history: HistoryStack

  constructor(history = new HistoryStack()) {
    this.history = history
  }

  /**
   * A core-initiated edit: records history, then produces the new model.
   *
   * These are all structural, so each gets its own undo step. The one origin
   * worth merging into a run is plain typing, which arrives via `applyChange`.
   */
  commit(
    model: EditorModel,
    text: string,
    selection: TextRange,
    origin: ChangeOrigin,
  ): EditorOutcome {
    this.history.recordBefore(snapshot(model), {
      coalesce: COALESCING_ORIGINS.has(origin),
    })
    return update(withText(model, text, selection), true)
  }

  /** An edit the primitive already applied to itself. */
  applyChange(model: EditorModel, change: PrimitiveChange): EditorOutcome {
    this.history.recordBefore(snapshot(model), {
      coalesce: COALESCING_ORIGINS.has(change.origin),
    })
    return update(withText(model, change.value, change.selection))
  }

  /** Caret movement only — never touches history. */
  moveSelection(model: EditorModel, selection: TextRange): EditorOutcome {
    const next = withSelection(model, selection)
    if (next === model) return { type: 'handled' }
    this.history.breakRun()
    return update(next)
  }

  acceptSuggestion(model: EditorModel): EditorOutcome {
    const session = model.suggestions
    const suggestion = activeSuggestion(session)
    if (!session || !suggestion) return null

    const text = textOf(model)
    const next =
      text.slice(0, suggestion.replaceStart) +
      suggestion.insertText +
      text.slice(session.replaceEnd)
    const cursor = suggestion.replaceStart + suggestion.insertText.length

    this.history.recordBefore(snapshot(model))
    const accepted = withText(
      withRecent(model, suggestion.label),
      next,
      { start: cursor, end: cursor },
    )

    // Accepting is a completed thought; don't immediately re-suggest.
    return update({ ...accepted, suggestions: null }, true)
  }

  dismissSuggestion(model: EditorModel): EditorModel {
    return model.suggestions ? { ...model, suggestions: null } : model
  }

  cycle(model: EditorModel, delta: number): EditorModel {
    if (!model.suggestions) return model
    return { ...model, suggestions: cycleSuggestion(model.suggestions, delta) }
  }

  undo(model: EditorModel): EditorOutcome {
    const previous = this.history.undo(snapshot(model))
    if (!previous) return null
    return restore(model, previous)
  }

  redo(model: EditorModel): EditorOutcome {
    const next = this.history.redo(snapshot(model))
    if (!next) return null
    return restore(model, next)
  }

  handleKey(model: EditorModel, event: PrimitiveKeyEvent): EditorOutcome {
    return handleEditorKey(this, model, event)
  }

  ghostText(model: EditorModel): string {
    return ghostSuffix(model.suggestions)
  }
}

function snapshot(model: EditorModel) {
  return { value: textOf(model), selection: model.selection }
}

function restore(
  model: EditorModel,
  { value, selection }: { value: string; selection: TextRange },
): EditorOutcome {
  const restored = withText(model, value, selection)
  return update({ ...restored, suggestions: null }, true)
}
