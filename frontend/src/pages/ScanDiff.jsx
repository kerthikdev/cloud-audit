/**
 * ScanDiff — compare any two scan sessions side by side.
 * Shows: added/removed resources, state changes, new/fixed violations,
 * type breakdown, waste delta.
 */
import { useState, useEffect } from 'react'
import { GitCompare, Plus, Minus, ArrowRight, RefreshCw, AlertTriangle, CheckCircle, TrendingUp, TrendingDown } from 'lucide-react'
import apiClient from '../services/apiClient'

const SEV_COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#3b82f6' }

function DeltaBadge({ value, label, positiveIsBad = true }) {
    if (value === 0) return <span style={{ color: '#64748b', fontSize: 12 }}>±0 {label}</span>
    const isBad = positiveIsBad ? value > 0 : value < 0
    const color = isBad ? '#ef4444' : '#10b981'
    const Icon = value > 0 ? TrendingUp : TrendingDown
    return (
        <span style={{ color, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
            <Icon size={12} />{value > 0 ? '+' : ''}{value} {label}
        </span>
    )
}

function StatCard({ icon: Icon, label, value, sub, color = '#6366f1' }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 12, marginBottom: 10 }}>
                <Icon size={13} />{label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{sub}</div>}
        </div>
    )
}

function ResourceList({ items, type, emptyMsg }) {
    const [show, setShow] = useState(false)
    if (!items.length) return <div style={{ color: '#475569', fontSize: 13, padding: '12px 0' }}>{emptyMsg}</div>
    const bgColor = type === 'added' ? 'rgba(16,185,129,0.06)' : type === 'removed' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)'
    const borderColor = type === 'added' ? '#10b981' : type === 'removed' ? '#ef4444' : '#f59e0b'
    const Icon = type === 'added' ? Plus : type === 'removed' ? Minus : ArrowRight
    const iconColor = type === 'added' ? '#10b981' : type === 'removed' ? '#ef4444' : '#f59e0b'
    const visible = show ? items : items.slice(0, 5)
    return (
        <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {visible.map((r, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8,
                        background: bgColor, border: `1px solid ${borderColor}22`,
                    }}>
                        <Icon size={14} color={iconColor} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                                {r.name || r.resource_id}
                            </span>
                            {type === 'state' && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>
                                    {r.old_state} → {r.new_state}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 4 }}>
                                {r.resource_type}
                            </span>
                            <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 4 }}>
                                {r.region}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            {items.length > 5 && (
                <button onClick={() => setShow(s => !s)} style={{
                    marginTop: 8, fontSize: 12, color: '#6366f1', background: 'none',
                    border: 'none', cursor: 'pointer', padding: '4px 0',
                }}>
                    {show ? 'Show less ↑' : `Show all ${items.length} ↓`}
                </button>
            )}
        </div>
    )
}

function ViolationList({ items, label, color }) {
    const [show, setShow] = useState(false)
    if (!items.length) return <div style={{ color: '#475569', fontSize: 13, padding: '12px 0' }}>None</div>
    const visible = show ? items : items.slice(0, 4)
    return (
        <div>
            {visible.map((v, i) => (
                <div key={i} style={{
                    padding: '10px 14px', borderRadius: 8,
                    marginBottom: 6, background: `${color}10`,
                    borderLeft: `3px solid ${SEV_COLOR[v.severity] || '#64748b'}`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: SEV_COLOR[v.severity] || '#64748b', background: `${SEV_COLOR[v.severity] || '#64748b'}22`, padding: '1px 6px', borderRadius: 4 }}>
                            {v.severity}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{v.rule_id}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#cbd5e1' }}>{v.message}</div>
                </div>
            ))}
            {items.length > 4 && (
                <button onClick={() => setShow(s => !s)} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                    {show ? 'Show less' : `+${items.length - 4} more`}
                </button>
            )}
        </div>
    )
}

export default function ScanDiff() {
    const [scans, setScans] = useState([])
    const [scanA, setScanA] = useState('')
    const [scanB, setScanB] = useState('')
    const [diff, setDiff] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        apiClient.get('/scans').then(r => {
            const completed = (r.data.scans || []).filter(s => s.status === 'completed')
            setScans(completed)
            if (completed.length >= 2) {
                setScanA(completed[1].id)
                setScanB(completed[0].id)
            }
        }).catch(() => { })
    }, [])

    const runDiff = async () => {
        if (!scanA || !scanB || scanA === scanB) return
        setLoading(true)
        setError(null)
        try {
            const res = await apiClient.get(`/scans/diff?scan_a=${scanA}&scan_b=${scanB}`)
            setDiff(res.data)
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const fmtDate = (s) => s ? new Date(s).toLocaleString() : '—'
    const summary = diff?.summary

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <GitCompare size={26} style={{ marginRight: '0.75rem', color: '#6366f1' }} />
                        Scan Diff
                    </h1>
                    <p className="page-subtitle">Compare any two scans to see exactly what changed</p>
                </div>
            </div>

            {/* Scan selector */}
            <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Baseline (Scan A — older)</label>
                    <select value={scanA} onChange={e => setScanA(e.target.value)} style={{
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                        borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '8px 12px',
                        cursor: 'pointer', outline: 'none',
                    }}>
                        <option value="" style={{ background: '#1e293b' }}>Select scan…</option>
                        {scans.map(s => (
                            <option key={s.id} value={s.id} style={{ background: '#1e293b' }}>
                                #{s.id.slice(0, 8)} — {fmtDate(s.started_at)} ({s.resource_count} resources)
                            </option>
                        ))}
                    </select>
                </div>

                <ArrowRight size={20} color="#475569" style={{ marginTop: 20, flexShrink: 0 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Comparison (Scan B — newer)</label>
                    <select value={scanB} onChange={e => setScanB(e.target.value)} style={{
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                        borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '8px 12px',
                        cursor: 'pointer', outline: 'none',
                    }}>
                        <option value="" style={{ background: '#1e293b' }}>Select scan…</option>
                        {scans.map(s => (
                            <option key={s.id} value={s.id} style={{ background: '#1e293b' }}>
                                #{s.id.slice(0, 8)} — {fmtDate(s.started_at)} ({s.resource_count} resources)
                            </option>
                        ))}
                    </select>
                </div>

                <button onClick={runDiff} disabled={loading || !scanA || !scanB || scanA === scanB} style={{
                    marginTop: 20, display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: 'none', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                }}>
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                    {loading ? 'Comparing…' : 'Compare Scans'}
                </button>
            </div>

            {error && (
                <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', marginBottom: '1.5rem' }}>
                    {error}
                </div>
            )}

            {!diff && !loading && (
                <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    <GitCompare size={44} style={{ opacity: 0.2, marginBottom: 16 }} />
                    <p>Select two scans above and click Compare to see what changed.</p>
                </div>
            )}

            {diff && (
                <>
                    {/* Summary KPI row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: '1.5rem' }}>
                        <StatCard icon={Plus} label="Resources Added" value={summary.resources_added} color="#10b981" />
                        <StatCard icon={Minus} label="Resources Removed" value={summary.resources_removed} color="#ef4444" />
                        <StatCard icon={ArrowRight} label="State Changes" value={summary.state_changes} color="#f59e0b" />
                        <StatCard icon={AlertTriangle} label="New Violations" value={summary.new_violations} color="#f97316" />
                        <StatCard icon={CheckCircle} label="Fixed Violations" value={summary.fixed_violations} color="#10b981" />
                        <StatCard
                            icon={summary.waste_delta >= 0 ? TrendingUp : TrendingDown}
                            label="Waste Delta"
                            value={`${summary.waste_delta >= 0 ? '+' : ''}$${summary.waste_delta?.toFixed(2)}`}
                            color={summary.waste_delta > 0 ? '#ef4444' : '#10b981'}
                            sub="vs baseline scan"
                        />
                    </div>

                    {/* Scan metadata comparison */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '1.5rem' }}>
                        {[{ label: 'Baseline (A)', data: diff.scan_a }, { label: 'Comparison (B)', data: diff.scan_b }].map(({ label, data }) => (
                            <div key={label} className="card">
                                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: 1, marginBottom: 12 }}>{label}</div>
                                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                                    <div>Scan: <code style={{ color: '#6366f1' }}>#{data.id?.slice(0, 8)}</code></div>
                                    <div>Date: {fmtDate(data.started_at)}</div>
                                    <div>Resources: <strong style={{ color: '#e2e8f0' }}>{data.resource_count}</strong></div>
                                    <div>Violations: <strong style={{ color: data.violation_count > 0 ? '#f59e0b' : '#10b981' }}>{data.violation_count}</strong></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Changes grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '1.5rem' }}>
                        <div className="card">
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#10b981', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Plus size={14} /> Added Resources ({summary.resources_added})
                            </div>
                            <ResourceList items={diff.added_resources} type="added" emptyMsg="No resources added." />
                        </div>
                        <div className="card">
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#ef4444', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Minus size={14} /> Removed Resources ({summary.resources_removed})
                            </div>
                            <ResourceList items={diff.removed_resources} type="removed" emptyMsg="No resources removed." />
                        </div>
                    </div>

                    {/* State changes */}
                    {diff.state_changes.length > 0 && (
                        <div className="card" style={{ marginBottom: '1.5rem' }}>
                            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b' }}>
                                <ArrowRight size={14} /> State Changes ({summary.state_changes})
                            </div>
                            <ResourceList items={diff.state_changes} type="state" emptyMsg="No state changes." />
                        </div>
                    )}

                    {/* Violations grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div className="card">
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#f97316', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={14} /> New Violations ({summary.new_violations})
                            </div>
                            <ViolationList items={diff.new_violations} color="#f97316" />
                        </div>
                        <div className="card">
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#10b981', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckCircle size={14} /> Fixed Violations ({summary.fixed_violations})
                            </div>
                            <ViolationList items={diff.fixed_violations} color="#10b981" />
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
