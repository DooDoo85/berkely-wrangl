import { Component } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// ErrorBoundary — catches React render errors and shows a friendly UI
// instead of letting the page go blank.
//
// IMPORTANT: this is the ONLY way to recover from a render-time exception
// in React. Without it, any uncaught throw in a render path unmounts the
// component tree and the user sees a white screen with no clue what
// happened.
//
// Usage: wrap any route component:
//   <ErrorBoundary>
//     <ActivityLog />
//   </ErrorBoundary>
//
// The "where" prop is shown in the error UI so users can tell us which
// page they were on when the error happened.
// ═══════════════════════════════════════════════════════════════════════

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log to console so we can see what crashed in DevTools.
    // In production this also gets captured by any error-tracking service
    // (Sentry, etc.) that's hooked into window.onerror.
    console.error('[ErrorBoundary]', this.props.where || 'unknown', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    // Hard reload — drops any corrupted in-memory state
    window.location.reload()
  }

  handleReset = () => {
    // Soft reset — try to re-render without reloading the page
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const errMsg = this.state.error?.message || String(this.state.error)
    const stack  = this.state.errorInfo?.componentStack || this.state.error?.stack || ''

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="card p-6 max-w-lg w-full">
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(220, 38, 38, 0.10)', color: '#dc2626' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-ink-strong">Something went wrong</h2>
              <p className="text-sm text-ink-mid mt-0.5">
                This page hit an error and couldn't render.
                {this.props.where && <> Location: <span className="font-mono">{this.props.where}</span>.</>}
              </p>
            </div>
          </div>

          <details className="mb-4">
            <summary className="text-xs font-medium text-ink-mid cursor-pointer hover:text-ink-strong">
              Show technical details
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs font-mono text-stone-700 overflow-auto max-h-48">
              <div className="font-semibold mb-1">{errMsg}</div>
              {stack && <pre className="whitespace-pre-wrap text-[10px] text-stone-500">{stack}</pre>}
            </div>
          </details>

          <div className="flex gap-2">
            <button
              onClick={this.handleReset}
              className="btn-ghost flex-1 text-sm"
            >
              Try again
            </button>
            <button
              onClick={this.handleReload}
              className="btn-primary flex-1 text-sm"
            >
              Reload page
            </button>
          </div>

          <p className="text-[11px] text-ink-muted mt-3 text-center">
            If this keeps happening, the error details above will help us fix it.
          </p>
        </div>
      </div>
    )
  }
}
