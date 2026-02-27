export default function DailySparkline({ trend }) {
    if (!trend?.length) return null
    const W = 560, H = 100, PAD = 24
    const amounts = trend.map(d => d.amount)
    const minA = Math.min(...amounts)
    const maxA = Math.max(...amounts)
    const range = maxA - minA || 1

    const px = (i) => PAD + (i / (trend.length - 1)) * (W - PAD * 2)
    const py = (a) => H - PAD - ((a - minA) / range) * (H - PAD * 2)

    const points = trend.map((d, i) => `${px(i)},${py(d.amount)}`).join(' ')
    const areaPoints = [
        `${PAD},${H - PAD}`,
        ...trend.map((d, i) => `${px(i)},${py(d.amount)}`),
        `${W - PAD},${H - PAD}`,
    ].join(' ')

    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 10 }}>
                DAILY SPEND — LAST 14 DAYS
            </div>
            <div style={{ overflowX: 'auto' }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: H, display: 'block' }}>
                    <defs>
                        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                        </linearGradient>
                    </defs>
                    <polygon points={areaPoints} fill="url(#sparkGrad)" />
                    <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    {trend.map((d, i) => (
                        <g key={i}>
                            <circle cx={px(i)} cy={py(d.amount)} r={3} fill="#3b82f6" />
                            <title>{d.date}: ${d.amount.toLocaleString()}</title>
                        </g>
                    ))}
                    <text x={PAD} y={H - 6} fontSize={9} fill="var(--text-secondary)" textAnchor="middle">{trend[0]?.date?.slice(5)}</text>
                    <text x={W - PAD} y={H - 6} fontSize={9} fill="var(--text-secondary)" textAnchor="middle">{trend[trend.length - 1]?.date?.slice(5)}</text>
                    <text x={W - PAD + 2} y={py(maxA) + 4} fontSize={9} fill="#3b82f6" textAnchor="start">${maxA.toLocaleString()}</text>
                </svg>
            </div>
        </div>
    )
}
