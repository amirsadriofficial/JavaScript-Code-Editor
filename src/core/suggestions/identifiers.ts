import type { WalkedToken } from '../highlight/walk'

export type DeclaredSymbol = {
  name: string
  kind: 'variable' | 'function'
  /** Offset of the declaration, used to rank nearby symbols first. */
  offset: number
  /** Offset past which the binding is no longer in scope. */
  scopeEnd: number
}

/** A `{ … }` block. `end` is patched in when the closing brace is reached. */
type Scope = { end: number }

type PendingSymbol = {
  name: string
  kind: DeclaredSymbol['kind']
  offset: number
  scope: Scope
}

/** Identifiers gathered between a `(` and its matching `)`. */
type ParameterList = {
  names: Array<{ name: string; offset: number }>
  closedAt: number
}

const OPEN_SCOPE = Number.POSITIVE_INFINITY

/**
 * Collect the bindings declared in a buffer, each with a coarse block scope
 * so the engine can avoid offering a `let` from a block that already closed.
 *
 * Driven by tokens rather than a regex over the text, so a declaration
 * written inside a string or a comment is never mistaken for a real one.
 *
 * Scopes are approximated by brace nesting: good enough to stop stale
 * suggestions, and it never needs a parser.
 */
export function extractIdentifiers(tokens: WalkedToken[]): DeclaredSymbol[] {
  const pending: PendingSymbol[] = []

  const fileScope: Scope = { end: OPEN_SCOPE }
  const scopes: Scope[] = [fileScope]
  const currentScope = () => scopes[scopes.length - 1]!

  /** Open `(` groups, innermost last. */
  const groups: Array<ParameterList['names']> = []
  let lastGroup: ParameterList | null = null
  let lastIdentifier: { name: string; offset: number } | null = null

  /** True between `function` and the `)` that ends its parameter list. */
  let expectParameterGroup = false
  /** Names to bind into the next block that opens. */
  let blockParams: ParameterList['names'] = []
  /** True when those names came from `=>`, which may have no block at all. */
  let arrowAwaitingBody = false

  const declare = (
    name: string,
    kind: DeclaredSymbol['kind'],
    offset: number,
    scope: Scope,
  ) => pending.push({ name, kind, offset, scope })

  for (let i = 0; i < tokens.length; i++) {
    const { token, offset } = tokens[i]!

    if (token.kind === 'punctuation') {
      for (let c = 0; c < token.value.length; c++) {
        const char = token.value[c]!
        const at = offset + c

        if (char === '(') {
          groups.push([])
        } else if (char === ')') {
          const names = groups.pop() ?? []
          lastGroup = { names, closedAt: at + 1 }
          if (expectParameterGroup) {
            blockParams = names
            expectParameterGroup = false
          }
        } else if (char === '{') {
          const scope: Scope = { end: OPEN_SCOPE }
          scopes.push(scope)
          for (const param of blockParams) {
            declare(param.name, 'variable', param.offset, scope)
          }
          blockParams = []
          arrowAwaitingBody = false
        } else if (char === '}') {
          if (scopes.length > 1) scopes.pop()!.end = at
        } else if (char === '=' && token.value[c + 1] === '>') {
          blockParams = arrowParameters(lastGroup, lastIdentifier)
          arrowAwaitingBody = true
          c += 1
        } else if (char === ';') {
          blockParams = []
          arrowAwaitingBody = false
        }
      }
      continue
    }

    // A `=>` whose body is an expression has no block to scope its
    // parameters to, so they fall back to the enclosing scope.
    if (arrowAwaitingBody) {
      for (const param of blockParams) {
        declare(param.name, 'variable', param.offset, currentScope())
      }
      blockParams = []
      arrowAwaitingBody = false
    }

    if (token.kind === 'identifier') {
      lastIdentifier = { name: token.value, offset }
      groups[groups.length - 1]?.push({ name: token.value, offset })
      continue
    }

    if (token.kind !== 'keyword') continue

    if (token.value === 'let' || token.value === 'const' || token.value === 'var') {
      // `var` is function scoped; approximating that as file scope keeps the
      // binding available where it would really be hoisted to.
      const scope = token.value === 'var' ? fileScope : currentScope()
      for (const target of bindingTargets(tokens, i + 1)) {
        declare(target.name, 'variable', target.offset, scope)
      }
      continue
    }

    if (token.value === 'function' || token.value === 'class') {
      const next = tokens[i + 1]
      if (next?.token.kind === 'identifier') {
        // Declarations hoist, so they stay visible for the whole file.
        declare(next.token.value, 'function', next.offset, fileScope)
      }
      if (token.value === 'function') expectParameterGroup = true
      continue
    }
  }

  return dedupe(pending)
}

/**
 * `(a, b) => …` takes the parenthesised list; `n => …` takes the single
 * identifier in front of the arrow. They are told apart by which one the
 * arrow follows more closely.
 */
function arrowParameters(
  lastGroup: ParameterList | null,
  lastIdentifier: { name: string; offset: number } | null,
): ParameterList['names'] {
  const identifierOffset = lastIdentifier?.offset ?? -1

  if (lastGroup && lastGroup.closedAt > identifierOffset) {
    return lastGroup.names
  }
  return lastIdentifier ? [lastIdentifier] : []
}

/**
 * Names bound by `const x`, `const { a, b }` or `const [a, b]`.
 *
 * Within a pattern the binding is whichever identifier sits last before the
 * separator, so `{ key: target }` binds `target` and `{ a = fallback }`
 * binds `a`.
 */
function bindingTargets(
  tokens: WalkedToken[],
  from: number,
): Array<{ name: string; offset: number }> {
  const first = tokens[from]
  if (!first) return []

  if (first.token.kind === 'identifier') {
    return [{ name: first.token.value, offset: first.offset }]
  }

  if (first.token.kind !== 'punctuation') return []
  const opener = first.token.value[0]
  if (opener !== '{' && opener !== '[') return []

  const names: Array<{ name: string; offset: number }> = []
  let depth = 0
  let candidate: { name: string; offset: number } | null = null
  /** Inside a `=` default, where identifiers are values rather than bindings. */
  let inDefault = false

  const commit = () => {
    if (candidate) names.push(candidate)
    candidate = null
    inDefault = false
  }

  for (let i = from; i < tokens.length; i++) {
    const { token, offset } = tokens[i]!

    if (token.kind === 'identifier') {
      if (!inDefault) candidate = { name: token.value, offset }
      continue
    }

    if (token.kind !== 'punctuation') continue

    for (const char of token.value) {
      if (char === '{' || char === '[') {
        depth += 1
      } else if (char === '}' || char === ']') {
        commit()
        depth -= 1
        if (depth <= 0) return names
      } else if (char === ',') {
        commit()
      } else if (char === ':') {
        candidate = null
      } else if (char === '=') {
        inDefault = true
      }
    }
  }

  return names
}

function dedupe(symbols: PendingSymbol[]): DeclaredSymbol[] {
  const byName = new Map<string, DeclaredSymbol>()

  for (const { name, kind, offset, scope } of symbols) {
    const existing = byName.get(name)
    if (!existing || offset < existing.offset) {
      byName.set(name, { name, kind, offset, scopeEnd: scope.end })
    }
  }

  return [...byName.values()]
}
