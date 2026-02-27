import { DollarSign } from 'lucide-react'
import DailySparkline from './DailySparkline'

export default function CostSummaryCard({ costData }) {
    if (!costData?.summary) return null
    const {
        total_monthly_cost, estimated_monthly_waste, waste_percentage,
        top_services, period, daily_trend, waste_by_service, cost_by_tag,
    } = costData.summary

    return (
        <div className="card" style={{ marginBottom: 24 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DollarSign size={18} color="#10b981" />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>Cost Intelligence</span>
                    {period && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>({period} MTD)</span>}
                </div>
            </div>

            {/* Summary figures */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>
                        ${total_monthly_cost?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '—'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Monthly Cost</div>
                </div>
                <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>
                        ${estimated_monthly_waste?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '—'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        Est. Waste {waste_percentage != null && `(${waste_percentage.toFixed(1)}%)`}
                    </div>
                </div>
            </div>

            {/* Daily sparkline */}
            {daily_trend?.length > 0 && <DailySparkline trend={daily_trend} />}

            {/* Top services */}
            {top_services?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 10 }}>TOP SERVICES BY COST</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {top_services.slice(0, 6).map((svc, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12 }}>{svc.service}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                                    ${svc.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Waste by service */}
            {waste_by_service && Object.keys(waste_by_service).length > 0 && (
                <div>
                    <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>WASTE BY SERVICE</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.entries(waste_by_service).slice(0, 5).map(([svc, amt]) => (
                            <div key={svc} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 12 }}>{svc}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>${Number(amt).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
