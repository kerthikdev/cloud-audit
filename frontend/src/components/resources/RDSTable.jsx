import { useState } from 'react'
import { badge, riskBadge, stateColor, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

export default function RDSTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No RDS instances found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} extraFields={['engine', 'instance_class']} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>DB Identifier</th><th>Engine</th><th>Class</th><th>Status</th>
                        <th>Multi-AZ</th><th>Encrypted</th><th>Publicly Accessible</th>
                        <th>CPU %</th><th>Avg Connections</th><th>Storage Autoscale</th>
                        <th>Risk</th><th>Region</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => (
                        <tr key={r.resource_id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.resource_id}</td>
                            <td>{r.raw_data?.engine || '—'}</td>
                            <td>{r.raw_data?.instance_class || '—'}</td>
                            <td>{badge(r.state || '—', stateColor(r.state))}</td>
                            <td>{r.raw_data?.multi_az ? badge('Yes', '#10b981') : badge('No', '#f59e0b')}</td>
                            <td>{r.raw_data?.storage_encrypted ? badge('Yes', '#10b981') : badge('No', '#ef4444')}</td>
                            <td>{r.raw_data?.publicly_accessible ? badge('Yes ⚠', '#ef4444') : badge('No ✓', '#10b981')}</td>
                            <td>
                                {r.raw_data?.avg_cpu_percent != null
                                    ? r.raw_data.avg_cpu_percent < 20
                                        ? badge(`${r.raw_data.avg_cpu_percent.toFixed(1)}% ⚠`, '#f97316')
                                        : `${r.raw_data.avg_cpu_percent.toFixed(1)}%`
                                    : '—'}
                            </td>
                            <td>
                                {r.raw_data?.avg_connections != null
                                    ? r.raw_data.avg_connections < 5
                                        ? badge(`${r.raw_data.avg_connections.toFixed(1)} ⚠`, '#ef4444')
                                        : r.raw_data.avg_connections.toFixed(1)
                                    : '—'}
                            </td>
                            <td>{r.raw_data?.storage_autoscaling_enabled ? badge('On ✓', '#10b981') : badge('Off', '#f59e0b')}</td>
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
