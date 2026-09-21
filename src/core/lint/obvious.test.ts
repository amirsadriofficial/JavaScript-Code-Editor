import { describe, expect, it } from 'vitest'
import { analyze } from '../document'

/** First issue whose message matches, or undefined. */
function issueNamed(text: string, message: string) {
  return analyze(text).issues.find((issue) => issue.message === message)
}

describe('findObviousIssues', () => {
  it('underlines an unterminated string for its whole span', () => {
    const source = 'const x = "hello'
    const issue = issueNamed(source, 'Unterminated string')

    expect(issue).toBeDefined()
    expect(issue!.start).toBe('const x = '.length)
    expect(issue!.end).toBe(source.length)
  })

  it('underlines an unclosed block from the opener to EOF', () => {
    const source = 'function f() {\n  return 1\n'
    const issue = issueNamed(source, "Unclosed '{'")

    expect(issue).toBeDefined()
    expect(issue!.start).toBe('function f() '.length)
    expect(issue!.end).toBe(source.length)
  })

  it('underlines an unclosed block comment through EOF', () => {
    const source = 'a\n/* still open\nmore'
    const issue = issueNamed(source, 'Unclosed block comment')

    expect(issue).toBeDefined()
    expect(issue!.start).toBe('a\n'.length)
    expect(issue!.end).toBe(source.length)
  })

  it('marks an unexpected closer on just that character', () => {
    const issues = analyze('a)').issues

    expect(issues[0]).toMatchObject({
      message: "Unexpected ')'",
      start: 1,
      end: 2,
    })
  })
})
