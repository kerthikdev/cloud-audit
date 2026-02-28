/**
 * Analytics v2 — enhanced with:
 *   - Interactive SVG bar charts (violations by type, severity breakdown)
 *   - Tag-based cost allocation heatmap
 *   - Violation trend timeline chart
 *   - 30/60/90-day cost forecasting
 */
import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Tag, AlertTriangle, BarChart2, RefreshCw } from 'lucide-react'
import apiClient from '../services/apiClient'

/* ── tiny SVG chart helpers ── */
function BarChart({ items, colorFn, height = 140 }) {
    if (!items || items.length === 0) return <EmptyChart />
    const maxVal = Math.max(...items.map(d => d.value), 1)
    const barW = Math.max(20, Math.floor(560 / items.length) - 6)
    return (
        <svg width="100%" height={height + 36} viewBox={`0 0 ${items.length * (barW + 6)} ${height + 36}`} preserveAspectRatio="xMidYMid meet">
            {items.map((d, i) => {
                const barH = Math.max(2, (d.value / maxVal) * height)
                const x = i * (barW + 6)
                const color = colorFn ? colorFn(d.label) : '#6366f1'
                return (
                    <g key={d.label}>
                        <rect x={x} y={height - barH} width={barW} height={barH} rx={4} fill={color} opacity={0.85} />
                        <text x={x + barW / 2} y={height + 14} textAnchor="middle" fontSize={10} fill="#64748b">
                            {d.label.length > 8 ? d.label.slice(0, 7) + '…' : d.label}
                        </text>
                        <text x={x + barW / 2} y={height - barH - 4} textAnchor="middle" fontSize={10} fill="#e2e8f0" fontWeight="bold">
                            {d.value}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}

function LineChart({ data, valueKey = 'value', width = 560, height = 100, color = '#6366f1', projected = false }) {
    if (!data || data.length < 2) return <EmptyChart />
    const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1)
    const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * (width - 20) + 10
        const y = height - 8 - ((d[valueKey] || 0) / maxVal) * (height - 20)
        return { x, y, ...d }
    })
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray={projected ? '6 4' : undefined}
                strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={color} />)}
        </svg>
    )
}

function EmptyChart() {
    return (
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 13, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
            Not enough scan data yet
        </div>
    )
}

function Card({ title, subtitle, children, style = {} }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 16, padding: 24, ...style
        }}>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0' }}>{title}</div>
                {subtitle && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{subtitle}</div>}
            </div>
            {children}
        </div>
    )
}

const TYPE_COLORS = {
    EC2: '#3b82f6', EBS: '#10b981', S3: '#f59e0b', RDS: '#8b5cf6', EIP: '#ef4444',
    SNAPSHOT: '#6b7280', LB: '#0ea5e9', NAT: '#14b8a6', Lambda: '#a78bfa',
    IAM: '#f97316', CloudFront: '#84cc16', CloudWatch: '#f43f5e',
}
const SEV_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#3b82f6' }

function typeColor(label) { return TYPE_COLORS[label] || '#6366f1' }
function sevColor(label) { return SEV_COLORS[label] || '#6366f1' }

export default function Analytics() {
    const [forecast, setForecast] = useState(null)
    const [trends, setTrends] = useState(null)
    const [tags, setTags] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const load = async () => {
        setLoading(true)
        setError(null)
        try {
            const [fRes, tRes, tagRes] = await Promise.all([
                apiClient.get('/analytics/forecast'),
                apiClient.get('/analytics/trends'),
                apiClient.get('/analytics/tags').catch(() => ({ data: null })),
            ])
            setForecast(fRes.data)
            setTrends(tRes.data)
            setTags(tagRes.data)
        } catch (e) {
            setError(e.response?.data?.detail || e.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
        const timer = setInterval(load, 60000)
        return () => clearInterval(timer)
    }, [])

    if (loading && !forecast) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#94a3b8' }}>
            Loading analytics…
        </div>
    )

    if (error && !forecast) return (
        <div style={{ padding: '48px', textAlign: 'center', color: '#f87171' }}>
            <AlertTriangle size={36} style={{ marginBottom: 12 }} />
            <div>{error}</div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>Run at least one scan to generate analytics.</div>
            <button onClick={load} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', cursor: 'pointer', fontSize: 13 }}>
                Retry
            </button>
        </div>
    )

    const maxFc = Math.max(forecast?.forecast_30d || 0, forecast?.forecast_60d || 0, forecast?.forecast_90d || 0, 1)
    const trendUp = forecast?.trend === 'increasing'
    const trendDown = forecast?.trend === 'decreasing'

    // Build violation-by-type bars from trends
    const violByType = trends?.violation_by_type
        ? Object.entries(trends.violation_by_type).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
        : []

    const violBySev = trends?.violation_by_severity
        ? Object.entries(trends.violation_by_severity).map(([label, value]) => ({ label, value }))
        : []

    // Timeline for violations count over scan history
    const timeline = (trends?.series || []).map((s, i) => ({
        label: `#${i + 1}`,
        violations: s.total_violations || 0,
        waste: s.total_monthly_waste || 0,
    }))

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e2e8f0', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BarChart2 size={26} color="#6366f1" /> Analytics &amp; Intelligence
                    </h1>
                    <p style={{ color: '#64748b', marginTop: 6, fontSize: 14 }}>
                        Cost waste trends, forecasts, tag allocation, and violation insights
                    </p>
                </div>
                <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
                    <RefreshCw size={13} className={loading ? 'spin' : ''} />Refresh
                </button>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
                {[
                    { icon: DollarSign, label: 'Current Monthly Waste', value: `$${(forecast?.current_monthly_waste || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, sub: `${forecast?.data_points || 0} scans`, color: '#f59e0b' },
                    { icon: TrendingDown, label: 'Savings if Actioned', value: `$${(forecast?.potential_savings_if_actioned || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, sub: `~${forecast?.savings_percentage || 60}% of waste`, color: '#10b981' },
                    { icon: trendUp ? TrendingUp : TrendingDown, label: 'Cost Trend', value: trendUp ? '↑ Increasing' : trendDown ? '↓ Decreasing' : '→ Stable', sub: `${forecast?.slope_per_period >= 0 ? '+' : ''}$${(forecast?.slope_per_period || 0).toFixed(2)} per scan`, color: trendUp ? '#ef4444' : trendDown ? '#10b981' : '#94a3b8' },
                    { icon: AlertTriangle, label: 'Avg Violations/Scan', value: trends?.summary?.avg_violations?.toFixed(0) || '0', sub: `over ${trends?.scan_count || 0} scans`, color: '#f97316' },
                    { icon: Tag, label: 'Untagged Resources', value: tags ? `${tags.untagged_percentage}%` : '—', sub: tags ? `${tags.untagged_count} of ${tags.total_resources} resources` : 'Run a scan', color: tags?.untagged_percentage > 50 ? '#ef4444' : '#8b5cf6' },
                ].map(k => (
                    <div key={k.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '18px 22px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748b', fontSize: 11, marginBottom: 10 }}>
                            <k.icon size={12} />{k.label}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>{k.sub}</div>
                    </div>
                ))}
            </div>

            {/* Row 1: Forecast bars + cost timeline */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                <Card title="Cost Forecast (Linear Projection)" subtitle="Based on scan history trend">
                    {forecast?.data_points >= 2 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {[
                                { label: '30-Day Forecast', value: forecast.forecast_30d, color: '#6366f1' },
                                { label: '60-Day Forecast', value: forecast.forecast_60d, color: '#0ea5e9' },
                                { label: '90-Day Forecast', value: forecast.forecast_90d, color: '#8b5cf6' },
                            ].map(fc => (
                                <div key={fc.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                        <span style={{ color: '#94a3b8' }}>{fc.label}</span>
                                        <span style={{ color: fc.color, fontWeight: 700 }}>${fc.value?.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 8 }}>
                                        <div style={{ width: `${(fc.value / maxFc) * 100}%`, height: '100%', borderRadius: 4, background: fc.color, transition: 'width 1s ease' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 24 }}>Run at least 2 scans to enable forecasting.</div>
                    )}
                </Card>

                <Card title="Monthly Waste Timeline" subtitle="Waste per scan over time">
                    <LineChart data={timeline} valueKey="waste" color="#f59e0b" height={140} />
                    {timeline.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginTop: 6 }}>
                            <span>Scan #1</span><span>Latest</span>
                        </div>
                    )}
                </Card>
            </div>

            {/* Row 2: Violations by type (bar chart) + by severity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 20 }}>
                <Card title="Violations by Resource Type" subtitle="Aggregated across all scans">
                    {violByType.length > 0 ? (
                        <BarChart items={violByType} colorFn={typeColor} height={130} />
                    ) : (
                        <EmptyChart />
                    )}
                </Card>

                <Card title="Violations by Severity" subtitle="Distribution across all scans">
                    {violBySev.length > 0 ? (
                        <BarChart items={violBySev} colorFn={sevColor} height={130} />
                    ) : (
                        <EmptyChart />
                    )}
                </Card>
            </div>

            {/* Row 3: Violation count timeline */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                <Card title="Violation Count Over Time" subtitle="Total violations detected per scan">
                    <LineChart data={timeline} valueKey="violations" color="#f97316" height={110} />
                </Card>

                {/* Scan history table */}
                <Card title={`Scan History (${trends?.scan_count || 0} scans)`}>
                    {trends?.series?.length ? (
                        <div className="table-wrapper" style={{ maxHeight: 220, overflowY: 'auto' }}>
                            <table>
                                <thead><tr>
                                    <th>#</th><th>Date</th><th>Resources</th><th>Violations</th><th>Critical</th><th>Waste/mo</th>
                                </tr></thead>
                                <tbody>
                                    {trends.series.slice().reverse().map((row, i) => (
                                        <tr key={i}>
                                            <td style={{ color: '#64748b' }}>#{row.scan_index + 1}</td>
                                            <td style={{ fontSize: 11, color: '#94a3b8' }}>{row.started_at?.slice(0, 16).replace('T', ' ')}</td>
                                            <td style={{ fontWeight: 600 }}>{row.total_resources}</td>
                                            <td style={{ color: '#f59e0b' }}>{row.total_violations}</td>
                                            <td style={{ color: '#ef4444' }}>{row.critical_violations}</td>
                                            <td style={{ color: '#10b981', fontWeight: 600 }}>${row.total_monthly_waste?.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 24 }}>Run multiple scans to see history.</div>
                    )}
                </Card>
            </div>

            {/* Tag cost allocation */}
            {tags && tags.groups?.length > 0 && (
                <Card title="Tag-Based Cost Allocation" subtitle={`${tags.untagged_percentage}% of resources are untagged`}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                        {tags.groups.slice(0, 12).map(g => {
                            const maxSavings = Math.max(...tags.groups.map(x => x.estimated_monthly_savings), 0.01)
                            const pct = (g.estimated_monthly_savings / maxSavings) * 100
                            const isUntagged = g.tag_value === 'Untagged'
                            return (
                                <div key={g.tag_value} style={{
                                    padding: '14px 16px', borderRadius: 10,
                                    background: isUntagged ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${isUntagged ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)'}`,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ fontWeight: 700, fontSize: 13, color: isUntagged ? '#f87171' : '#e2e8f0', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <Tag size={11} color={isUntagged ? '#f87171' : '#64748b'} />
                                            {g.tag_value}
                                        </span>
                                        {g.estimated_monthly_savings > 0 && (
                                            <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700 }}>~${g.estimated_monthly_savings.toFixed(2)}/mo</span>
                                        )}
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 3, height: 5, marginBottom: 8 }}>
                                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: isUntagged ? '#ef4444' : '#6366f1', transition: 'width 0.8s ease' }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
                                        <span>{g.resource_count} resources</span>
                                        <span style={{ color: g.violation_count > 0 ? '#f59e0b' : '#10b981' }}>
                                            {g.violation_count} violations
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </Card>
            )}
        </div>
    )
}
