import { useState } from 'react'
import { badge, riskBadge, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

export default function SnapshotTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No EBS snapshots found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} extraFields={['ami_id']} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>Snapshot ID</th><th>Name / Description</th><th>Size</th>
                        <th>Age</th><th>AMI Linked</th><th>Estimated Waste</th><th>Risk</th><th>Region</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => (
                        <tr key={r.resource_id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.resource_id}</td>
                            <td>{r.name || '—'}</td>
                            <td>{r.raw_data?.size_gb ? `${r.raw_data.size_gb} GB` : '—'}</td>
                            <td>
                                {r.raw_data?.age_days != null
                                    ? r.raw_data.age_days > 30
                                        ? badge(`${r.raw_data.age_days}d ⚠`, '#f59e0b')
                                        : `${r.raw_data.age_days}d`
                                    : '—'}
                            </td>
                            <td>{r.raw_data?.ami_id ? badge('Yes ✓', '#10b981') : badge('Orphaned', '#ef4444')}</td>
                            <td>
                                {!r.raw_data?.ami_id && r.raw_data?.size_gb
                                    ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>~${(r.raw_data.size_gb * 0.05).toFixed(2)}/mo</span>
                                    : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
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
