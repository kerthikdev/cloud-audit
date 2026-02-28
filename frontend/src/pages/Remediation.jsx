/**
 * Remediation — one-click fix page.
 * Lists all auto-fixable violations, shows estimated savings,
 * allows dry-run or real execution, shows audit log.
 */
import { useState, useEffect } from 'react'
import { Wrench, Play, Eye, CheckCircle, AlertTriangle, Clock, RefreshCw, TrendingDown } from 'lucide-react'
import apiClient from '../services/apiClient'

const RISK_COLORS = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#ef4444' }
const SEV_COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#3b82f6' }

function RiskBadge({ risk }) {
    const color = RISK_COLORS[risk] || '#64748b'
    return (
        <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: `${color}22`, color,
        }}>
            {risk} RISK
        </span>
    )
}

function SavingsBadge({ value }) {
    if (!value) return null
    return (
        <span style={{ fontSize: 12, color: '#10b981', fontWeight: 700 }}>
            ~${value.toFixed(2)}<span style={{ fontWeight: 400, color: '#64748b' }}>/mo</span>
        </span>
    )
}

function StatusBadge({ status }) {
    const map = {
        simulated: { color: '#3b82f6', label: 'Dry Run ✓' },
        completed: { color: '#10b981', label: 'Executed ✓' },
        failed: { color: '#ef4444', label: 'Failed ✗' },
        pending: { color: '#f59e0b', label: 'Pending…' },
    }
    const { color, label } = map[status] || { color: '#64748b', label: status }
    return <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
}

export default function Remediation() {
    const [remediations, setRemediations] = useState([])
    const [summary, setSummary] = useState({})
    const [log, setLog] = useState([])
    const [loading, setLoading] = useState(true)
    const [executing, setExecuting] = useState({}) // {id: bool}
    const [results, setResults] = useState({})     // {id: result}
    const [tab, setTab] = useState('available')    // 'available' | 'log'
    const [dryRun, setDryRun] = useState(true)

    const fetchData = async () => {
        setLoading(true)
        try {
            const [rRes, lRes] = await Promise.all([
                apiClient.get('/remediation'),
                apiClient.get('/remediation/log'),
            ])
            setRemediations(rRes.data.remediations || [])
            setSummary(rRes.data)
            setLog(lRes.data.log || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [])

    const execute = async (item) => {
        setExecuting(ex => ({ ...ex, [item.id]: true }))
        try {
            const res = await apiClient.post('/remediation/execute', {
                scan_id: item.scan_id,
                resource_id: item.resource_id,
                rule_id: item.rule_id,
                dry_run: dryRun,
            })
            setResults(r => ({ ...r, [item.id]: { success: true, msg: res.data.message, dry: dryRun } }))
            await fetchData()
        } catch (e) {
            setResults(r => ({ ...r, [item.id]: { success: false, msg: e.message } }))
        } finally {
            setExecuting(ex => ({ ...ex, [item.id]: false }))
        }
    }

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#94a3b8' }}>
            Loading remediations…
        </div>
    )

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <Wrench size={26} style={{ marginRight: '0.75rem', color: '#10b981' }} />
                        Remediation
                    </h1>
                    <p className="page-subtitle">One-click fixes for detected issues — dry-run first, then execute</p>
                </div>
                <button onClick={fetchData} disabled={loading} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                    borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}>
                    <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
                </button>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: '1.5rem' }}>
                {[
                    { icon: Wrench, label: 'Available Fixes', value: summary.total || 0, color: '#6366f1' },
                    { icon: TrendingDown, label: 'Total Savings', value: `$${(summary.total_estimated_savings || 0).toFixed(2)}/mo`, color: '#10b981' },
                    { icon: CheckCircle, label: 'Low-Risk Fixes', value: summary.low_risk_count || 0, color: '#10b981' },
                    { icon: AlertTriangle, label: 'Medium-Risk Fixes', value: summary.medium_risk_count || 0, color: '#f59e0b' },
                ].map(k => (
                    <div key={k.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '18px 22px' }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <k.icon size={12} />{k.label}
                        </div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.value}</div>
                    </div>
                ))}
            </div>

            {/* Dry-run toggle + tab bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {['available', 'log'].map(t => (
                        <button key={t} onClick={() => setTab(t)} style={{
                            padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                            border: 'none', cursor: 'pointer',
                            background: tab === t ? 'rgba(99,102,241,0.15)' : 'transparent',
                            color: tab === t ? '#818cf8' : '#64748b',
                        }}>
                            {t === 'available' ? `Available (${remediations.length})` : `Execution Log (${log.length})`}
                        </button>
                    ))}
                </div>
                {tab === 'available' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                        <span style={{ color: '#64748b' }}>Mode:</span>
                        <button onClick={() => setDryRun(true)} style={{
                            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: `1px solid ${dryRun ? '#3b82f6' : 'var(--border)'}`,
                            background: dryRun ? 'rgba(59,130,246,0.1)' : 'transparent',
                            color: dryRun ? '#60a5fa' : '#64748b', cursor: 'pointer',
                        }}>
                            <Eye size={11} style={{ marginRight: 4 }} />Dry Run (Safe)
                        </button>
                        <button onClick={() => setDryRun(false)} style={{
                            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: `1px solid ${!dryRun ? '#ef4444' : 'var(--border)'}`,
                            background: !dryRun ? 'rgba(239,68,68,0.1)' : 'transparent',
                            color: !dryRun ? '#f87171' : '#64748b', cursor: 'pointer',
                        }}>
                            <Play size={11} style={{ marginRight: 4 }} />Live Execution
                        </button>
                    </div>
                )}
            </div>

            {tab === 'available' && (
                <>
                    {!dryRun && (
                        <div style={{ padding: '12px 18px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', marginBottom: 16, fontSize: 13 }}>
                            ⚠️ <strong>Live Execution enabled.</strong> Actions will be applied to your real AWS resources. Use dry-run to preview first.
                        </div>
                    )}

                    {remediations.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                            <CheckCircle size={44} color="#10b981" style={{ opacity: 0.4, marginBottom: 16 }} />
                            <p>No remediations available. Run a scan to detect fixable issues.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {remediations.map(item => {
                                const result = results[item.id]
                                const isRunning = executing[item.id]
                                return (
                                    <div key={item.id} style={{
                                        padding: '18px 22px', borderRadius: 12,
                                        background: 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${result?.success === false ? 'rgba(239,68,68,0.3)' : result?.success ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)'}`,
                                        transition: 'border-color 0.2s',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                            <div style={{ flex: 1, minWidth: 260 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{item.title}</span>
                                                    <RiskBadge risk={item.risk} />
                                                    <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 4 }}>{item.rule_id}</span>
                                                    <span style={{ fontSize: 10, background: `${SEV_COLOR[item.severity] || '#64748b'}18`, color: SEV_COLOR[item.severity] || '#64748b', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>{item.severity}</span>
                                                </div>
                                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{item.description}</div>
                                                <div style={{ fontSize: 11, color: '#475569' }}>
                                                    {item.resource_type} · <code style={{ color: '#6366f1', fontSize: 10 }}>{item.resource_id}</code> · {item.region}
                                                </div>
                                                {result && (
                                                    <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 7, background: result.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', fontSize: 12, color: result.success ? '#10b981' : '#f87171' }}>
                                                        {result.dry && '🔍 [Dry Run] '}{result.msg}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                                                <SavingsBadge value={item.estimated_monthly_savings} />
                                                <button
                                                    onClick={() => execute(item)}
                                                    disabled={isRunning}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                        border: 'none', cursor: isRunning ? 'not-allowed' : 'pointer',
                                                        background: dryRun
                                                            ? 'rgba(59,130,246,0.13)'
                                                            : 'rgba(239,68,68,0.1)',
                                                        color: dryRun ? '#60a5fa' : '#f87171',
                                                        opacity: isRunning ? 0.6 : 1,
                                                    }}
                                                >
                                                    {isRunning ? <RefreshCw size={12} className="spin" /> : dryRun ? <Eye size={12} /> : <Play size={12} />}
                                                    {isRunning ? 'Running…' : dryRun ? 'Dry Run' : 'Execute'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </>
            )}

            {tab === 'log' && (
                <div className="card">
                    {log.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                            <Clock size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                            <p>No remediations executed yet.</p>
                        </div>
                    ) : (
                        <div className="table-wrapper">
                            <table>
                                <thead><tr>
                                    <th>Time</th><th>By</th><th>Action</th><th>Resource</th><th>Rule</th><th>Mode</th><th>Status</th><th>Message</th>
                                </tr></thead>
                                <tbody>
                                    {log.map(entry => (
                                        <tr key={entry.id}>
                                            <td style={{ fontSize: 11, color: '#64748b' }}>{new Date(entry.executed_at).toLocaleString()}</td>
                                            <td style={{ fontSize: 12 }}>{entry.executed_by}</td>
                                            <td><code style={{ fontSize: 11, color: '#818cf8' }}>{entry.action_type}</code></td>
                                            <td><code style={{ fontSize: 10, color: '#94a3b8' }}>{entry.resource_id?.slice(-12)}</code></td>
                                            <td style={{ fontSize: 11, color: '#64748b' }}>{entry.rule_id}</td>
                                            <td>{entry.dry_run ? <span style={{ color: '#3b82f6', fontSize: 11 }}>Dry Run</span> : <span style={{ color: '#ef4444', fontSize: 11 }}>Live</span>}</td>
                                            <td><StatusBadge status={entry.status} /></td>
                                            <td style={{ fontSize: 11, color: '#64748b', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
