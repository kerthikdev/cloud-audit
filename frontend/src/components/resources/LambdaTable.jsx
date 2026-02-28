import { useState } from 'react'
import { badge, riskBadge, fmtNum, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

export default function LambdaTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No Lambda functions found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} extraFields={['runtime', 'function_name']} />
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
                    <tbody>{pg.paged.map(r => {
                        const d = r.raw_data || {}
                        return (
                            <tr key={r.resource_id}>
                                <td style={{ fontWeight: 600, fontSize: 13 }}>{r.name || r.resource_id}</td>
                                <td>{d.runtime ? badge(d.runtime, '#6366f1') : '—'}</td>
                                <td style={{ fontSize: 12 }}>{r.region}</td>
                                <td style={{ fontSize: 12 }}>{d.memory_mb != null ? `${d.memory_mb} MB` : '—'}</td>
                                <td style={{ fontSize: 12 }}>{d.timeout_sec != null ? `${d.timeout_sec}s` : '—'}</td>
                                <td style={{ fontSize: 12 }}>{fmtNum(d.invocations_30d)}</td>
                                <td>{d.has_dlq ? badge('Yes ✓', '#10b981') : badge('No', '#ef4444')}</td>
                                <td>{d.tracing_enabled ? badge('Active', '#10b981') : badge('Off', '#f59e0b')}</td>
                                <td>{riskBadge(r.risk_score)}</td>
                                <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.last_modified_days != null ? `${d.last_modified_days}d ago` : '—'}</td>
                            </tr>
                        )
                    })}</tbody>
                </table>
            </div>
            <PaginationBar {...pg} />
        </div>
    )
}
