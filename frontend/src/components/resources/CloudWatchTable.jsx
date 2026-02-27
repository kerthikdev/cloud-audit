import { badge, riskBadge, fmtNum, Empty } from './shared'

function retentionBadge(days) {
    if (!days) return badge('Never ⚠', '#ef4444')
    const color = days <= 30 ? '#10b981' : days <= 90 ? '#f59e0b' : '#6366f1'
    return badge(`${days}d`, color)
}

function alarmStateBadge(state) {
    const colors = { OK: '#10b981', ALARM: '#ef4444', INSUFFICIENT_DATA: '#f59e0b' }
    return badge(state || '—', colors[state] || '#6b7280')
}

export default function CloudWatchTable({ items }) {
    if (!items.length) return <Empty msg="No CloudWatch resources found." />

    const logGroups = items.filter(r => r.raw_data?.resource_subtype === 'log_group' || r.raw_data?.retention_days !== undefined)
    const alarms = items.filter(r => r.raw_data?.resource_subtype === 'alarm' || r.raw_data?.state !== undefined && r.raw_data?.retention_days === undefined)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Log Groups */}
            {logGroups.length > 0 && (
                <div>
                    <div style={{ padding: '8px 0 10px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Log Groups</div>
                    <div className="table-wrapper">
                        <table>
                            <thead><tr>
                                <th>Log Group</th>
                                <th>Region</th>
                                <th>Retention</th>
                                <th>Size (MB)</th>
                                <th>Risk</th>
                            </tr></thead>
                            <tbody>{logGroups.map(r => {
                                const d = r.raw_data || {}
                                return (
                                    <tr key={r.resource_id}>
                                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.name || r.resource_id}</td>
                                        <td style={{ fontSize: 12 }}>{r.region}</td>
                                        <td>{retentionBadge(d.retention_days)}</td>
                                        <td style={{ fontSize: 12 }}>{d.size_mb != null ? `${d.size_mb.toFixed(1)} MB` : '—'}</td>
                                        <td>{riskBadge(r.risk_score)}</td>
                                    </tr>
                                )
                            })}</tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Alarms */}
            {alarms.length > 0 && (
                <div>
                    <div style={{ padding: '8px 0 10px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Alarms</div>
                    <div className="table-wrapper">
                        <table>
                            <thead><tr>
                                <th>Alarm Name</th>
                                <th>Region</th>
                                <th>State</th>
                                <th>Has Actions</th>
                                <th>Metric</th>
                                <th>Risk</th>
                            </tr></thead>
                            <tbody>{alarms.map(r => {
                                const d = r.raw_data || {}
                                return (
                                    <tr key={r.resource_id}>
                                        <td style={{ fontSize: 13, fontWeight: 600 }}>{r.name || r.resource_id}</td>
                                        <td style={{ fontSize: 12 }}>{r.region}</td>
                                        <td>{alarmStateBadge(d.state)}</td>
                                        <td>{d.has_actions ? badge('Yes ✓', '#10b981') : badge('None ⚠', '#ef4444')}</td>
                                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.metric_name || '—'}</td>
                                        <td>{riskBadge(r.risk_score)}</td>
                                    </tr>
                                )
                            })}</tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
