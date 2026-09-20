import { describe, expect, it } from 'vitest'
import { applyAutoclose, applyPairBackspace } from './autoclose'

const caret = (offset: number) => ({ start: offset, end: offset })

describe('applyAutoclose', () => {
  it('inserts the matching closer and sits between the pair', () => {
    expect(applyAutoclose('', caret(0), '(')).toEqual({
      value: '()',
      selection: caret(1),
    })
  })

  it('wraps a selection instead of replacing it', () => {
    expect(applyAutoclose('abc', { start: 0, end: 3 }, '"')).toEqual({
      value: '"abc"',
      selection: { start: 1, end: 4 },
    })
  })

  it('steps over a closer that is already there', () => {
    expect(applyAutoclose('()', caret(1), ')')).toEqual({
      value: '()',
      selection: caret(2),
    })
  })

  it('stays out of the way of an apostrophe inside a word', () => {
    expect(applyAutoclose('don', caret(3), "'")).toBeNull()
    expect(applyAutoclose('xs', caret(0), "'")).toBeNull()
  })

  it('still pairs a quote that opens a string', () => {
    expect(applyAutoclose('const a = ', caret(10), "'")).toEqual({
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
    expect(applyPairBackspace('()', caret(1))).toEqual({
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
