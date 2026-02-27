import { useState } from 'react'
import { SEV_COLOR, SEV_EMOJI, badge, Empty } from '../resources/shared'

export default function ViolationsPanel({ violations, sevSummary }) {
    const [filter, setFilter] = useState('ALL')

    const filtered = filter === 'ALL'
        ? violations
        : violations.filter(v => v.severity?.toUpperCase() === filter)

    return (
        <div>
            {/* Severity filter bar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => {
                    const count = s === 'ALL' ? violations.length : (sevSummary?.[s] || 0)
                    const color = s === 'ALL' ? '#6b7280' : SEV_COLOR[s]
                    const active = filter === s
                    return (
                        <button key={s} onClick={() => setFilter(s)} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 14px', borderRadius: 8,
                            border: `1px solid ${active ? color : 'var(--border)'}`,
                            background: active ? `${color}18` : 'transparent',
                            color: active ? color : 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        }}>
                            {s !== 'ALL' && SEV_EMOJI[s]} {s} <span style={{ opacity: 0.7 }}>({count})</span>
                        </button>
                    )
                })}
            </div>

            {filtered.length === 0
                ? <Empty msg="No violations found 🎉" />
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {filtered.map((v, i) => {
                            const color = SEV_COLOR[v.severity?.toUpperCase()] || '#6b7280'
                            return (
                                <div key={v.id || i} style={{
                                    border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`,
                                    borderRadius: 8, padding: '12px 16px', background: `${color}08`,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {badge(v.severity, color)}
                                            <code style={{ fontSize: 12, background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>{v.rule_id}</code>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v.resource_type} · {v.region}</span>
                                        </div>
                                        <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v.resource_id}</code>
                                    </div>
                                    <div style={{ fontSize: 13, marginBottom: 4 }}>{v.message}</div>
                                    {v.remediation && (
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            💡 {v.remediation}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )
            }
        </div>
    )
}
