import { useState } from 'react'
import { badge, riskBadge, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

const check = ok => ok
    ? <span style={{ color: '#10b981', fontWeight: 700 }}>✓ Yes</span>
    : <span style={{ color: '#ef4444', fontWeight: 700 }}>✗ No</span>

const billingBadge = mode => mode === 'PAY_PER_REQUEST'
    ? badge('On-Demand', '#10b981')
    : badge('Provisioned', '#6366f1')

export default function DynamoDBTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No DynamoDB tables found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>Table Name</th>
                        <th>Region</th>
                        <th>Status</th>
                        <th>Billing</th>
                        <th>Items</th>
                        <th>Size</th>
                        <th>PITR</th>
                        <th>Encryption</th>
                        <th>Replicas</th>
                        <th>Risk</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => {
                        const d = r.raw_data || {}
                        return (
                            <tr key={r.resource_id}>
                                <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{r.name}</td>
                                <td style={{ fontSize: 12, color: '#94a3b8' }}>{r.region}</td>
                                <td>{badge(d.status || 'ACTIVE', d.status === 'ACTIVE' ? '#10b981' : '#f59e0b')}</td>
                                <td>{billingBadge(d.billing_mode)}</td>
                                <td style={{ fontSize: 12 }}>{(d.item_count || 0).toLocaleString()}</td>
                                <td style={{ fontSize: 12 }}>{d.size_mb != null ? `${d.size_mb} MB` : '—'}</td>
                                <td>{check(d.pitr_enabled)}</td>
                                <td>{check(d.sse_enabled)}</td>
                                <td style={{ textAlign: 'center', color: d.replica_count > 0 ? '#10b981' : '#64748b' }}>
                                    {d.replica_count || 0}
                                </td>
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
