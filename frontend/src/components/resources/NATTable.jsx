import { badge, riskBadge, stateColor, Empty } from './shared'

export default function NATTable({ items }) {
    if (!items.length) return <Empty msg="No NAT Gateways found." />
    return (
        <div className="table-wrapper">
            <table>
                <thead><tr>
                    <th>NAT Gateway ID</th><th>Name</th><th>State</th>
                    <th>VPC</th><th>Type</th><th>Data Transfer (7d)</th><th>Risk</th><th>Region</th>
                </tr></thead>
                <tbody>{items.map(r => (
                    <tr key={r.resource_id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.resource_id}</td>
                        <td>{r.name || '—'}</td>
                        <td>{badge(r.state, stateColor(r.state))}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.raw_data?.vpc_id || '—'}</td>
                        <td>
                            {r.raw_data?.connectivity_type === 'private'
                                ? badge('Private', '#6b7280')
                                : badge('Public', '#3b82f6')}
                        </td>
                        <td>
                            {r.raw_data?.data_transfer_gb != null
                                ? r.raw_data.data_transfer_gb < 1
                                    ? badge(`${r.raw_data.data_transfer_gb.toFixed(3)} GB ⚠`, '#ef4444')
                                    : `${r.raw_data.data_transfer_gb.toFixed(2)} GB`
                                : '—'}
                        </td>
                        <td>{riskBadge(r.risk_score)}</td>
                        <td>{r.region}</td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    )
}
