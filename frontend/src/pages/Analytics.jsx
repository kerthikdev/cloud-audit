import { useState, useEffect } from 'react'
import apiClient from '../services/apiClient'

const TREND_COLOR = '#6366f1'
const WASTE_COLOR = '#f59e0b'

function Sparkline({ data, width = 200, height = 50, color = '#6366f1' }) {
    if (!data || data.length < 2) return <div style={{ width, height, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }} />
    const maxVal = Math.max(...data.map(d => d.waste), 1)
    const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * (width - 8) + 4
        const y = height - 4 - ((d.waste / maxVal) * (height - 8))
        return `${x},${y}`
    }).join(' ')
    return (
        <svg width={width} height={height} style={{ overflow: 'visible' }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {data.map((d, i) => {
                const x = (i / (data.length - 1)) * (width - 8) + 4
                const y = height - 4 - ((d.waste / maxVal) * (height - 8))
                return <circle key={i} cx={x} cy={y} r="3" fill={color} />
            })}
        </svg>
    )
}

function ForecastBar({ label, value, max, color }) {
    const w = max > 0 ? (value / max) * 100 : 0
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#94a3b8' }}>{label}</span>
                <span style={{ color, fontWeight: 700 }}>${value?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', height: '8px' }}>
                <div style={{
                    width: `${w}%`, height: '100%', borderRadius: '4px',
                    background: color, transition: 'width 1s ease',
                }} />
            </div>
        </div>
    )
}

function TrendTable({ series }) {
    if (!series || series.length === 0) return (
        <div style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', padding: '24px' }}>
            No historical trend data yet. Run multiple scans to see trends.
        </div>
    )
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Scan', 'Date', 'Resources', 'Violations', 'Critical', 'Monthly Waste'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {series.slice().reverse().map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>#{row.scan_index + 1}</td>
                        <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{row.started_at?.slice(0, 16).replace('T', ' ') || '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{row.total_resources}</td>
                        <td style={{ padding: '8px 12px', color: '#f59e0b' }}>{row.total_violations}</td>
                        <td style={{ padding: '8px 12px', color: '#ef4444' }}>{row.critical_violations}</td>
                        <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 600 }}>${row.total_monthly_waste?.toFixed(2)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

export default function Analytics() {
    const [forecast, setForecast] = useState(null)
    const [trends, setTrends] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const [fRes, tRes] = await Promise.all([
                    apiClient.get('/analytics/forecast'),
                    apiClient.get('/analytics/trends'),
                ])
                setForecast(fRes.data)
                setTrends(tRes.data)
            } catch (e) {
                setError(e.response?.data?.detail || e.message)
            } finally {
                setLoading(false)
            }
        }
        load()
        const timer = setInterval(load, 60000)
        return () => clearInterval(timer)
    }, [])

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#94a3b8', fontSize: '16px' }}>
            Loading analytics…
        </div>
    )

    if (error) return (
        <div style={{ padding: '48px', textAlign: 'center', color: '#f87171' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠</div>
            <div style={{ fontSize: '16px' }}>{error}</div>
            <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '8px' }}>Run at least one scan to generate analytics.</div>
        </div>
    )

    const maxForecast = Math.max(forecast?.forecast_30d || 0, forecast?.forecast_60d || 0, forecast?.forecast_90d || 0, 1)
    const trendUp = forecast?.trend === 'increasing'
    const trendDown = forecast?.trend === 'decreasing'

    const allHistorical = [
        ...(forecast?.historical || []),
        ...(forecast?.projection || []).map(p => ({ ...p, projected: true })),
    ]

    return (
        <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '28px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Analytics & Forecasting</h1>
                <p style={{ color: '#94a3b8', marginTop: '6px', fontSize: '15px' }}>
                    Cost waste trends, 30/60/90-day projections, and savings opportunities
                </p>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
                {[
                    {
                        label: 'Current Monthly Waste',
                        value: `$${(forecast?.current_monthly_waste || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        sub: `${forecast?.data_points || 0} scan${forecast?.data_points !== 1 ? 's' : ''}`,
                        color: '#f59e0b',
                        icon: '💸',
                    },
                    {
                        label: 'Savings if Actioned',
                        value: `$${(forecast?.potential_savings_if_actioned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        sub: `~${forecast?.savings_percentage || 60}% of waste`,
                        color: '#10b981',
                        icon: '✅',
                    },
                    {
                        label: 'Trend',
                        value: trendUp ? '↑ Increasing' : trendDown ? '↓ Decreasing' : '→ Stable',
                        sub: `${(forecast?.slope_per_period || 0) > 0 ? '+' : ''}$${(forecast?.slope_per_period || 0).toFixed(2)} per scan`,
                        color: trendUp ? '#ef4444' : trendDown ? '#10b981' : '#94a3b8',
                        icon: trendUp ? '⚠️' : trendDown ? '🎉' : '📊',
                    },
                    {
                        label: 'Avg Monthly Waste',
                        value: `$${(trends?.summary?.avg_monthly_waste || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        sub: `${trends?.summary?.avg_violations?.toFixed(0) || 0} avg violations/scan`,
                        color: '#8b5cf6',
                        icon: '📈',
                    },
                ].map(k => (
                    <div key={k.label} style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '14px', padding: '20px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
                            <span>{k.icon}</span>{k.label}
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{k.sub}</div>
                    </div>
                ))}
            </div>

            {/* Forecast bars + sparkline */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
                {/* Forecast */}
                <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px', padding: '24px',
                }}>
                    <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '20px', fontSize: '15px' }}>
                        Projected Waste (Linear Forecast)
                    </div>
                    {forecast?.data_points >= 2 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <ForecastBar label="30-Day Forecast" value={forecast.forecast_30d} max={maxForecast} color="#6366f1" />
                            <ForecastBar label="60-Day Forecast" value={forecast.forecast_60d} max={maxForecast} color="#0ea5e9" />
                            <ForecastBar label="90-Day Forecast" value={forecast.forecast_90d} max={maxForecast} color="#8b5cf6" />
                        </div>
                    ) : (
                        <div style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', padding: '24px' }}>
                            Run at least 2 scans to enable forecasting.
                        </div>
                    )}
                </div>

                {/* Sparkline chart */}
                <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px', padding: '24px',
                }}>
                    <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '8px', fontSize: '15px' }}>
                        Monthly Waste Over Time
                    </div>
                    <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '16px' }}>
                        Historical (solid) · Projected (dashed region)
                    </div>
                    <div style={{ position: 'relative' }}>
                        {allHistorical.length > 1 ? (
                            <Sparkline data={allHistorical} width={'100%'} height={120} color={WASTE_COLOR} />
                        ) : (
                            <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                Not enough data
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Trend table */}
            <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px', padding: '24px',
            }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '16px', fontSize: '15px' }}>
                    Scan History ({trends?.scan_count || 0} scans)
                </div>
                <TrendTable series={trends?.series || []} />
            </div>
        </div>
    )
}
