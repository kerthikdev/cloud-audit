import { useState } from 'react'
import { badge, riskBadge, fmtNum, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

export default function S3Table({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No S3 buckets found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} extraFields={['size_gb']} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>Bucket Name</th><th>Region</th><th>Size</th><th>Objects</th>
                        <th>Lifecycle Policy</th><th>Last Accessed</th>
                        <th>Versioning</th><th>Encryption</th><th>Public Access Blocked</th><th>Risk</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => (
                        <tr key={r.resource_id}>
                            <td>{r.resource_id}</td>
                            <td>{r.region}</td>
                            <td>{r.raw_data?.size_gb != null ? `${r.raw_data.size_gb} GB` : '—'}</td>
                            <td>{r.raw_data?.object_count != null ? fmtNum(r.raw_data.object_count) : '—'}</td>
                            <td>{r.raw_data?.has_lifecycle_policy ? badge('Yes ✓', '#10b981') : badge('None ✗', '#ef4444')}</td>
                            <td>
                                {r.raw_data?.last_accessed_days != null
                                    ? r.raw_data.last_accessed_days > 90
                                        ? badge(`${r.raw_data.last_accessed_days}d ago ⚠`, '#ef4444')
                                        : `${r.raw_data.last_accessed_days}d ago`
                                    : '—'}
                            </td>
                            <td>{r.raw_data?.versioning_enabled ? badge('On', '#10b981') : badge('Off', '#f59e0b')}</td>
                            <td>{r.raw_data?.encryption_enabled ? badge('Yes', '#10b981') : badge('No', '#ef4444')}</td>
                            <td>{r.raw_data?.public_access_blocked ? badge('Yes ✓', '#10b981') : badge('No ✗', '#ef4444')}</td>
                            <td>{riskBadge(r.risk_score)}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            <PaginationBar {...pg} />
        </div>
    )
}
