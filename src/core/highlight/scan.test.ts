import { describe, expect, it } from 'vitest'
import { analyze, isCodeOffset } from '../document'
import { isCodeInLine, scanLine, type ScanState } from './scan'

const describeTokens = (text: string, entry: ScanState = 'code') =>
  scanLine(text, entry).tokens.map((token) => `${token.kind}:${token.value}`)

/** Flatten a whole document to `kind:value` for readable assertions. */
const documentTokens = (text: string) =>
  analyze(text).lines.flatMap((line) =>
    line.tokens.map((token) => `${token.kind}:${token.value}`),
  )

describe('scanLine', () => {
  it('covers the line exactly once', () => {
    const text = 'const a = "x"; // note'
    const { tokens } = scanLine(text, 'code')

    expect(tokens.map((t) => t.value).join('')).toBe(text)
    tokens.forEach((token, i) => {
      expect(token.start).toBe(i === 0 ? 0 : tokens[i - 1]!.end)
    })
  })

  it('separates keywords from identifiers that merely contain them', () => {
    expect(describeTokens('const x')).toEqual([
      'keyword:const',
      'plain: ',
      'identifier:x',
    ])
    expect(describeTokens('constant')).toEqual(['identifier:constant'])
  })

  it('classifies numbers, strings and comments', () => {
    expect(describeTokens('0xff')).toEqual(['number:0xff'])
    expect(describeTokens('1.5e3')).toEqual(['number:1.5e3'])
    expect(describeTokens('1_000n')).toEqual(['number:1_000n'])
    expect(describeTokens('"a\\"b"')).toEqual(['string:"a\\"b"'])
    expect(describeTokens('// hi')).toEqual(['comment:// hi'])
    expect(describeTokens('/* hi */')).toEqual(['comment:/* hi */'])
  })

  it('keeps an unterminated quote on its own line', () => {
    const scan = scanLine('const a = "oops', 'code')
    expect(scan.tokens.at(-1)).toMatchObject({ kind: 'string', value: '"oops' })
    expect(scan.exit).toBe('code')
  })

  it('reports the state it leaves the line in', () => {
    expect(scanLine('/* open', 'code').exit).toBe('block-comment')
    expect(scanLine('const t = `open', 'code').exit).toBe('template')
    expect(scanLine('still comment', 'block-comment').exit).toBe('block-comment')
    expect(scanLine('closes */ x', 'block-comment').exit).toBe('code')
    expect(scanLine('closes` + x', 'template').exit).toBe('code')
  })

  it('resumes a carried-over construct and records where it ended', () => {
    const scan = scanLine('done */ const a = 1', 'block-comment')
    expect(scan.continuationEnd).toBe('done */'.length)
    expect(describeTokens('done */ const a = 1', 'block-comment')).toEqual([
      'comment:done */',
      'plain: ',
      'keyword:const',
      'plain: ',
      'identifier:a',
      'plain: ',
      'punctuation:=',
      'plain: ',
      'number:1',
    ])
  })

  it('does not close a template on an escaped backtick', () => {
    expect(scanLine('a\\` still', 'template').exit).toBe('template')
  })
})

describe('whole-document scanning', () => {
  it('stops an unterminated quote at the end of its line', () => {
    expect(documentTokens('const a = "oops\nconst b = 1')).toEqual([
      'keyword:const',
      'plain: ',
      'identifier:a',
      'plain: ',
      'punctuation:=',
      'plain: ',
      'string:"oops',
      'keyword:const',
      'plain: ',
      'identifier:b',
      'plain: ',
      'punctuation:=',
      'plain: ',
      'number:1',
    ])
  })

  it('lets template literals span lines', () => {
    const lines = analyze('const t = `a\nb`;').lines
    expect(lines[0]!.exit).toBe('template')
    expect(lines[1]!.tokens[0]).toMatchObject({ kind: 'string', value: 'b`' })
  })

  it('lets block comments span lines', () => {
    const lines = analyze('/* a\nb */ const x = 1').lines
    expect(lines[0]!.exit).toBe('block-comment')
    expect(lines[1]!.tokens.some((t) => t.kind === 'keyword')).toBe(true)
  })
})

describe('incremental reuse', () => {
  const source = Array.from({ length: 200 }, (_, i) => `const v${i} = ${i};`).join(
    '\n',
  )

  it('keeps the scan objects for lines that did not change', () => {
    const before = analyze(source)
    const edited = source.replace('const v100 = 100;', 'const v100 = 999;')
    const after = analyze(edited, before)

    expect(after.lines[0]).toBe(before.lines[0])
    expect(after.lines[100]).not.toBe(before.lines[100])
    expect(after.lines[150]).toBe(before.lines[150])
  })

  it('reuses the tail after a line is inserted', () => {
    const before = analyze(source)
    const withLine = source.replace(
      'const v100 = 100;',
      'const v100 = 100;\nconst inserted = 1;',
    )
    const after = analyze(withLine, before)

    expect(after.lines.length).toBe(before.lines.length + 1)
    expect(after.lines[50]).toBe(before.lines[50])
    expect(after.lines[150]).toBe(before.lines[149])
  })

  it('re-scans downstream lines when a block comment opens', () => {
    const before = analyze(source)
    const after = analyze(source.replace('const v0 = 0;', '/* open'), before)

    expect(after.lines[1]!.entry).toBe('block-comment')
    expect(after.lines[1]).not.toBe(before.lines[1])
  })

  it('produces the same result as analyzing from scratch', () => {
    const start = 'const a = 1;\nconst b = `x\ny`;\n/* c\nd */ const e = 2;'
    const edited = start.replace('const a = 1;', 'const alpha = 11;')

    const incremental = analyze(edited, analyze(start))
    const scratch = analyze(edited)

    expect(incremental.lines.map((l) => l.tokens)).toEqual(
      scratch.lines.map((l) => l.tokens),
    )
    expect(incremental.identifiers).toEqual(scratch.identifiers)
    expect(incremental.issues).toEqual(scratch.issues)
  })
})

describe('isCodeInLine', () => {
  it('rejects offsets inside strings and comments', () => {
    const line = scanLine('let a = "text" // trailing', 'code')
    expect(isCodeInLine(line, 11)).toBe(false)
    expect(isCodeInLine(line, 20)).toBe(false)
  })

  it('accepts offsets in code, including a literal boundary', () => {
    const line = scanLine('let a = "text" x', 'code')
    expect(isCodeInLine(line, 2)).toBe(true)
    expect(isCodeInLine(line, 8)).toBe(true)
    expect(isCodeInLine(line, 14)).toBe(true)
  })

  it('stays inside a literal that was never closed', () => {
    const line = scanLine('let a = "text', 'code')
    expect(isCodeInLine(line, 13)).toBe(false)
  })

  it('stays inside a multi-line template', () => {
    const doc = analyze('const t = `a\nmiddle\nb`;')
    expect(isCodeOffset(doc, doc.text.indexOf('middle') + 3)).toBe(false)
    expect(isCodeOffset(doc, doc.text.length)).toBe(true)
  })

  it('treats an empty buffer as code', () => {
    expect(isCodeOffset(analyze(''), 0)).toBe(true)
  })
})
