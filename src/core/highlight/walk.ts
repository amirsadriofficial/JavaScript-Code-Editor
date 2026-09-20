import type { LineScan } from './scan'
import type { Token } from '../types'

export type WalkedToken = {
  token: Token
  /** Offset of the token within the whole buffer. */
  offset: number
}

function isSignificant(token: Token): boolean {
  if (token.kind === 'comment') return false
  return !(token.kind === 'plain' && token.value.trim() === '')
}

/**
 * Flattens the per-line tokens into the code-only stream that linting and
 * symbol extraction both consume, with buffer offsets restored.
 *
 * Built once per analysis and shared, rather than each consumer re-walking
 * and re-filtering the document.
 */
export function collectCodeTokens(
  lines: LineScan[],
  lineStarts: number[],
): WalkedToken[] {
  const out: WalkedToken[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const lineStart = lineStarts[i]!
    // Index 0 of a continued line is the interior of a multi-line literal,
    // which has no opening delimiter and means nothing on its own.
    const from = line.entry === 'code' ? 0 : 1

    for (let t = from; t < line.tokens.length; t++) {
      const token = line.tokens[t]!
      if (isSignificant(token)) {
        out.push({ token, offset: lineStart + token.start })
      }
    }
  }

  return out
}
