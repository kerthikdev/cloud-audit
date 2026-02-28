import { badge, riskBadge, Empty } from './shared'

function keyAgeBadge(days) {
    if (days == null || days === 0) return <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>
    const color = days > 90 ? '#ef4444' : days > 60 ? '#f97316' : '#10b981'
    return badge(`${days}d`, color)
}

function activityBadge(days) {
    if (days == null || days === 0) return <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>
    const color = days > 90 ? '#ef4444' : days > 30 ? '#f59e0b' : '#10b981'
    return <span style={{ fontSize: 12, color }}>{days}d ago</span>
}

export default function IAMTable({ items }) {
    if (!items.length) return <Empty msg="No IAM users found." />
    return (
        <div className="table-wrapper">
            <table>
                <thead><tr>
                    <th>Username</th>
                    <th>Type</th>
                    <th>MFA</th>
                    <th>Console Access</th>
                    <th>Access Key Age</th>
                    <th>Wildcard Policy</th>
                    <th>Last Activity</th>
                    <th>Risk</th>
                </tr></thead>
                <tbody>{items.map(r => {
                    // Scanner writes: has_mfa, key_age_days, last_activity_days, has_wildcard_policy, is_root
                    const d = r.raw_data || {}
                    const isRoot = d.is_root || d.resource_subtype === 'root'
                    return (
                        <tr key={r.resource_id} style={isRoot ? { background: 'rgba(239,68,68,0.06)' } : {}}>
                            <td style={{ fontWeight: 600, fontSize: 13 }}>
                                {r.name || d.username || r.resource_id}
                                {isRoot && <span style={{ marginLeft: 6, fontSize: 10, color: '#ef4444', fontWeight: 700, background: 'rgba(239,68,68,0.15)', padding: '1px 6px', borderRadius: 4 }}>ROOT</span>}
                            </td>
                            <td>{badge(isRoot ? 'Root' : 'IAM User', isRoot ? '#ef4444' : '#6366f1')}</td>
                            <td>{d.has_mfa ? badge('Enabled ✓', '#10b981') : badge('None ⚠', '#ef4444')}</td>
                            <td>{d.has_console_access ? badge('Yes', '#f59e0b') : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No</span>}</td>
                            <td>{keyAgeBadge(d.key_age_days)}</td>
                            <td>{d.has_wildcard_policy ? badge('⚠ Wildcard', '#ef4444') : badge('OK', '#10b981')}</td>
                            <td>{activityBadge(d.last_activity_days)}</td>
                            <td>{riskBadge(r.risk_score)}</td>
                        </tr>
                    )
                })}</tbody>
            </table>
        </div>
    )
}
