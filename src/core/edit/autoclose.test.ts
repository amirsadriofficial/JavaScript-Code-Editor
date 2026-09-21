import { describe, expect, it } from 'vitest'
import { applyAutoclose, applyPairBackspace } from './autoclose'

const caret = (offset: number) => ({ start: offset, end: offset })

describe('applyAutoclose', () => {
  it('inserts the matching closer and sits between the pair', () => {
    const result = applyAutoclose('', caret(0), '(')

    expect(result).toEqual({
      value: '()',
      selection: caret(1),
    })
  })

  it('wraps a selection instead of replacing it', () => {
    const result = applyAutoclose('abc', { start: 0, end: 3 }, '"')

    expect(result).toEqual({
      value: '"abc"',
      selection: { start: 1, end: 4 },
    })
  })

  it('steps over a closer that is already there', () => {
    const result = applyAutoclose('()', caret(1), ')')

    expect(result).toEqual({
      value: '()',
      selection: caret(2),
    })
  })

  it('stays out of the way of an apostrophe inside a word', () => {
    // Typing the apostrophe in "don't" must not insert a second quote.
    expect(applyAutoclose('don', caret(3), "'")).toBeNull()
    // Opening quote right before a letter is also left alone.
    expect(applyAutoclose('xs', caret(0), "'")).toBeNull()
  })

  it('still pairs a quote that opens a string', () => {
    const result = applyAutoclose('const a = ', caret(10), "'")

    expect(result).toEqual({
      value: "const a = ''",
      selection: caret(11),
    })
  })

  it('does not pair after an escape', () => {
    expect(applyAutoclose('"a\\', caret(3), '"')).toBeNull()
  })

  it('ignores keys that are not brackets or quotes', () => {
    expect(applyAutoclose('a', caret(1), 'b')).toBeNull()
    expect(applyAutoclose('a', caret(1), 'ArrowLeft')).toBeNull()
  })
})

describe('applyPairBackspace', () => {
  it('removes both halves of an empty pair', () => {
    const result = applyPairBackspace('()', caret(1))

    expect(result).toEqual({
      value: '',
      selection: caret(0),
    })
  })

  it('leaves a pair with content alone', () => {
    expect(applyPairBackspace('(a)', caret(1))).toBeNull()
  })

  it('ignores a non-empty selection', () => {
    expect(applyPairBackspace('()', { start: 0, end: 2 })).toBeNull()
  })
})
