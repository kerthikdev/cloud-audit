import { useState, useEffect } from 'react'
import apiClient from '../services/apiClient'

const FRAMEWORK_COLORS = {
    'CIS-AWS-1.4': '#6366f1',
    'SOC2': '#0ea5e9',
    'PCI-DSS': '#ec4899',
    'NIST-800-53': '#f59e0b',
    'FinOps': '#10b981',
    'Governance': '#8b5cf6',
}

const SEVERITY_COLORS = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#eab308',
    LOW: '#22c55e',
}

function ScoreRing({ score, color, size = 80 }) {
    const r = size / 2 - 8
    const circumference = 2 * Math.PI * r
    const offset = circumference - (score / 100) * circumference
    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={color} strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
        </svg>
    )
}

function FrameworkCard({ name, data }) {
    const color = FRAMEWORK_COLORS[name] || '#6366f1'
    const score = data?.score ?? 0
    const scoreColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            position: 'relative',
            overflow: 'hidden',
        }}>
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: '3px', background: color,
            }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#e2e8f0' }}>{name}</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        {data?.pass ?? 0} pass / {data?.fail ?? 0} fail of {data?.total ?? 0} rules
                    </div>
                </div>
                <div style={{ position: 'relative' }}>
                    <ScoreRing score={score} color={scoreColor} size={64} />
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: 700, color: scoreColor,
                    }}>
                        {score}%
                    </div>
                </div>
            </div>
            {/* Progress bar */}
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '6px' }}>
                <div style={{
                    width: `${score}%`, height: '100%', borderRadius: '4px',
                    background: scoreColor, transition: 'width 1s ease',
                }} />
            </div>
            {data?.critical_fails > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: '8px', padding: '6px 10px', fontSize: '12px',
                }}>
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠ {data.critical_fails} critical</span>
                    <span style={{ color: '#94a3b8' }}>violation{data.critical_fails !== 1 ? 's' : ''}</span>
                </div>
            )}
        </div>
    )
}

function RadarChart({ frameworks, scores }) {
    const cx = 160, cy = 160, r = 120
    const n = frameworks.length
    const points = frameworks.map((_, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2
        return {
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle),
            sx: cx + (scores[i] / 100) * r * Math.cos(angle),
            sy: cy + (scores[i] / 100) * r * Math.sin(angle),
            labelX: cx + (r + 24) * Math.cos(angle),
            labelY: cy + (r + 24) * Math.sin(angle),
        }
    })
    const gridLevels = [0.25, 0.50, 0.75, 1.00]

    return (
        <svg viewBox="0 0 320 320" width="100%" height="320" style={{ maxWidth: '320px' }}>
            {/* Grid rings */}
            {gridLevels.map(level => (
                <polygon key={level}
                    points={frameworks.map((_, i) => {
                        const angle = (2 * Math.PI * i) / n - Math.PI / 2
                        return `${cx + level * r * Math.cos(angle)},${cy + level * r * Math.sin(angle)}`
                    }).join(' ')}
                    fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                />
            ))}
            {/* Axes */}
            {points.map((p, i) => (
                <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            ))}
            {/* Score polygon */}
            <polygon
                points={points.map(p => `${p.sx},${p.sy}`).join(' ')}
                fill="rgba(99,102,241,0.2)" stroke="#6366f1" strokeWidth="2"
            />
            {/* Labels */}
            {points.map((p, i) => (
                <text
                    key={i}
                    x={p.labelX} y={p.labelY}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="#94a3b8" fontSize="10" fontWeight="500"
                    style={{ userSelect: 'none' }}
                >
                    {frameworks[i].split('-')[0]}
                </text>
            ))}
            {/* Score dots */}
            {points.map((p, i) => (
                <circle key={i} cx={p.sx} cy={p.sy} r="4" fill="#6366f1" stroke="#1e1e2e" strokeWidth="1.5" />
            ))}
        </svg>
    )
}

export default function Compliance() {
    const [compliance, setCompliance] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const res = await apiClient.get('/analytics/compliance')
                setCompliance(res.data)
            } catch (e) {
                setError(e.response?.data?.detail || e.message)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#94a3b8', fontSize: '16px' }}>
            Loading compliance data…
        </div>
    )

    if (error) return (
        <div style={{ padding: '48px', textAlign: 'center', color: '#f87171' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠</div>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>{error}</div>
            <div style={{ color: '#94a3b8', fontSize: '14px' }}>
                Run a scan first to generate compliance data.
            </div>
        </div>
    )

    const fw = compliance?.frameworks || {}
    const fwNames = Object.keys(fw)
    const scores = fwNames.map(n => fw[n]?.score ?? 0)
    const overall = compliance?.overall_score ?? 0
    const overallColor = overall >= 80 ? '#10b981' : overall >= 60 ? '#f59e0b' : '#ef4444'

    return (
        <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '28px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                    Compliance Dashboard
                </h1>
                <p style={{ color: '#94a3b8', marginTop: '6px', fontSize: '15px' }}>
                    Framework scoring across CIS-AWS, SOC2, PCI-DSS, NIST-800-53, FinOps and Governance
                    {compliance?.based_on && ` · Based on scan ${compliance.scan_id?.slice(0, 8)}`}
                </p>
            </div>

            {/* Overview row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
                {[
                    { label: 'Overall Score', value: `${overall}%`, color: overallColor },
                    { label: 'Total Violations', value: compliance?.total_violations ?? 0, color: '#f59e0b' },
                    { label: 'Critical', value: compliance?.critical_violations ?? 0, color: '#ef4444' },
                    { label: 'Failing Rules', value: compliance?.unique_failing_rules ?? 0, color: '#8b5cf6' },
                ].map(s => (
                    <div key={s.label} style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '14px', padding: '20px',
                        display: 'flex', flexDirection: 'column', gap: '6px',
                    }}>
                        <div style={{ color: '#94a3b8', fontSize: '13px' }}>{s.label}</div>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Radar + Framework cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', marginBottom: '32px' }}>
                {/* Radar */}
                <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px', padding: '24px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                }}>
                    <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '16px', fontSize: '14px' }}>
                        Compliance Radar
                    </div>
                    {fwNames.length > 0 ? (
                        <RadarChart frameworks={fwNames} scores={scores} />
                    ) : (
                        <div style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>No data</div>
                    )}
                </div>

                {/* Framework grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', alignContent: 'start' }}>
                    {fwNames.map(name => (
                        <FrameworkCard key={name} name={name} data={fw[name]} />
                    ))}
                </div>
            </div>

            {/* Failing rules per framework */}
            {fwNames.some(n => fw[n]?.failed_rules?.length > 0) && (
                <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px', padding: '24px',
                }}>
                    <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '16px', fontSize: '15px' }}>
                        Failing Rules by Framework
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {fwNames.filter(n => fw[n]?.failed_rules?.length > 0).map(name => (
                            <div key={name} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                <div style={{
                                    background: FRAMEWORK_COLORS[name] + '22',
                                    border: `1px solid ${FRAMEWORK_COLORS[name]}44`,
                                    borderRadius: '6px', padding: '4px 10px',
                                    fontSize: '12px', fontWeight: 600,
                                    color: FRAMEWORK_COLORS[name], whiteSpace: 'nowrap', marginTop: '2px',
                                }}>
                                    {name}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {fw[name].failed_rules.map(r => (
                                        <span key={r} style={{
                                            background: 'rgba(239,68,68,0.1)',
                                            border: '1px solid rgba(239,68,68,0.2)',
                                            borderRadius: '6px', padding: '3px 8px',
                                            fontSize: '12px', color: '#f87171', fontFamily: 'monospace',
                                        }}>{r}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
