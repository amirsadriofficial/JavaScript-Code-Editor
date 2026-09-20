import { useCallback, useMemo, useRef, useState } from 'react'
import {
  createModel,
  EditorController,
  HistoryStack,
  textOf,
  type EditorModel,
  type EditorOutcome,
  type PrimitiveChange,
  type PrimitiveKeyEvent,
  type TextRange,
} from '../../core'

export type EditorEngine = {
  model: EditorModel
  text: string
  ghost: string
  /** Caret the primitive must adopt, or null when the user is in control. */
  caretRequest: TextRange | null
  canUndo: boolean
  canRedo: boolean
  history: HistoryStack
  onChange: (change: PrimitiveChange) => void
  onSelectionChange: (selection: TextRange) => void
  onKeyDown: (event: PrimitiveKeyEvent) => boolean
  undo: () => void
  redo: () => void
}

export type EngineInit = {
  text: string
  selection?: TextRange
  recent?: string[]
  history?: HistoryStack
}

/**
 * Binds the framework-free core to React.
 *
 * Handlers read the model through a ref rather than the render closure: a
 * keystroke can arrive before React has committed the previous one, and
 * acting on a stale model would drop characters.
 */
export function useEditorEngine(init: () => EngineInit): EditorEngine {
  const [{ controller, initial }] = useState(() => {
    const config = init()
    return {
      controller: new EditorController(config.history ?? new HistoryStack()),
      initial: createModel(config.text, config.selection, config.recent),
    }
  })

  const [model, setModel] = useState(initial)
  // Seeded with the initial caret so a restored session opens where the user
  // left off rather than at offset zero.
  const [caretRequest, setCaretRequest] = useState<TextRange | null>(
    initial.selection,
  )
  const [historyFlags, setHistoryFlags] = useState(() => ({
    canUndo: controller.history.canUndo,
    canRedo: controller.history.canRedo,
  }))
  const latest = useRef(model)

  const applyOutcome = useCallback(
    (outcome: EditorOutcome) => {
      if (!outcome || outcome.type === 'handled') return
      latest.current = outcome.model
      setModel(outcome.model)
      setCaretRequest(outcome.moveCaret ? outcome.model.selection : null)
      // The stack is mutable, so its availability has to be mirrored into
      // React state for the toolbar to re-render.
      setHistoryFlags({
        canUndo: controller.history.canUndo,
        canRedo: controller.history.canRedo,
      })
    },
    [controller],
  )

  const onChange = useCallback(
    (change: PrimitiveChange) => {
      applyOutcome(controller.applyChange(latest.current, change))
    },
    [applyOutcome, controller],
  )

  const onSelectionChange = useCallback(
    (selection: TextRange) => {
      applyOutcome(controller.moveSelection(latest.current, selection))
    },
    [applyOutcome, controller],
  )

  const onKeyDown = useCallback(
    (event: PrimitiveKeyEvent) => {
      const outcome = controller.handleKey(latest.current, event)
      if (!outcome) return false
      applyOutcome(outcome)
      return true
    },
    [applyOutcome, controller],
  )

  const undo = useCallback(() => {
    applyOutcome(controller.undo(latest.current))
  }, [applyOutcome, controller])

  const redo = useCallback(() => {
    applyOutcome(controller.redo(latest.current))
  }, [applyOutcome, controller])

  return useMemo(
    () => ({
      model,
      text: textOf(model),
      ghost: controller.ghostText(model),
      caretRequest,
      canUndo: historyFlags.canUndo,
      canRedo: historyFlags.canRedo,
      history: controller.history,
      onChange,
      onSelectionChange,
      onKeyDown,
      undo,
      redo,
    }),
    [
      model,
      caretRequest,
      historyFlags,
      controller,
      onChange,
      onSelectionChange,
      onKeyDown,
      undo,
      redo,
    ],
  )
}
