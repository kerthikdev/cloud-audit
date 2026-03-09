import { useState } from 'react'
import { badge, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

const check = ok => ok
    ? <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
    : <span style={{ color: '#ef4444', fontWeight: 700 }}>✗</span>

export default function Route53Table({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No Route 53 hosted zones found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>Domain Name</th>
                        <th>Zone ID</th>
                        <th>Type</th>
                        <th>Records</th>
                        <th>Query Logging</th>
                        <th>DNSSEC</th>
                        <th>VPCs</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => {
                        const d = r.raw_data || {}
                        const isPrivate = d.is_private
                        return (
                            <tr key={r.resource_id}>
                                <td style={{ fontWeight: 700, color: '#e2e8f0' }}>{r.name}</td>
                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{r.resource_id}</td>
                                <td>
                                    {isPrivate
                                        ? badge('Private', '#8b5cf6')
                                        : badge('Public', '#0ea5e9')}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{d.record_count || 0}</td>
                                <td>{check(d.query_logging)}</td>
                                <td>{isPrivate ? <span style={{ color: '#64748b' }}>N/A</span> : check(d.dnssec_enabled)}</td>
                                <td style={{ textAlign: 'center', color: d.vpc_count > 0 ? '#10b981' : '#64748b' }}>
                                    {isPrivate ? d.vpc_count || 0 : '—'}
                                </td>
                            </tr>
                        )
                    })}</tbody>
                </table>
            </div>
            <PaginationBar pg={pg} />
        </div>
    )
}
