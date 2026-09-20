import { describe, expect, it } from 'vitest'
import { HistoryStack } from './stack'

const snap = (value: string) => ({
  value,
  selection: { start: value.length, end: value.length },
})

describe('HistoryStack', () => {
  it('collapses a fast run of typing into one undo step', () => {
    const history = new HistoryStack()
    const now = 1_000

    history.recordBefore(snap(''), { coalesce: true, now })
    history.recordBefore(snap('a'), { coalesce: true, now: now + 50 })
    history.recordBefore(snap('ab'), { coalesce: true, now: now + 100 })

    expect(history.undo(snap('abc'))?.value).toBe('')
    expect(history.canUndo).toBe(false)
  })

  it('starts a new step once the run has gone quiet', () => {
    const history = new HistoryStack()

    history.recordBefore(snap(''), { coalesce: true, now: 0 })
    history.recordBefore(snap('abc'), { coalesce: true, now: 5_000 })

    expect(history.undo(snap('abcdef'))?.value).toBe('abc')
    expect(history.undo(snap('abc'))?.value).toBe('')
  })

  it('keeps a paste as its own step even mid-run', () => {
    const history = new HistoryStack()

    history.recordBefore(snap('a'), { coalesce: true, now: 0 })
    history.recordBefore(snap('ab'), { coalesce: false, now: 10 })

    expect(history.undo(snap('ab<pasted>'))?.value).toBe('ab')
    expect(history.undo(snap('ab'))?.value).toBe('a')
  })

  it('round-trips undo and redo', () => {
    const history = new HistoryStack()
    history.recordBefore(snap('one'))

    const undone = history.undo(snap('two'))!
    expect(undone.value).toBe('one')
    expect(history.canRedo).toBe(true)

    expect(history.redo(undone)?.value).toBe('two')
    expect(history.canUndo).toBe(true)
  })

  it('drops the redo branch when new work arrives', () => {
    const history = new HistoryStack()
    history.recordBefore(snap('one'))
    history.undo(snap('two'))

    history.recordBefore(snap('one'))
    expect(history.canRedo).toBe(false)
  })

  it('bounds how much it remembers', () => {
    const history = new HistoryStack(3)
    for (let i = 0; i < 10; i++) history.recordBefore(snap(`v${i}`))

    expect(history.serialize().undo.map((s) => s.value)).toEqual([
      'v7',
      'v8',
      'v9',
    ])
  })

  it('round-trips through serialize and restore', () => {
    const history = new HistoryStack()
    history.recordBefore(snap('one'))
    history.recordBefore(snap('two'))

    const revived = new HistoryStack()
    revived.restore(history.serialize())

    expect(revived.undo(snap('three'))?.value).toBe('two')
    expect(revived.undo(snap('two'))?.value).toBe('one')
    expect(revived.canUndo).toBe(false)
  })
})
