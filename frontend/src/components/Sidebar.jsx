import { NavLink } from 'react-router-dom'
import {
    LayoutDashboard, Settings, Zap, BarChart2, History, LogOut,
    ShieldCheck, GitCompare, Wrench, Users,
} from 'lucide-react'
import { getUser, logout } from '../services/authService'

function NavItem({ to, label, icon: Icon, end }) {
    return (
        <NavLink
            to={to}
            end={end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
            <Icon size={17} />
            {label}
        </NavLink>
    )
}

export default function Sidebar() {
    const user = getUser()
    const isAdmin = user?.role === 'admin'

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
                <NavItem to="/" label="Resources" icon={LayoutDashboard} end />
                <NavItem to="/recommendations" label="Recommendations" icon={Zap} />
                <NavItem to="/remediation" label="Remediation" icon={Wrench} />
                <NavItem to="/compliance" label="Compliance" icon={ShieldCheck} />
                <NavItem to="/analytics" label="Analytics" icon={BarChart2} />
                <NavItem to="/diff" label="Scan Diff" icon={GitCompare} />
                <NavItem to="/history" label="History" icon={History} />
                {/* Users management — shown for all, but API enforces admin-only */}
                {isAdmin && <NavItem to="/users" label="Users" icon={Users} />}
                <NavItem to="/settings" label="Settings" icon={Settings} />
            </nav>

            {/* User info + logout at bottom */}
            <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid var(--border)' }}>
                {user && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                        <div>Signed in as <strong style={{ color: 'var(--text)' }}>{user.username}</strong></div>
                        <div style={{ marginTop: 4 }}>
                            <span style={{
                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                                padding: '2px 7px', borderRadius: 4,
                                background: user.role === 'admin' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)',
                                color: user.role === 'admin' ? '#818cf8' : '#34d399',
                            }}>{user.role}</span>
                        </div>
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
