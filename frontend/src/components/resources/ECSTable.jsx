import { useState } from 'react'
import { badge, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

const check = ok => ok
    ? <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
    : <span style={{ color: '#ef4444', fontWeight: 700 }}>✗</span>

function healthBadge(desired, running) {
    if (desired === 0) return badge('Scaled to 0', '#6b7280')
    if (running >= desired) return badge('Healthy', '#10b981')
    if (running === 0) return badge('Down', '#ef4444')
    return badge(`${running}/${desired}`, '#f59e0b')
}

export default function ECSTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const [expanded, setExpanded] = useState(null)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No ECS clusters found." />

    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>Cluster</th>
                        <th>Region</th>
                        <th>Status</th>
                        <th>Running Tasks</th>
                        <th>Services</th>
                        <th>Unhealthy</th>
                        <th>Insights</th>
                        <th>Fargate</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => {
                        const d = r.raw_data || {}
                        const isExpanded = expanded === r.resource_id
                        return (
                            <>
                                <tr
                                    key={r.resource_id}
                                    onClick={() => setExpanded(isExpanded ? null : r.resource_id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td style={{ fontWeight: 700, color: '#e2e8f0' }}>
                                        <span style={{ marginRight: 6, color: '#64748b' }}>{isExpanded ? '▼' : '▶'}</span>
                                        {r.name}
                                    </td>
                                    <td style={{ fontSize: 12, color: '#94a3b8' }}>{r.region}</td>
                                    <td>{badge(d.status || 'ACTIVE', d.status === 'ACTIVE' ? '#10b981' : '#f59e0b')}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                                        {d.running_tasks || 0}
                                        {d.pending_tasks > 0 && <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 4 }}>+{d.pending_tasks} pending</span>}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{d.service_count || 0}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        {d.unhealthy_services > 0
                                            ? <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠ {d.unhealthy_services}</span>
                                            : <span style={{ color: '#10b981' }}>—</span>}
                                    </td>
                                    <td>{check(d.container_insights)}</td>
                                    <td>{check(d.has_fargate)}</td>
                                </tr>
                                {isExpanded && d.services?.length > 0 && (
                                    <tr key={`${r.resource_id}-expanded`}>
                                        <td colSpan={8} style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 12px' }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Services</div>
                                            <table style={{ width: '100%' }}>
                                                <thead><tr>
                                                    <th>Service</th>
                                                    <th>Launch Type</th>
                                                    <th>Health</th>
                                                    <th>Desired</th>
                                                    <th>Running</th>
                                                </tr></thead>
                                                <tbody>{d.services.map(svc => (
                                                    <tr key={svc.name}>
                                                        <td style={{ fontSize: 12 }}>{svc.name}</td>
                                                        <td>{badge(svc.launch_type, svc.launch_type === 'FARGATE' ? '#6366f1' : '#0ea5e9')}</td>
                                                        <td>{healthBadge(svc.desired, svc.running)}</td>
                                                        <td style={{ textAlign: 'center', fontSize: 12 }}>{svc.desired}</td>
                                                        <td style={{ textAlign: 'center', fontSize: 12 }}>{svc.running}</td>
                                                    </tr>
                                                ))}</tbody>
                                            </table>
                                        </td>
                                    </tr>
                                )}
                            </>
                        )
                    })}</tbody>
                </table>
            </div>
            <PaginationBar pg={pg} />
        </div>
    )
}
