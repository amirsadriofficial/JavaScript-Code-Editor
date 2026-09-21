# JavaScript Code Editor

Browser code editor with live syntax highlighting and Copilot-style ghost
completions. The editing widget underneath is replaceable — core logic never
touches the DOM.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm check        # types + lint + 112 unit tests
pnpm test:browser # 47 Playwright checks (optional CHROME_PATH=…)
```

Production deploy (Docker + host nginx): [`deploy/`](./deploy/README.md).

---

## Design constraint

The brief required that application logic stay decoupled from the text widget,
so the widget can be swapped in under an hour.

That boundary is `src/core`: no React, no DOM — pure functions plus one class
that owns undo. The only contract it needs is `TextPrimitiveProps`:

```ts
export type TextPrimitiveProps = {
  value: string
  selection: TextRange | null          // request after a core edit; otherwise null
  elementRef: (el: HTMLElement | null) => void
  onChange: (change: PrimitiveChange) => void
  onSelectionChange: (selection: TextRange) => void
  onScroll: (position: { top: number; left: number }) => void
  onKeyDown: (event: PrimitiveKeyEvent) => boolean  // true → preventDefault
}
```

`src/ui` is the only browser half. Exactly one file knows a `<textarea>`
exists: `ui/primitives/TextareaPrimitive.tsx`.

**To swap the primitive:** implement `TextPrimitiveProps`, then change the
single element at the bottom of `ui/EditorShell.tsx`. Nothing else moves.
Unit tests stay green — they never needed a DOM.

---

## Layout

```text
src/core/                         no DOM, no React
  document.ts                     analyze() — one pass for everyone
  model.ts                        EditorModel + pure transitions
  editor-controller.ts            undo + event → model
  primitive/types.ts              TextPrimitiveProps
  highlight/scan.ts               line tokenizer + carry state
  suggestions/                    engine, rank, identifiers, builtins
  edit/                           keys, autoclose, indent
  history/stack.ts                undo/redo with typing coalescing
  lint/obvious.ts                 brackets + unclosed literals
  persist.ts

src/ui/                           browser only
  EditorShell.tsx                 composition root
  primitives/TextareaPrimitive.tsx   ← swappable
  CodeLine / HighlightLayer / GhostText / LineNumbers / Toolbar
  hooks/                          engine, metrics, scroll, viewport, …
```

### How analysis works

Highlighting, lint, and completion all read one `AnalyzedDocument` produced
by `analyze()` per change. It lives on `EditorModel`, so text and tokens
cannot drift.

A line’s tokens depend only on its text and entry state (`code` |
`block-comment` | `template`). `analyze(text, previous)` reuses every
unchanged line — a keystroke in a 2,000-line file re-scans **1 line**.

`CodeLine` is memoised on that scan object; only the visible window (+ overscan)
is in the DOM.

Ghost text position is arithmetic (monospace, no wrap): line × height +
column × advance. The browser suite measures **0.02px** error.

---

## Features

| Area | Behaviour |
|------|-----------|
| Highlighting | Keywords, strings, templates, comments, numbers, identifiers. Unterminated `'`/`"` stop at end of line. |
| Completions | Ghost text; `Tab` accept, `Esc` dismiss, `Alt+]`/`Alt+[` cycle. Keywords, builtins, user identifiers (incl. destructuring + arrow params). Prefix-only — never fuzzy. After `.` → members only. Silent in strings/comments. |
| Scope | Token-based. `let`/`const` die with their brace block; `var`/`function`/`class` stay file-wide. |
| Editing | Auto-close pairs, wrap selection, skip existing closer, smart quotes (`don't` is fine). Enter keeps indent; `{` adds a level. Block Tab / Shift+Tab. |
| Undo | Fast typing coalesces. Paste, accept, Enter, autoclose each get their own step. |
| Polish | Themes, line numbers, current line, status bar, squiggly underlines on issues, localStorage restore (text, caret, scroll, theme, history). |

---

## Performance

Measured on a **2,000-line / 49 KB** document.

| Metric | Value |
|--------|-------|
| Core work / keystroke | **~1.8 ms** (≈5 ms without reuse) |
| Lines re-scanned / keystroke | **1** of 2,000 |
| Keystroke → next frame | **~8–11 ms** median |
| Highlighted lines in DOM | **49** of 2,000 |
| Analyze 10,000-line paste | **~22 ms** |

What got it there: incremental scanning, windowed rendering, and an
uncontrolled textarea (DOM already has the right text on ordinary typing;
the model writes back only after core-driven edits).

Budgets are asserted in `src/core/document.bench.test.ts`.

---

## Tests

| Command | What |
|---------|------|
| `pnpm check` | `tsc` + ESLint + **112** Vitest tests under `src/core` (no DOM) |
| `pnpm test:browser` | Build + serve + **47** Playwright checks in `e2e/browser.mjs` |

Unit tests focus on easy-to-break behaviour: coalesced undo, ghost prefix
invariants, quote/line boundaries, indent round-trips, incremental ≡ scratch,
destructuring bind names.

Browser tests cover alignment, native caret/selection, clipboard paste,
persistence, windowing, and latency on a large file.

---

## Known limitations

- Tokenizer is regex + state, not a parser — `` `${…}` `` stays string-coloured; regex literals look like division.
- Scope ≈ brace nesting; expression-bodied arrow params fall back to the enclosing scope.
- Undo stores whole-buffer snapshots (capped in memory and in `localStorage`).
- Non-ASCII identifiers tokenize as plain characters.
