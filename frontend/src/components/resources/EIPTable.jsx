import { useState } from 'react'
import { badge, riskBadge, stateColor, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

export default function EIPTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No Elastic IPs found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} extraFields={['allocation_id', 'instance_id']} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>Public IP</th><th>Allocation ID</th><th>Status</th>
                        <th>Associated Instance</th><th>Estimated Waste</th><th>Risk</th><th>Region</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => (
                        <tr key={r.resource_id}>
                            <td style={{ fontFamily: 'monospace' }}>{r.resource_id}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.raw_data?.allocation_id || '—'}</td>
                            <td>{badge(r.state, stateColor(r.state))}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.raw_data?.instance_id || '—'}</td>
                            <td>
                                {!r.raw_data?.associated
                                    ? <span style={{ color: '#ef4444', fontWeight: 600 }}>~$3.60/mo</span>
                                    : <span style={{ color: 'var(--text-secondary)' }}>$0</span>}
                            </td>
                            <td>{riskBadge(r.risk_score)}</td>
                            <td>{r.region}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            <PaginationBar {...pg} />
        </div>
    )
}
