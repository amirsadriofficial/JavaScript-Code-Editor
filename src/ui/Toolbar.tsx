import type { SuggestionSession, SyntaxIssue, Theme } from '../core'

type Props = {
  theme: Theme
  onToggleTheme: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  issues: SyntaxIssue[]
  suggestions: SuggestionSession | null
}

export function Toolbar({
  theme,
  onToggleTheme,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  issues,
  suggestions,
}: Props) {
  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <span className="toolbar-mark">JS</span>
        <div>
          <h1>Code Editor</h1>
          <p>Tab accepts · Esc dismisses · Alt+] cycles</p>
        </div>
      </div>

      <div className="toolbar-actions">
        {suggestions && (
          <span className="toolbar-chip">
            {suggestions.index + 1}/{suggestions.candidates.length}{' '}
            {suggestions.candidates[suggestions.index]?.label}
          </span>
        )}
        {issues.length > 0 && (
          <span className="toolbar-chip is-warn">
            {issues.length} issue{issues.length > 1 ? 's' : ''}
          </span>
        )}
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo}>
          Redo
        </button>
        <button type="button" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </header>
  )
}
