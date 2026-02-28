/**
 * ErrorBoundary — catches React render errors in child trees.
 * Wraps each page/section so one broken component won't crash the whole app.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary] Caught render error:', error, info)
    }

    reset = () => this.setState({ hasError: false, error: null })

    render() {
        if (!this.state.hasError) return this.props.children

        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '60px 20px', textAlign: 'center',
                border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12,
                background: 'rgba(239,68,68,0.04)', margin: '16px 0',
            }}>
                <AlertTriangle size={36} color="#ef4444" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                    Something went wrong
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 420, marginBottom: 20 }}>
                    {this.state.error?.message || 'An unexpected error occurred rendering this section.'}
                </div>
                <button
                    onClick={this.reset}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 20px', borderRadius: 8,
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                        color: '#fca5a5', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                >
                    <RefreshCw size={14} /> Try Again
                </button>
            </div>
        )
    }
}
