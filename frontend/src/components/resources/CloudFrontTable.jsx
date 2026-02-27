import { badge, riskBadge, fmtNum, Empty } from './shared'

export default function CloudFrontTable({ items }) {
    if (!items.length) return <Empty msg="No CloudFront distributions found." />
    return (
        <div className="table-wrapper">
            <table>
                <thead><tr>
                    <th>Distribution ID</th>
                    <th>Domain</th>
                    <th>Status</th>
                    <th>WAF</th>
                    <th>HTTPS Only</th>
                    <th>Geo Restriction</th>
                    <th>Logging</th>
                    <th>Requests (30d)</th>
                    <th>Risk</th>
                </tr></thead>
                <tbody>{items.map(r => {
                    const d = r.raw_data || {}
                    return (
                        <tr key={r.resource_id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.resource_id}</td>
                            <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {d.domain_name || r.name || '—'}
                            </td>
                            <td>{badge(d.status || r.state || 'Unknown', d.status === 'Deployed' ? '#10b981' : '#f59e0b')}</td>
                            <td>{d.waf_enabled ? badge('Enabled ✓', '#10b981') : badge('None ⚠', '#ef4444')}</td>
                            <td>{d.https_only ? badge('Yes ✓', '#10b981') : badge('No ⚠', '#ef4444')}</td>
                            <td>{d.geo_restriction ? badge(d.geo_restriction, '#6366f1') : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>None</span>}</td>
                            <td>{d.logging_enabled ? badge('On ✓', '#10b981') : badge('Off', '#f59e0b')}</td>
                            <td style={{ fontSize: 12 }}>{fmtNum(d.requests_30d)}</td>
                            <td>{riskBadge(r.risk_score)}</td>
                        </tr>
                    )
                })}</tbody>
            </table>
        </div>
    )
}
