import type { EditorSnapshot } from '../types'

const COALESCE_MS = 400
const DEFAULT_LIMIT = 200

export type HistoryData = {
  undo: EditorSnapshot[]
  redo: EditorSnapshot[]
}

/**
 * Undo/redo over whole-buffer snapshots, independent of the DOM.
 *
 * Runs of fast typing collapse into a single step by *skipping* the new
 * snapshot: the entry already on the stack is the older state, and that is
 * the one undo should return to.
 */
export class HistoryStack {
  private undoStack: EditorSnapshot[] = []
  private redoStack: EditorSnapshot[] = []
  private lastPushAt = 0
  private readonly limit: number

  constructor(limit = DEFAULT_LIMIT) {
    this.limit = limit
  }

  /** Record the state *before* a mutation is applied. */
  recordBefore(
    previous: EditorSnapshot,
    options: { coalesce?: boolean; now?: number } = {},
  ): void {
    const now = options.now ?? Date.now()
    const coalesce = options.coalesce === true
    const withinRun =
      coalesce &&
      this.undoStack.length > 0 &&
      now - this.lastPushAt < COALESCE_MS

    // A structural edit is a boundary on both sides: it gets its own step,
    // and the typing that follows it starts another one.
    this.lastPushAt = coalesce ? now : 0
    this.redoStack = []

    if (withinRun) return

    this.undoStack.push(previous)
    if (this.undoStack.length > this.limit) {
      this.undoStack.splice(0, this.undoStack.length - this.limit)
    }
  }

  undo(current: EditorSnapshot): EditorSnapshot | null {
    const previous = this.undoStack.pop()
    if (!previous) return null
    this.redoStack.push(current)
    this.breakRun()
    return previous
  }

  redo(current: EditorSnapshot): EditorSnapshot | null {
    const next = this.redoStack.pop()
    if (!next) return null
    this.undoStack.push(current)
    this.breakRun()
    return next
  }

  /** Ends the coalescing window, e.g. when the caret is moved by hand. */
  breakRun(): void {
    this.lastPushAt = 0
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Plain copy of the stacks. Trimming for storage is `persist`'s job. */
  serialize(): HistoryData {
    return { undo: [...this.undoStack], redo: [...this.redoStack] }
  }

  restore(data: HistoryData): void {
    this.undoStack = [...data.undo]
    this.redoStack = [...data.redo]
    this.breakRun()
  }
}
