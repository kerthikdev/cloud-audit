import { badge, riskBadge, stateColor, Empty } from './shared'

export default function LBTable({ items }) {
    if (!items.length) return <Empty msg="No Load Balancers found." />
    return (
        <div className="table-wrapper">
            <table>
                <thead><tr>
                    <th>Name</th><th>Type</th><th>State</th><th>Scheme</th>
                    <th>Listeners</th><th>Avg Req/Day</th><th>Risk</th><th>Region</th>
                </tr></thead>
                <tbody>{items.map(r => (
                    <tr key={r.resource_id}>
                        <td>{r.name || '—'}</td>
                        <td>{r.raw_data?.lb_type === 'ALB' ? badge('ALB', '#3b82f6') : badge('NLB', '#8b5cf6')}</td>
                        <td>{badge(r.state, stateColor(r.state))}</td>
                        <td style={{ fontSize: 12 }}>{r.raw_data?.scheme || '—'}</td>
                        <td>
                            {r.raw_data?.listener_count === 0
                                ? badge('None ✗', '#ef4444')
                                : r.raw_data?.listener_count ?? '—'}
                        </td>
                        <td>
                            {r.raw_data?.avg_request_count_per_day != null
                                ? r.raw_data.avg_request_count_per_day < 10
                                    ? badge(`${r.raw_data.avg_request_count_per_day.toFixed(1)} ⚠`, '#f97316')
                                    : r.raw_data.avg_request_count_per_day.toFixed(1)
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
