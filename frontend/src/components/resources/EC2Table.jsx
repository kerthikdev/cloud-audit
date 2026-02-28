import { useState } from 'react'
import { badge, riskBadge, stateColor, fmtDate, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

export default function EC2Table({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No EC2 instances found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} extraFields={['instance_type', 'public_ip']} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>Instance ID</th><th>Name</th><th>State</th><th>Type</th>
                        <th>Region</th><th>Public IP</th><th>Avg CPU</th>
                        <th>In ASG</th><th>Spot Eligible</th><th>RI Candidate</th>
                        <th>Net In</th><th>Net Out</th><th>Risk</th><th>Launched</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => (
                        <tr key={r.resource_id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.resource_id}</td>
                            <td>{r.name || '—'}</td>
                            <td>{badge(r.state, stateColor(r.state))}</td>
                            <td>{r.raw_data?.instance_type || '—'}</td>
                            <td>{r.region}</td>
                            <td>{r.raw_data?.public_ip || '—'}</td>
                            <td>{r.raw_data?.avg_cpu_percent != null ? `${r.raw_data.avg_cpu_percent.toFixed(1)}%` : '—'}</td>
                            <td>{r.raw_data?.in_asg ? badge('Yes ✓', '#10b981') : badge('No', '#f59e0b')}</td>
                            <td>{r.raw_data?.spot_eligible ? badge('Yes', '#3b82f6') : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}</td>
                            <td>{r.raw_data?.ri_candidate ? badge('Candidate', '#8b5cf6') : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}</td>
                            <td style={{ fontSize: 12 }}>{r.raw_data?.network_in_gb != null ? `${r.raw_data.network_in_gb.toFixed(2)} GB` : '—'}</td>
                            <td style={{ fontSize: 12 }}>{r.raw_data?.network_out_gb != null ? `${r.raw_data.network_out_gb.toFixed(2)} GB` : '—'}</td>
                            <td>{riskBadge(r.risk_score)}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(r.raw_data?.launch_time)}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            <PaginationBar {...pg} />
        </div>
    )
}
