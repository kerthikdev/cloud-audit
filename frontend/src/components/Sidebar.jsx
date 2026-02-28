import { NavLink } from 'react-router-dom'
import {
    LayoutDashboard, Settings, Zap, BarChart2, History, LogOut,
    ShieldCheck, GitCompare, Wrench,
} from 'lucide-react'
import { getUser, logout } from '../services/authService'

const NAV = [
    { to: '/', label: 'Resources', icon: LayoutDashboard, end: true },
    { to: '/recommendations', label: 'Recommendations', icon: Zap },
    { to: '/remediation', label: 'Remediation', icon: Wrench },
    { to: '/compliance', label: 'Compliance', icon: ShieldCheck },
    { to: '/analytics', label: 'Analytics', icon: BarChart2 },
    { to: '/diff', label: 'Scan Diff', icon: GitCompare },
    { to: '/history', label: 'History', icon: History },
    { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
    const user = getUser()

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon">☁</div>
                <div>
                    <div className="sidebar-logo-text">CloudAudit</div>
                    <div className="sidebar-logo-sub">v4.0 · Tier 5</div>
                </div>
            </div>

            <nav className="sidebar-nav">
                {NAV.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    >
                        <Icon size={17} />
                        {label}
                    </NavLink>
                ))}
            </nav>

            {/* User info + logout at bottom */}
            <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid var(--border)' }}>
                {user && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                        Signed in as <strong style={{ color: 'var(--text)' }}>{user.username}</strong>
                        {user.role === 'admin' && (
                            <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>ADMIN</span>
                        )}
                    </div>
                )}
                <button onClick={logout} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                    fontSize: 13, transition: 'all 0.15s',
                }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                    <LogOut size={14} /> Sign Out
                </button>
            </div>
        </aside>
    )
}
