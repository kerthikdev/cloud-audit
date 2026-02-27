import { badge, riskBadge, fmtDate, fmtNum, Empty } from './shared'

export default function LambdaTable({ items }) {
    if (!items.length) return <Empty msg="No Lambda functions found." />
    return (
        <div className="table-wrapper">
            <table>
                <thead><tr>
                    <th>Function Name</th>
                    <th>Runtime</th>
                    <th>Region</th>
                    <th>Memory</th>
                    <th>Timeout</th>
                    <th>Invocations (30d)</th>
                    <th>DLQ</th>
                    <th>X-Ray</th>
                    <th>Risk</th>
                    <th>Last Modified</th>
                </tr></thead>
                <tbody>{items.map(r => {
                    const d = r.raw_data || {}
                    return (
                        <tr key={r.resource_id}>
                            <td style={{ fontWeight: 600, fontSize: 13 }}>{r.name || r.resource_id}</td>
                            <td>{d.runtime ? badge(d.runtime, '#6366f1') : '—'}</td>
                            <td style={{ fontSize: 12 }}>{r.region}</td>
                            <td style={{ fontSize: 12 }}>{d.memory_mb != null ? `${d.memory_mb} MB` : '—'}</td>
                            <td style={{ fontSize: 12 }}>{d.timeout_sec != null ? `${d.timeout_sec}s` : '—'}</td>
                            <td style={{ fontSize: 12 }}>{fmtNum(d.invocations_30d)}</td>
                            <td>{d.dlq_arn ? badge('Yes ✓', '#10b981') : badge('No', '#ef4444')}</td>
                            <td>{d.tracing_enabled ? badge('Active', '#10b981') : badge('Off', '#f59e0b')}</td>
                            <td>{riskBadge(r.risk_score)}</td>
                            <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtDate(d.last_modified)}</td>
                        </tr>
                    )
                })}</tbody>
            </table>
        </div>
    )
}
