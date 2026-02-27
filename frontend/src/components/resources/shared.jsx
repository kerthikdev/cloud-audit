// Shared helpers used across resource table components
export const fmtDate = iso => iso ? new Date(iso).toLocaleString() : '—'
export const fmtNum = n => n != null ? Number(n).toLocaleString() : '—'

export const stateColor = s => {
    const m = {
        running: '#10b981', stopped: '#ef4444', available: '#10b981',
        'in-use': '#3b82f6', active: '#10b981', unassociated: '#ef4444',
        associated: '#10b981', completed: '#6b7280',
    }
    return m[s?.toLowerCase()] || '#6b7280'
}

export const SEV_COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#3b82f6' }
export const SEV_EMOJI = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🔵' }

export const badge = (text, color) => (
    <span style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: 12,
        fontSize: 11, fontWeight: 600, background: `${color}22`, color,
        whiteSpace: 'nowrap',
    }}>{text}</span>
)

export function riskBadge(score) {
    if (!score && score !== 0) return null
    const color = score >= 76 ? '#ef4444' : score >= 51 ? '#f97316' : score >= 26 ? '#f59e0b' : score > 0 ? '#3b82f6' : '#10b981'
    const label = score >= 76 ? 'CRITICAL' : score >= 51 ? 'HIGH' : score >= 26 ? 'MEDIUM' : score > 0 ? 'LOW' : 'CLEAN'
    return badge(label, color)
}

export function Empty({ msg }) {
    return (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p style={{ opacity: 0.6 }}>{msg}</p>
        </div>
    )
}
