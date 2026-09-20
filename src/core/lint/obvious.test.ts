import { describe, expect, it } from 'vitest'
import { analyze } from '../document'

describe('findObviousIssues', () => {
  it('underlines an unterminated string for its whole span', () => {
    const doc = analyze('const x = "hello')
    const issue = doc.issues.find((i) => i.message === 'Unterminated string')
    expect(issue).toMatchObject({
      start: 'const x = '.length,
      end: 'const x = "hello'.length,
    })
  })

  it('underlines an unclosed block from the opener to EOF', () => {
    const text = 'function f() {\n  return 1\n'
    const doc = analyze(text)
    const issue = doc.issues.find((i) => i.message === "Unclosed '{'")
    expect(issue).toMatchObject({ start: 'function f() '.length, end: text.length })
  })

  it('underlines an unclosed block comment through EOF', () => {
    const text = 'a\n/* still open\nmore'
    const doc = analyze(text)
    const issue = doc.issues.find((i) => i.message === 'Unclosed block comment')
    expect(issue?.start).toBe('a\n'.length)
    expect(issue?.end).toBe(text.length)
  })

  it('marks an unexpected closer on just that character', () => {
    const doc = analyze('a)')
    expect(doc.issues[0]).toMatchObject({
      message: "Unexpected ')'",
      start: 1,
      end: 2,
    })
  })
})
