import { useState } from 'react'
import { badge, riskBadge, stateColor, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

export default function EBSTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No EBS volumes found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} extraFields={['volume_type', 'attached_instance']} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>Volume ID</th><th>State</th><th>Size</th><th>Type</th>
                        <th>Encrypted</th><th>Attached To</th><th>Risk</th><th>Region</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => (
                        <tr key={r.resource_id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.resource_id}</td>
                            <td>{badge(r.state, stateColor(r.state))}</td>
                            <td>{r.raw_data?.size_gb ? `${r.raw_data.size_gb} GB` : '—'}</td>
                            <td>
                                {r.raw_data?.volume_type === 'gp2'
                                    ? <>{r.raw_data.volume_type} {badge('→ gp3', '#f59e0b')}</>
                                    : (r.raw_data?.volume_type || '—')}
                            </td>
                            <td>{r.raw_data?.encrypted ? badge('Yes', '#10b981') : badge('No', '#ef4444')}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.raw_data?.attached_instance || '—'}</td>
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
