import { useState } from 'react'
import { badge, riskBadge, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

const check = ok => ok
    ? <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
    : <span style={{ color: '#ef4444', fontWeight: 700 }}>✗</span>

export default function ElastiCacheTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No ElastiCache clusters found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>Cluster ID</th>
                        <th>Region</th>
                        <th>Engine</th>
                        <th>Version</th>
                        <th>Node Type</th>
                        <th>Nodes</th>
                        <th>Multi-AZ</th>
                        <th>TLS</th>
                        <th>At-Rest Enc.</th>
                        <th>Auth</th>
                        <th>Risk</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => {
                        const d = r.raw_data || {}
                        const engineColor = d.engine === 'redis' ? '#ef4444' : '#f59e0b'
                        return (
                            <tr key={r.resource_id}>
                                <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{r.name}</td>
                                <td style={{ fontSize: 12, color: '#94a3b8' }}>{r.region}</td>
                                <td>{badge(d.engine || '—', engineColor)}</td>
                                <td style={{ fontSize: 12 }}>{d.engine_version || '—'}</td>
                                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{d.node_type || '—'}</td>
                                <td style={{ textAlign: 'center' }}>{d.node_count || 1}</td>
                                <td>{check(d.multi_az)}</td>
                                <td>{check(d.in_transit_encryption)}</td>
                                <td>{check(d.at_rest_encryption)}</td>
                                <td>{check(d.auth_enabled)}</td>
                                <td>{riskBadge(r.risk_score)}</td>
                            </tr>
                        )
                    })}</tbody>
                </table>
            </div>
            <PaginationBar pg={pg} />
        </div>
    )
}
