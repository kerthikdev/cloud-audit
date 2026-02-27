// StatCard — summary metric card used at top of Dashboard
export default function StatCard({ label, value, sub, icon, color = 'var(--accent)', onClick }) {
    return (
        <div
            className="stat-card"
            style={{ cursor: onClick ? 'pointer' : 'default' }}
            onClick={onClick}
        >
            {icon && (
                <div style={{ fontSize: 28, marginBottom: 8, color }}>{icon}</div>
            )}
            <div className="stat-value" style={{ color }}>{value ?? '—'}</div>
            <div className="stat-label">{label}</div>
            {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}
