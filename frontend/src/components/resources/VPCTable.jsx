import { useState } from 'react'
import { badge, riskBadge, stateColor, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

const YesNo = ({ val, good = true }) => (
    <span style={{ color: val === good ? '#10b981' : '#ef4444', fontWeight: 600 }}>
        {val ? '✓ Yes' : '✗ No'}
    </span>
)

const CidrBadge = ({ cidr }) => (
    <span style={{ fontFamily: 'monospace', fontSize: 12, background: 'rgba(99,102,241,0.12)', color: '#818cf8', padding: '2px 7px', borderRadius: 4 }}>
        {cidr}
    </span>
)

export default function VPCTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No VPCs found." />

    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} extraFields={['cidr_block']} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>VPC ID</th>
                        <th>Name</th>
                        <th>CIDR</th>
                        <th>Default?</th>
                        <th>Flow Logs</th>
                        <th>Subnets</th>
                        <th>IGW</th>
                        <th>NAT GW</th>
                        <th>Endpoints</th>
                        <th>Risk</th>
                        <th>Region</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => {
                        const rd = r.raw_data || {}
                        return (
                            <tr key={r.resource_id}>
                                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.resource_id}</td>
                                <td style={{ fontWeight: 600 }}>{r.name !== r.resource_id ? r.name : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                <td><CidrBadge cidr={rd.cidr_block || '—'} /></td>
                                <td>
                                    {rd.is_default
                                        ? <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11 }}>⚠ DEFAULT</span>
                                        : <span style={{ color: '#64748b', fontSize: 11 }}>Custom</span>}
                                </td>
                                <td><YesNo val={rd.flow_logs_enabled} good={true} /></td>
                                <td>
                                    <span title={`${rd.public_subnet_count} public / ${rd.private_subnet_count} private`}>
                                        <strong>{rd.subnet_count || 0}</strong>
                                        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                                            ({rd.public_subnet_count || 0}pub / {rd.private_subnet_count || 0}priv)
                                        </span>
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>{rd.igw_count || 0}</td>
                                <td style={{ textAlign: 'center' }}>{rd.nat_gateway_count || 0}</td>
                                <td style={{ textAlign: 'center' }}>{rd.endpoint_count || 0}</td>
                                <td>{riskBadge(r.risk_score)}</td>
                                <td><span style={{ fontSize: 11 }}>{r.region}</span></td>
                            </tr>
                        )
                    })}</tbody>
                </table>
            </div>
            <PaginationBar {...pg} />
        </div>
    )
}

import { useState } from 'react'
import { badge, Empty } from './shared'
import ResourceFilter from './ResourceFilter'
import { usePagination, PaginationBar } from './Pagination'

const check = ok => ok
    ? <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
    : <span style={{ color: '#ef4444', fontWeight: 700 }}>✗</span>

export default function VPCTable({ items }) {
    const [filtered, setFiltered] = useState(items)
    const pg = usePagination(filtered)
    if (!items.length) return <Empty msg="No VPCs found." />
    return (
        <div>
            <ResourceFilter items={items} onFiltered={setFiltered} />
            <div className="table-wrapper">
                <table>
                    <thead><tr>
                        <th>VPC ID</th>
                        <th>Name</th>
                        <th>Region</th>
                        <th>CIDR</th>
                        <th>Type</th>
                        <th>Flow Logs</th>
                        <th>Subnets</th>
                        <th>IGW</th>
                        <th>NAT GWs</th>
                        <th>Endpoints</th>
                    </tr></thead>
                    <tbody>{pg.paged.map(r => {
                        const d = r.raw_data || {}
                        return (
                            <tr key={r.resource_id}>
                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{r.resource_id}</td>
                                <td style={{ fontWeight: 600, color: '#e2e8f0' }}>
                                    {r.name !== r.resource_id ? r.name : '—'}
                                    {d.is_default && <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: 4, padding: '1px 5px' }}>DEFAULT</span>}
                                </td>
                                <td style={{ fontSize: 12, color: '#94a3b8' }}>{r.region}</td>
                                <td>{badge(d.cidr_block || '—', '#6366f1')}</td>
                                <td>{d.is_default ? badge('Default', '#ef4444') : badge('Custom', '#10b981')}</td>
                                <td>{check(d.flow_logs_enabled)}</td>
                                <td style={{ fontSize: 12 }}>
                                    <span style={{ color: '#10b981' }}>{d.public_subnet_count || 0} pub</span>
                                    {' / '}
                                    <span style={{ color: '#6366f1' }}>{d.private_subnet_count || 0} priv</span>
                                </td>
                                <td style={{ textAlign: 'center', color: d.igw_count > 0 ? '#10b981' : '#64748b' }}>{d.igw_count || 0}</td>
                                <td style={{ textAlign: 'center', color: d.nat_gateway_count > 0 ? '#10b981' : '#64748b' }}>{d.nat_gateway_count || 0}</td>
                                <td style={{ textAlign: 'center', color: d.endpoint_count > 0 ? '#10b981' : '#64748b' }}>{d.endpoint_count || 0}</td>
                            </tr>
                        )
                    })}</tbody>
                </table>
            </div>
            <PaginationBar pg={pg} />
        </div>
    )
}
