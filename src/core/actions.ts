import type { EditorModel } from './model'

/**
 * Result of feeding an event to the core.
 *
 * `null` means the core did not consume the event and the primitive should
 * handle it natively — that is what keeps arrow keys, clicks and native
 * selection behaviour untouched.
 */
export type EditorOutcome =
  | {
      type: 'update'
      model: EditorModel
      /** True when the core moved the caret and the primitive must follow. */
      moveCaret: boolean
    }
  | { type: 'handled' }
  | null

export function update(model: EditorModel, moveCaret = false): EditorOutcome {
  return { type: 'update', model, moveCaret }
}
