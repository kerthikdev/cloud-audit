import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { History as HistoryIcon, CheckCircle, XCircle, Clock, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import apiClient from '../services/apiClient'

function diffBadge(current, previous, label, higherIsBad = true) {
    if (previous == null || current == null) return null
    const delta = current - previous
    if (delta === 0) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>±0 {label}</span>
    const isBad = higherIsBad ? delta > 0 : delta < 0
    const color = isBad ? '#ef4444' : '#10b981'
    const Icon = delta > 0 ? TrendingUp : TrendingDown
    return (
        <span style={{ fontSize: 11, color, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <Icon size={11} /> {delta > 0 ? '+' : ''}{delta} {label}
        </span>
    )
}

function ScanStatusIcon({ status }) {
    if (status === 'completed') return <CheckCircle size={16} color="#10b981" />
    if (status === 'failed') return <XCircle size={16} color="#ef4444" />
    return <Clock size={16} color="#f59e0b" />
}

export default function History() {
    const navigate = useNavigate()
    const [scans, setScans] = useState([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const PAGE_SIZE = 20

    const fetchScans = () => {
        setLoading(true)
        apiClient.get('/scans').then(r => {
            setScans(r.data.scans || [])
        }).catch(() => { }).finally(() => setLoading(false))
    }

    useEffect(() => { fetchScans() }, [])

    const paginated = scans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const totalPages = Math.max(1, Math.ceil(scans.length / PAGE_SIZE))

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <HistoryIcon size={26} style={{ marginRight: '0.75rem', color: 'var(--accent)' }} />
                        Scan History
                    </h1>
                    <p className="page-subtitle">{scans.length} total scans across all time</p>
                </div>
                <button className="btn btn-sm" onClick={fetchScans} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
                </button>
            </div>

            {loading && scans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Loading…</div>
            ) : scans.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '4rem' }}>
                    <HistoryIcon size={40} style={{ opacity: 0.3, marginBottom: 16 }} />
                    <p style={{ color: 'var(--text-muted)' }}>No scans yet. Trigger your first scan from the Dashboard.</p>
                </div>
            ) : (
                <>
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Scan ID</th><th>Status</th><th>Started</th><th>Duration</th>
                                        <th>Regions</th><th>Resources</th><th>Violations</th><th>vs Previous</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map((scan, idx) => {
                                        const prev = scans[idx + 1]  // Previous scan for diff
                                        const startMs = new Date(scan.started_at).getTime()
                                        const endMs = scan.completed_at ? new Date(scan.completed_at).getTime() : null
                                        const durSec = endMs ? Math.round((endMs - startMs) / 1000) : null

                                        return (
                                            <tr key={scan.id} style={{ cursor: 'pointer' }}
                                                onClick={() => navigate('/', { state: { scanId: scan.id } })}>
                                                <td>
                                                    <code style={{ fontSize: 11, color: 'var(--accent)' }}>
                                                        {scan.id?.slice(0, 8)}…
                                                    </code>
                                                </td>
                                                <td>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                                                        <ScanStatusIcon status={scan.status} />
                                                        {scan.status}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    {scan.started_at ? new Date(scan.started_at).toLocaleString() : '—'}
                                                </td>
                                                <td style={{ fontSize: 12 }}>
                                                    {durSec != null ? `${durSec}s` : scan.status === 'running' ? 'Running…' : '—'}
                                                </td>
                                                <td style={{ fontSize: 12 }}>
                                                    {Array.isArray(scan.regions)
                                                        ? scan.regions.join(', ')
                                                        : scan.regions || '—'}
                                                </td>
                                                <td style={{ fontWeight: 600 }}>{scan.resource_count ?? '—'}</td>
                                                <td>
                                                    <span style={{
                                                        fontWeight: 600,
                                                        color: scan.violation_count > 0 ? '#ef4444' : '#10b981',
                                                    }}>
                                                        {scan.violation_count ?? '—'}
                                                    </span>
                                                </td>
                                                <td style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                    {prev && <>
                                                        {diffBadge(scan.resource_count, prev.resource_count, 'resources', false)}
                                                        {diffBadge(scan.violation_count, prev.violation_count, 'violations', true)}
                                                    </>}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                            <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Previous</button>
                            <span style={{ padding: '0.4rem 1rem', fontSize: 13, color: 'var(--text-muted)' }}>
                                Page {page} of {totalPages}
                            </span>
                            <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
