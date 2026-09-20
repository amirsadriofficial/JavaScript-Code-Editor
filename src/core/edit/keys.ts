import { applyAutoclose, applyPairBackspace } from './autoclose'
import { applyBlockIndent, applyNewlineIndent } from './indent'
import { update, type EditorOutcome } from '../actions'
import { textOf, withText, type EditorModel } from '../model'
import type { EditorController } from '../editor-controller'
import type { PrimitiveKeyEvent } from '../primitive/types'

const INDENT_SIZE = 2

/**
 * Keyboard policy for the editor. Every branch either returns an outcome or
 * falls through to `null`, which hands the key back to the primitive.
 */
export function handleEditorKey(
  controller: EditorController,
  model: EditorModel,
  event: PrimitiveKeyEvent,
): EditorOutcome {
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()

  if (mod && key === 'z' && !event.shiftKey) {
    return controller.undo(model) ?? { type: 'handled' }
  }
  if ((mod && key === 'z' && event.shiftKey) || (mod && key === 'y')) {
    return controller.redo(model) ?? { type: 'handled' }
  }
  if (mod) return null

  if (event.key === 'Escape') {
    if (!model.suggestions) return null
    return update(controller.dismissSuggestion(model))
  }

  if (event.altKey) {
    const delta = cycleDelta(event)
    if (delta === 0 || !model.suggestions) return null
    return update(controller.cycle(model, delta))
  }

  if (event.key === 'Tab') return handleTab(controller, model, event.shiftKey)
  if (event.key === 'Enter' && !event.shiftKey) return handleEnter(controller, model)
  if (event.key === 'Backspace') return handleBackspace(controller, model)

  return handleAutoclose(controller, model, event.key)
}

function cycleDelta(event: PrimitiveKeyEvent): number {
  // On some layouts Alt rewrites `key`, so fall back to the physical code.
  if (event.key === ']' || event.code === 'BracketRight') return 1
  if (event.key === '[' || event.code === 'BracketLeft') return -1
  return 0
}

function handleTab(
  controller: EditorController,
  model: EditorModel,
  shiftKey: boolean,
): EditorOutcome {
  if (model.suggestions && !shiftKey) {
    return controller.acceptSuggestion(model)
  }

  const value = textOf(model)
  const multiLine = model.selection.start !== model.selection.end

  if (multiLine || shiftKey) {
    const result = applyBlockIndent(
      value,
      model.selection,
      shiftKey ? -1 : 1,
      INDENT_SIZE,
    )
    if (result.value === value) return { type: 'handled' }
    return controller.commit(model, result.value, result.selection, 'indent')
  }

  const { start, end } = model.selection
  const pad = ' '.repeat(INDENT_SIZE)
  const cursor = start + pad.length
  return controller.commit(
    model,
    value.slice(0, start) + pad + value.slice(end),
    { start: cursor, end: cursor },
    'indent',
  )
}

function handleEnter(
  controller: EditorController,
  model: EditorModel,
): EditorOutcome {
  const result = applyNewlineIndent(textOf(model), model.selection, INDENT_SIZE)
  return controller.commit(model, result.value, result.selection, 'indent')
}

function handleBackspace(
  controller: EditorController,
  model: EditorModel,
): EditorOutcome {
  const result = applyPairBackspace(textOf(model), model.selection)
  if (!result) return null
  return controller.commit(model, result.value, result.selection, 'autoclose')
}

function handleAutoclose(
  controller: EditorController,
  model: EditorModel,
  key: string,
): EditorOutcome {
  if (key.length !== 1) return null

  const result = applyAutoclose(textOf(model), model.selection, key)
  if (!result) return null

  if (result.value === textOf(model)) {
    // Typing over an existing closer: caret moves, buffer does not.
    return update(withText(model, result.value, result.selection), true)
  }

  return controller.commit(model, result.value, result.selection, 'autoclose')
}
