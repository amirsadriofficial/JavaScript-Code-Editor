# JavaScript Code Editor

A browser code editor with live syntax highlighting and Copilot-style inline
completions, built so that the editing primitive underneath it is replaceable.

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm check    # types, lint, tests
```

## The design constraint

The brief asked for one thing above the features: the application logic must
not be entangled with whatever widget holds the text, so that widget can be
swapped in under an hour.

That line is drawn at `src/core`. Nothing under it imports React or touches
the DOM — it is a library of pure functions plus one class that owns undo
history. It describes what it needs from a text widget in
`core/primitive/types.ts` and never looks past that description:

```ts
export type TextPrimitiveProps = {
  value: string
  selection: TextRange | null
  elementRef: (element: HTMLElement | null) => void
  onChange: (change: PrimitiveChange) => void
  onSelectionChange: (selection: TextRange) => void
  onScroll: (position: { top: number; left: number }) => void
  onKeyDown: (event: PrimitiveKeyEvent) => boolean
}
```

`src/ui` is the only half that knows about a browser, and inside it exactly
one file knows a `<textarea>` exists: `ui/primitives/TextareaPrimitive.tsx`.

### Swapping the primitive

1. Write a component satisfying `TextPrimitiveProps`.
2. Change the one element rendered at the bottom of `ui/EditorShell.tsx`.

Nothing else moves. Highlighting, completion, history, indentation, linting
and persistence are unaware of how text reaches them. The 106 tests all run
against the core and need no DOM, so they keep passing across the swap — they
are the proof that the seam is real rather than aspirational.

Three things the replacement owes the shell:

- `onKeyDown` must `preventDefault()` when the handler returns `true`.
- `selection` is a *request*, not a binding. It is non-null only on the render
  after a core-driven edit, so ordinary clicking and arrow keys are never
  fought over.
- `elementRef` must hand back the element the text is laid out in. The
  overlays derive their geometry from its font metrics, so a primitive that
  withholds it gets misplaced ghost text — which is why it is in the type
  rather than an extra prop the shell hopes for.

## Architecture

```
src/core/                         no DOM, no React
  types.ts                        TextRange, Token, Suggestion, …
  document.ts                     analyze(text, previous?) — the single analysis pass
  model.ts                        EditorModel and its pure transitions
  actions.ts                      what feeding an event to the core returns
  editor-controller.ts            owns undo history, turns events into models
  primitive/types.ts              the contract above
  highlight/
    scan.ts                       line-at-a-time tokenizer with carry state
    walk.ts                       per-line tokens -> one code-only stream
    keywords.ts
  suggestions/
    engine.ts                     candidate generation
    rank.ts                       scoring
    identifiers.ts                declarations and their scopes, from tokens
    builtins.ts
  edit/
    keys.ts                       keyboard policy
    autoclose.ts                  brackets and quotes
    indent.ts                     Enter, Tab, Shift+Tab
  history/stack.ts                undo/redo with run coalescing
  lint/obvious.ts                 unbalanced brackets, unclosed literals
  persist.ts

src/ui/                           the only half that touches a browser
  EditorShell.tsx                 composition root
  primitives/TextareaPrimitive.tsx   ← the swappable part
  CodeLine.tsx  HighlightLayer.tsx  GhostText.tsx  LineNumbers.tsx  Toolbar.tsx
  hooks/                          engine binding, metrics, scroll, viewport, …
```

### One analysis pass

Highlighting, diagnostics and completion all need to know what the text
*is*. Rather than each scanning it separately — and risking three different
opinions about the same characters — `analyze()` runs once per change and
produces the document every consumer reads.

It is part of `EditorModel`, not a cache beside it, so tokens and text cannot
drift apart.

### Incremental re-analysis

A line's tokens depend only on its own text and the state it starts in. Only
block comments and template literals carry across a newline, so that state is
one of three values.

`analyze(text, previous)` therefore reuses the scan of every line an edit
didn't touch: the lines above the caret are untouched, and the lines below
match again as soon as the carry state re-converges. A keystroke in a
2,000-line file re-scans **1 line out of 2,000**.

The view is paired to this. `CodeLine` is memoised on the scan object, so
React re-renders the one line that changed, and only the visible window plus
an overscan margin is in the DOM at all.

### Where the caret is

Ghost text has to land exactly where the caret is. Because the text is
monospace and never wraps, that is arithmetic — line index times line height,
visual column times character advance — not measurement. The character
advance is read once from a hidden probe, and again when web fonts finish
loading. The browser test asserts the ghost sits within 1.5px of where the
textarea puts the same characters; it measures **0.02px**.

## Features

### Syntax highlighting

Keywords, strings, template literals, comments, numbers, identifiers and
punctuation, updated as you type. An unterminated `'` or `"` stops at the end
of its line rather than recolouring the rest of the file.

### Inline completions

Ghost text after the caret, accepted with `Tab`.

Candidates come from JavaScript keywords, common built-ins and identifiers
you declared — `const`/`let`/`var`, destructuring patterns, functions,
classes, and both `function` and arrow parameters.

Ghost text can only ever *append* to what you typed, so the engine only
offers candidates that extend it. Fuzzy and substring matches are deliberately
rejected: rendered at the caret they read as duplicated characters.

After a `.` only members are offered, and they replace only the text past the
dot — `arr.ma` + `Tab` gives `arr.map`, not `map`. Namespaced globals match on
the whole path instead, so `Math.ra` completes to `Math.random`.

Ranking prefers exact-case prefixes, then shorter completions, then locally
declared names, then recently accepted ones. Completion stays silent inside
strings and comments, including at the end of one that never closed.

### Scope awareness

Declarations are read from the token stream, so `// const secret = 1` never
becomes a suggestion. Bindings are bounded by brace nesting: a `let` from a
block that already closed is not offered, while `var`, `function` and `class`
stay visible for the whole file, as hoisting implies.

### Editing

| Key | Behaviour |
| --- | --- |
| `Tab` | accept the suggestion; otherwise indent |
| `Esc` | dismiss the suggestion |
| `Alt+]` / `Alt+[` | cycle candidates |
| `Enter` | keep indentation, add a level after `{`, drop the closer onto its own line |
| `Tab` / `Shift+Tab` on a selection | indent / outdent every line it touches |
| `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` | undo, redo |

Brackets and quotes auto-close, wrap a selection, and skip over a closer that
is already there. Quotes stay out of the way inside words, so `don't` types
normally. Backspace between an empty pair removes both halves.

A run of fast typing collapses into one undo step. A paste, an accepted
completion, `Enter` and an auto-closed bracket each get their own step, and a
structural edit is a boundary on both sides of the run.

### Also

Light and dark themes, line numbers, current-line highlight, a cursor
position readout, and warnings for unbalanced brackets and unclosed literals.
Text, caret, scroll position, theme and undo history are restored on reload;
stored history is capped, and over quota the text is kept in preference to it.

## Performance

Measured on a 2,000-line / 49 KB document. The core numbers are printed by
`pnpm test`, which also asserts them as budgets; the keystroke and DOM
numbers come from a Playwright run against the production build.

| | |
| --- | --- |
| Core work per keystroke | **1.8 ms** (5.2 ms without reuse) |
| Line scans recomputed per keystroke | **1** of 2,000 |
| Keystroke to next frame | **8.2 ms** median, 20.8 ms worst |
| Highlighted lines in the DOM | **49** of 2,000 |

It started at 32 ms per keystroke, which is two dropped frames. Three things
closed the gap:

- **Incremental scanning**, above.
- **Windowed rendering**, so markup exists only for what is on screen.
- **An uncontrolled primitive.** The model is still the source of truth, but
  for ordinary typing the DOM already holds the right text. Writing it back
  handed the browser a fresh copy of the whole buffer on every keystroke;
  text is now pushed down only when the core changed it.

Pasting 10,000 lines analyses in ~22 ms. Scroll sync is written to the DOM
inside the scroll handler, which runs before paint, so the overlay never lags
a frame behind the text.

## Tests

```bash
pnpm check         # types + lint + 108 unit tests
pnpm test:browser  # builds, serves, runs 46 Playwright checks
```

The unit suite lives entirely under `src/core` and needs no DOM. It covers
the behaviours that are easy to get subtly wrong: that a coalesced typing
run undoes to the start of the run and not one character back; that every
candidate extends the typed prefix; that an unterminated quote does not
escape its line; that `Enter` before `}` doesn't eat the blank lines below
it; that indent and outdent round-trip; that incremental analysis gives
bit-identical results to analysing from scratch; that destructuring binds
the renamed half, not the key.

`src/core/document.bench.test.ts` asserts the performance budgets, so a
regression fails the suite rather than being noticed later.

`pnpm test:browser` (`e2e/browser.mjs`) covers what the unit tests cannot
see: ghost-text pixel alignment, native caret and selection, real clipboard
pastes, reload persistence, windowed rendering, and keystroke-to-frame
latency on a 2,000-line document. Set `CHROME_PATH` if Playwright should
use a system Chrome instead of its own download.

## Known limitations

- The tokenizer is regex and state driven, not a parser. `${…}` inside a
  template literal is highlighted as part of the string, and a regex literal
  is read as division.
- Scopes are approximated by brace nesting. Parameters of an arrow function
  with an expression body fall back to the enclosing scope, since there is no
  block to bound them.
- Undo stores whole-buffer snapshots. Simple and exact, but memory grows with
  document size, which is why both the in-memory stack and the persisted copy
  are capped.
- Non-ASCII identifiers tokenize as individual plain characters.
