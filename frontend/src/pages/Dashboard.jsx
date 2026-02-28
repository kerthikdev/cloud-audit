import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
    Server, HardDrive, Database, Globe2, RefreshCw, WifiOff,
    AlertTriangle, DollarSign, Zap, Network, Camera,
    LoaderCircle, GitBranch, Shield, ShieldCheck, Activity,
    FileDown, TrendingUp, Cloud, UserCheck,
} from 'lucide-react'
import { getSettings } from '../services/settingsService'
import apiClient from '../services/apiClient'
import ErrorBoundary from '../components/common/ErrorBoundary'

// Component imports
import EC2Table from '../components/resources/EC2Table'
import EBSTable from '../components/resources/EBSTable'
import S3Table from '../components/resources/S3Table'
import RDSTable from '../components/resources/RDSTable'
import EIPTable from '../components/resources/EIPTable'
import SnapshotTable from '../components/resources/SnapshotTable'
import LBTable from '../components/resources/LBTable'
import NATTable from '../components/resources/NATTable'
import LambdaTable from '../components/resources/LambdaTable'
import IAMTable from '../components/resources/IAMTable'
import CloudFrontTable from '../components/resources/CloudFrontTable'
import CloudWatchTable from '../components/resources/CloudWatchTable'
import ViolationsPanel from '../components/violations/ViolationsPanel'
import CostSummaryCard from '../components/cost/CostSummaryCard'
import { Empty } from '../components/resources/shared'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtDate = iso => iso ? new Date(iso).toLocaleString() : '—'

function StatCard({ icon: Icon, label, count, color, sublabel }) {
    return (
        <div className="stat-card">
            <div className="stat-icon" style={{ background: `${color}22` }}>
                <Icon size={20} color={color} />
            </div>
            <div className="stat-info">
                <div className="stat-value">{count}</div>
                <div className="stat-label">{label}</div>
                {sublabel && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sublabel}</div>}
            </div>
        </div>
    )
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const RESOURCE_TABS = [
    { key: 'EC2', label: 'EC2', icon: Server, color: '#3b82f6' },
    { key: 'EBS', label: 'EBS', icon: HardDrive, color: '#8b5cf6' },
    { key: 'S3', label: 'S3', icon: Globe2, color: '#f59e0b' },
    { key: 'RDS', label: 'RDS', icon: Database, color: '#10b981' },
    { key: 'EIP', label: 'Elastic IPs', icon: Network, color: '#ec4899' },
    { key: 'SNAPSHOT', label: 'Snapshots', icon: Camera, color: '#6b7280' },
    { key: 'LB', label: 'Load Balancers', icon: GitBranch, color: '#0ea5e9' },
    { key: 'NAT', label: 'NAT Gateways', icon: LoaderCircle, color: '#f59e0b' },
    { key: 'Lambda', label: 'Lambda', icon: Zap, color: '#a855f7' },
    { key: 'IAM', label: 'IAM', icon: UserCheck, color: '#ef4444' },
    { key: 'CloudFront', label: 'CloudFront', icon: Cloud, color: '#0ea5e9' },
    { key: 'CloudWatch', label: 'CloudWatch', icon: Activity, color: '#10b981' },
]

const VIEW_TABS = [
    { key: 'resources', label: 'Resources', icon: Server },
    { key: 'violations', label: 'Violations', icon: AlertTriangle },
    { key: 'costs', label: 'Costs', icon: DollarSign },
]

export default function Dashboard() {
    const navigate = useNavigate()
    const location = useLocation()
    const [connected, setConnected] = useState(null)
    const [scanRegions, setScanRegions] = useState(['us-east-1'])
    const [scanning, setScanning] = useState(false)
    const [resources, setResources] = useState([])
    const [violations, setViolations] = useState([])
    const [sevSummary, setSevSummary] = useState({})
    const [costData, setCostData] = useState(null)
    const [recommendations, setRecommendations] = useState([])
    const [complianceData, setComplianceData] = useState(null)
    const [riskData, setRiskData] = useState(null)
    const [lastScan, setLastScan] = useState(null)
    const [activeTab, setActiveTab] = useState('EC2')
    const [viewTab, setViewTab] = useState('resources')
    const [toast, setToast] = useState(null)
    const [loading, setLoading] = useState(true)
    const [pdfLoading, setPdfLoading] = useState(false)

    const showToast = (msg, type = 'info') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 4000)
    }

    const loadScanData = useCallback(async (scanId) => {
        try {
            const [resResp, vioResp, costResp, recResp] = await Promise.all([
                apiClient.get(`/scans/${scanId}/resources`, { params: { page_size: 500 } }),
                apiClient.get(`/scans/${scanId}/violations`, { params: { page_size: 500 } }),
                apiClient.get(`/scans/${scanId}/costs`),
                apiClient.get(`/scans/${scanId}/recommendations`),
            ])
            setResources(resResp.data.resources ?? [])
            setViolations(vioResp.data.violations ?? [])
            setSevSummary(vioResp.data.severity_summary ?? {})
            setCostData(costResp.data ?? null)
            setRecommendations(recResp.data?.recommendations ?? [])

            // Load compliance + risk in parallel (non-blocking)
            Promise.all([
                apiClient.get(`/scans/${scanId}/compliance`).catch(() => null),
                apiClient.get(`/scans/${scanId}/risk`).catch(() => null),
            ]).then(([cResp, rResp]) => {
                if (cResp?.data) setComplianceData(cResp.data)
                if (rResp?.data) setRiskData(rResp.data)
            })
        } catch {
            showToast('Failed to load scan data', 'error')
        }
    }, [])

    const handleDownloadPdf = async () => {
        if (!lastScan?.id) return
        setPdfLoading(true)
        try {
            const resp = await apiClient.get(`/scans/${lastScan.id}/export/report.pdf`, { responseType: 'blob' })
            const url = window.URL.createObjectURL(new Blob([resp.data]))
            const a = document.createElement('a')
            a.href = url
            a.download = `audit-report-${lastScan.id.slice(0, 8)}.pdf`
            a.click()
            window.URL.revokeObjectURL(url)
        } catch {
            showToast('PDF export failed', 'error')
        } finally {
            setPdfLoading(false)
        }
    }

    const loadLatestScan = useCallback(async () => {
        try {
            // Check if navigated here with a specific scan ID
            const navScanId = location.state?.scanId
            const { data } = await apiClient.get('/scans')
            const completed = (data.scans ?? []).filter(s => s.status === 'completed')
            if (!completed.length) { setLoading(false); return }

            const target = navScanId
                ? completed.find(s => s.id === navScanId) ?? completed[0]
                : completed[0]
            setLastScan(target)
            await loadScanData(target.id)
        } catch {
            showToast('Failed to load scan results', 'error')
        } finally {
            setLoading(false)
        }
    }, [loadScanData, location.state?.scanId])

    const pollScan = useCallback(async (scanId) => {
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 3000))
            try {
                const { data } = await apiClient.get(`/scans/${scanId}`)
                if (data.status === 'completed' || data.status === 'failed') {
                    if (data.status === 'completed') {
                        setLastScan(data)
                        await loadScanData(scanId)
                        showToast(`Scan complete — ${data.resource_count} resources found`, 'success')
                    } else {
                        showToast(`Scan failed: ${data.error || 'Unknown error'}`, 'error')
                    }
                    setScanning(false)
                    return
                }
            } catch { break }
        }
        setScanning(false)
    }, [loadScanData])

    const handleScan = async () => {
        setScanning(true)
        try {
            const { data } = await apiClient.post('/scans', { regions: scanRegions })
            showToast(`Scanning ${scanRegions.join(', ')}…`, 'info')
            pollScan(data.scan_id)
        } catch {
            showToast('Failed to start scan', 'error')
            setScanning(false)
        }
    }

    useEffect(() => {
        getSettings().then(s => {
            setConnected(s.connected)
            if (s.scan_regions?.length) setScanRegions(s.scan_regions)
            if (s.connected) loadLatestScan()
            else setLoading(false)
        }).catch(() => { setConnected(false); setLoading(false) })
    }, [loadLatestScan])

    const byType = type => resources.filter(r => r.resource_type === type)
    const criticalCount = sevSummary['CRITICAL'] || 0
    const highCount = sevSummary['HIGH'] || 0

    return (
        <div>
            {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

            {connected === false && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center' }}>
                    <WifiOff size={48} color="#ef4444" style={{ marginBottom: 16 }} />
                    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>AWS Account Not Connected</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 380, marginBottom: 24 }}>
                        Connect your AWS account in Settings to start viewing your cloud resources.
                    </div>
                    <button className="btn btn-primary" onClick={() => navigate('/settings')}>Go to Settings</button>
                </div>
            )}

            {connected && (
                <>
                    {/* Page header */}
                    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                        <div>
                            <div className="page-title">Cloud Resource Inventory</div>
                            <div className="page-subtitle">
                                {lastScan
                                    ? `Last scan: ${fmtDate(lastScan.started_at)} · Regions: ${lastScan.regions?.join(', ')}`
                                    : 'No scans run yet — click Scan Now'}
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={handleScan} disabled={scanning}
                            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <RefreshCw size={14} className={scanning ? 'spin' : ''} />
                            {scanning ? 'Scanning…' : 'Scan Now'}
                        </button>
                    </div>

                    {loading ? (
                        <div className="loading-wrapper"><div className="spinner" /><span>Loading resources…</span></div>
                    ) : (
                        <>
                            {/* Summary stat cards */}
                            <div className="stats-grid" style={{ marginBottom: 24 }}>
                                <StatCard icon={Server} label="EC2 Instances" count={byType('EC2').length} color="#3b82f6" />
                                <StatCard icon={HardDrive} label="EBS Volumes" count={byType('EBS').length} color="#8b5cf6" />
                                <StatCard icon={Globe2} label="S3 Buckets" count={byType('S3').length} color="#f59e0b" />
                                <StatCard icon={Database} label="RDS Databases" count={byType('RDS').length} color="#10b981" />
                                <StatCard icon={Zap} label="Lambda Fns" count={byType('Lambda').length} color="#a855f7" />
                                <StatCard icon={UserCheck} label="IAM Users" count={byType('IAM').length} color="#ef4444" />
                                <StatCard icon={Cloud} label="CloudFront" count={byType('CloudFront').length} color="#0ea5e9" />
                                <StatCard icon={Activity} label="CloudWatch" count={byType('CloudWatch').length} color="#10b981" />
                                <StatCard icon={AlertTriangle} label="Violations" count={violations.length} color="#ef4444"
                                    sublabel={criticalCount || highCount ? `${criticalCount} critical · ${highCount} high` : undefined} />
                                <StatCard icon={DollarSign} label="Est. Waste"
                                    count={costData?.summary?.estimated_monthly_waste != null
                                        ? `$${costData.summary.estimated_monthly_waste.toLocaleString()}`
                                        : '—'}
                                    color="#f97316" />
                            </div>

                            {/* Compliance + Risk inline banner */}
                            {(complianceData || riskData) && (
                                <ErrorBoundary>
                                    <div style={{
                                        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
                                    }}>
                                        {complianceData && (() => {
                                            const score = complianceData.overall_score ?? 0
                                            const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
                                            return (
                                                <div onClick={() => navigate('/compliance')} style={{
                                                    flex: 1, minWidth: 220, cursor: 'pointer',
                                                    background: 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${color}44`,
                                                    borderRadius: 12, padding: '14px 18px',
                                                    display: 'flex', alignItems: 'center', gap: 14,
                                                    transition: 'border-color 0.2s',
                                                }}>
                                                    <ShieldCheck size={26} color={color} />
                                                    <div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>COMPLIANCE SCORE</div>
                                                        <div style={{ fontSize: 22, fontWeight: 800, color }}>{score}%</div>
                                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                                            {complianceData.critical_violations ?? 0} critical violations
                                                        </div>
                                                    </div>
                                                    <div style={{ marginLeft: 'auto', fontSize: 11, color: '#6366f1' }}>View details →</div>
                                                </div>
                                            )
                                        })()}
                                        {riskData && (() => {
                                            const lvl = riskData.risk_level || 'UNKNOWN'
                                            const riskColors = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#3b82f6', SAFE: '#10b981' }
                                            const color = riskColors[lvl] || '#6b7280'
                                            return (
                                                <div style={{
                                                    flex: 1, minWidth: 220,
                                                    background: 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${color}44`,
                                                    borderRadius: 12, padding: '14px 18px',
                                                    display: 'flex', alignItems: 'center', gap: 14,
                                                }}>
                                                    <Shield size={26} color={color} />
                                                    <div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>RISK SCORE</div>
                                                        <div style={{ fontSize: 22, fontWeight: 800, color }}>{riskData.overall_risk_score ?? 0}</div>
                                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                                            {lvl} risk · {riskData.resource_count ?? 0} resources
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })()}
                                        {lastScan && (
                                            <button onClick={handleDownloadPdf} disabled={pdfLoading} style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '14px 20px', borderRadius: 12, cursor: 'pointer',
                                                background: pdfLoading ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.1)',
                                                border: '1px solid rgba(99,102,241,0.3)',
                                                color: pdfLoading ? '#64748b' : '#818cf8',
                                                fontWeight: 600, fontSize: 13,
                                                transition: 'all 0.2s',
                                            }}>
                                                <FileDown size={18} />
                                                {pdfLoading ? 'Generating…' : 'Download PDF Report'}
                                            </button>
                                        )}
                                    </div>
                                </ErrorBoundary>
                            )}

                            {/* Cost intelligence summary */}
                            {costData?.summary?.total_monthly_cost > 0 && <CostSummaryCard costData={costData} />}

                            {/* View tabs — Resources / Violations / Costs */}
                            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
                                {VIEW_TABS.map(({ key, label, icon: Icon }) => {
                                    const isActive = viewTab === key
                                    const dot = key === 'violations' && (criticalCount + highCount) > 0
                                    return (
                                        <button key={key} onClick={() => setViewTab(key)} style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '8px 18px', border: 'none', cursor: 'pointer',
                                            background: 'transparent', fontSize: 13, fontWeight: isActive ? 700 : 400,
                                            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                                            marginBottom: -1, position: 'relative',
                                        }}>
                                            <Icon size={14} />
                                            {label}
                                            {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', marginLeft: 2 }} />}
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Resources view */}
                            {viewTab === 'resources' && (
                                resources.length === 0 && !scanning ? (
                                    <div className="card">
                                        <Empty msg={lastScan ? 'No resources found in the last scan.' : 'Run a scan to see your AWS resources.'} />
                                    </div>
                                ) : (
                                    <div className="card">
                                        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
                                            {RESOURCE_TABS.map(({ key, label, icon: Icon, color }) => {
                                                const count = byType(key).length
                                                const isActive = activeTab === key
                                                return (
                                                    <button key={key} onClick={() => setActiveTab(key)} style={{
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        padding: '8px 14px', border: 'none', cursor: 'pointer', background: 'transparent',
                                                        fontSize: 13, fontWeight: isActive ? 700 : 400,
                                                        color: isActive ? color : 'var(--text-secondary)',
                                                        borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
                                                        marginBottom: -1,
                                                    }}>
                                                        <Icon size={13} />
                                                        {label}
                                                        <span style={{
                                                            background: isActive ? `${color}22` : 'var(--bg-tertiary)',
                                                            color: isActive ? color : 'var(--text-secondary)',
                                                            borderRadius: 10, padding: '1px 7px', fontSize: 11,
                                                        }}>{count}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>

                                        {activeTab === 'EC2' && <EC2Table items={byType('EC2')} />}
                                        {activeTab === 'EBS' && <EBSTable items={byType('EBS')} />}
                                        {activeTab === 'S3' && <S3Table items={byType('S3')} />}
                                        {activeTab === 'RDS' && <RDSTable items={byType('RDS')} />}
                                        {activeTab === 'EIP' && <EIPTable items={byType('EIP')} />}
                                        {activeTab === 'SNAPSHOT' && <SnapshotTable items={byType('SNAPSHOT')} />}
                                        {activeTab === 'LB' && <LBTable items={byType('LB')} />}
                                        {activeTab === 'NAT' && <NATTable items={byType('NAT')} />}
                                        {activeTab === 'Lambda' && <LambdaTable items={byType('Lambda')} />}
                                        {activeTab === 'IAM' && <IAMTable items={byType('IAM')} />}
                                        {activeTab === 'CloudFront' && <CloudFrontTable items={byType('CloudFront')} />}
                                        {activeTab === 'CloudWatch' && <CloudWatchTable items={byType('CloudWatch')} />}
                                    </div>
                                )
                            )}

                            {/* Violations view */}
                            {viewTab === 'violations' && (
                                <div className="card">
                                    <ViolationsPanel violations={violations} sevSummary={sevSummary} />
                                </div>
                            )}

                            {/* Top recs preview under violations */}
                            {viewTab === 'violations' && recommendations?.length > 0 && (
                                <div className="card" style={{ marginTop: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Zap size={16} color="#3b82f6" />
                                            <span style={{ fontWeight: 700, fontSize: 14 }}>Top Savings Recommendations</span>
                                        </div>
                                        <a href="/recommendations" style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
                                            View all {recommendations.length} →
                                        </a>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total estimated monthly savings:</span>
                                        <span style={{ fontWeight: 800, fontSize: 16, color: '#10b981' }}>
                                            ${recommendations.reduce((s, r) => s + (r.estimated_monthly_savings || 0), 0)
                                                .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {recommendations.filter(r => r.estimated_monthly_savings > 0).slice(0, 3).map((r, i) => {
                                            const catColors = { Compute: '#3b82f6', Storage: '#8b5cf6', Database: '#10b981', Network: '#0ea5e9', Governance: '#6b7280' }
                                            const color = catColors[r.category] || '#6b7280'
                                            return (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 6, background: `${color}0a`, border: `1px solid ${color}22` }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 600 }}>{r.title}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                                            <span style={{ color, fontWeight: 600 }}>{r.category}</span>
                                                            <span style={{ margin: '0 6px' }}>·</span>
                                                            <code style={{ fontSize: 10 }}>{r.rule_id}</code>
                                                        </div>
                                                    </div>
                                                    <div style={{ fontWeight: 800, fontSize: 14, color: '#10b981', marginLeft: 16 }}>
                                                        ${r.estimated_monthly_savings.toFixed(2)}/mo
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Costs view */}
                            {viewTab === 'costs' && (
                                <div className="card">
                                    {costData?.records?.length > 0 ? (
                                        <>
                                            <div style={{ fontWeight: 700, marginBottom: 16 }}>Cost Breakdown by Service &amp; Region</div>
                                            <div className="table-wrapper">
                                                <table>
                                                    <thead><tr><th>Service</th><th>Region</th><th>Amount (USD)</th><th>Period</th></tr></thead>
                                                    <tbody>
                                                        {[...costData.records]
                                                            .sort((a, b) => b.amount - a.amount)
                                                            .map((r, i) => (
                                                                <tr key={i}>
                                                                    <td>{r.service}</td>
                                                                    <td>{r.region}</td>
                                                                    <td style={{ fontWeight: 600 }}>${r.amount.toLocaleString()}</td>
                                                                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.period_start} → {r.period_end}</td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    ) : (
                                        <Empty msg="No cost data available. Run a scan to fetch cost data." />
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    )
}
