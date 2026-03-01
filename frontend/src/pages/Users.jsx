/**
 * Users — Admin-only user management page.
 * Create users with role (admin/viewer), deactivate, reactivate, delete.
 */
import { useState, useEffect } from 'react'
import { Users as UsersIcon, UserPlus, Trash2, RefreshCw, Shield, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react'
import apiClient from '../services/apiClient'
import { getUser } from '../services/authService'

const ROLE_COLORS = { admin: '#6366f1', viewer: '#10b981' }

function RoleBadge({ role }) {
    const color = ROLE_COLORS[role] || '#64748b'
    return (
        <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
            background: `${color}20`, color, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{role}</span>
    )
}

function StatusBadge({ active }) {
    return active
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#10b981' }}><CheckCircle size={12} />Active</span>
        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ef4444' }}><XCircle size={12} />Inactive</span>
}

function CreateUserModal({ onCreated, onClose }) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [email, setEmail] = useState('')
    const [role, setRole] = useState('viewer')
    const [showPass, setShowPass] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const submit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            await apiClient.post('/users', {
                username: username.trim().toLowerCase(),
                password,
                email: email || undefined,
                role,
            })
            onCreated()
        } catch (err) {
            setError(err.response?.data?.detail || err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000,
        }}>
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
                padding: '2rem', width: '100%', maxWidth: 420, boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
            }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 1.5rem' }}>
                    <UserPlus size={16} style={{ marginRight: 8, color: '#6366f1' }} />
                    Create New User
                </h2>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#fca5a5', fontSize: 13 }}>
                        {error}
                    </div>
                )}

                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Username *</label>
                        <input
                            type="text" value={username} onChange={e => setUsername(e.target.value)}
                            placeholder="john.doe" required
                            style={{ display: 'block', width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Email (optional)</label>
                        <input
                            type="email" value={email} onChange={e => setEmail(e.target.value)}
                            placeholder="john@company.com"
                            style={{ display: 'block', width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Password * (min 6 chars)</label>
                        <div style={{ position: 'relative', marginTop: 6 }}>
                            <input
                                type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••" required
                                style={{ display: 'block', width: '100%', padding: '9px 42px 9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                            />
                            <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0 }}>
                                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Role *</label>
                        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                            {['viewer', 'admin'].map(r => (
                                <button
                                    key={r} type="button" onClick={() => setRole(r)}
                                    style={{
                                        flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                                        border: `2px solid ${role === r ? ROLE_COLORS[r] : 'var(--border)'}`,
                                        background: role === r ? `${ROLE_COLORS[r]}15` : 'transparent',
                                        color: role === r ? ROLE_COLORS[r] : '#64748b',
                                        cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                >
                                    {r === 'admin' ? '🛡 Admin' : '👁 Viewer'}
                                </button>
                            ))}
                        </div>
                        <p style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
                            {role === 'admin' ? 'Full access: can scan, manage settings, create users' : 'Read-only: can view results but cannot trigger scans or change settings'}
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} style={{
                            flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}>
                            {loading ? <><RefreshCw size={13} className="spin" /> Creating…</> : <><UserPlus size={13} /> Create User</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default function Users() {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [actionLoading, setActionLoading] = useState({})
    const currentUser = getUser()

    const fetchUsers = async () => {
        setLoading(true)
        try {
            const res = await apiClient.get('/users')
            setUsers(res.data.users || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchUsers() }, [])

    const setAction = (id, val) => setActionLoading(prev => ({ ...prev, [id]: val }))

    const toggleActive = async (user) => {
        setAction(user.id, 'toggle')
        try {
            await apiClient.patch(`/users/${user.id}`, { is_active: !user.is_active })
            await fetchUsers()
        } catch (e) {
            alert(e.response?.data?.detail || e.message)
        } finally {
            setAction(user.id, null)
        }
    }

    const changeRole = async (user, newRole) => {
        setAction(user.id, 'role')
        try {
            await apiClient.patch(`/users/${user.id}`, { role: newRole })
            await fetchUsers()
        } catch (e) {
            alert(e.response?.data?.detail || e.message)
        } finally {
            setAction(user.id, null)
        }
    }

    const deleteUser = async (user) => {
        if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return
        setAction(user.id, 'delete')
        try {
            await apiClient.delete(`/users/${user.id}`)
            await fetchUsers()
        } catch (e) {
            alert(e.response?.data?.detail || e.message)
        } finally {
            setAction(user.id, null)
        }
    }

    return (
        <div className="page-content">
            {showModal && (
                <CreateUserModal
                    onCreated={() => { setShowModal(false); fetchUsers() }}
                    onClose={() => setShowModal(false)}
                />
            )}

            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <UsersIcon size={26} style={{ marginRight: '0.75rem', color: '#6366f1' }} />
                        User Management
                    </h1>
                    <p className="page-subtitle">{users.length} registered users — admin creates and assigns roles</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={fetchUsers} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
                        <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
                    </button>
                    <button onClick={() => setShowModal(true)} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
                        borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13,
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer',
                    }}>
                        <UserPlus size={13} /> Add User
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 20, fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b' }}>
                    <Shield size={12} color="#6366f1" />
                    <span><strong style={{ color: '#6366f1' }}>Admin</strong> — full access, can manage users, trigger scans</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b' }}>
                    <Eye size={12} color="#10b981" />
                    <span><strong style={{ color: '#10b981' }}>Viewer</strong> — read-only, sees all results</span>
                </div>
            </div>

            <div className="card">
                {loading && users.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading users…</div>
                ) : users.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                        <UsersIcon size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                        <p>No users yet. Click "Add User" to create one.</p>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Created By</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => {
                                    const isSelf = user.username === currentUser?.username
                                    const isLoading = actionLoading[user.id]
                                    return (
                                        <tr key={user.id}>
                                            <td>
                                                <span style={{ fontWeight: 600, fontSize: 14 }}>{user.username}</span>
                                                {isSelf && <span style={{ marginLeft: 8, fontSize: 10, color: '#6366f1', background: 'rgba(99,102,241,0.15)', padding: '1px 6px', borderRadius: 4 }}>you</span>}
                                            </td>
                                            <td style={{ fontSize: 13, color: '#94a3b8' }}>{user.email || <span style={{ color: '#475569' }}>—</span>}</td>
                                            <td>
                                                {!isSelf ? (
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        {['viewer', 'admin'].map(r => (
                                                            <button
                                                                key={r}
                                                                onClick={() => user.role !== r && changeRole(user, r)}
                                                                disabled={isLoading === 'role'}
                                                                style={{
                                                                    padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                                                                    border: `1px solid ${user.role === r ? ROLE_COLORS[r] : 'var(--border)'}`,
                                                                    background: user.role === r ? `${ROLE_COLORS[r]}20` : 'transparent',
                                                                    color: user.role === r ? ROLE_COLORS[r] : '#475569',
                                                                    cursor: user.role === r ? 'default' : 'pointer',
                                                                    textTransform: 'uppercase', letterSpacing: 0.5,
                                                                }}
                                                            >
                                                                {isLoading === 'role' && user.role !== r ? <RefreshCw size={9} className="spin" /> : r}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <RoleBadge role={user.role} />
                                                )}
                                            </td>
                                            <td><StatusBadge active={user.is_active} /></td>
                                            <td style={{ fontSize: 11, color: '#475569' }}>{user.created_by || '—'}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                    {!isSelf && (
                                                        <>
                                                            <button
                                                                onClick={() => toggleActive(user)}
                                                                disabled={isLoading === 'toggle'}
                                                                style={{
                                                                    padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                                    border: `1px solid ${user.is_active ? '#f59e0b' : '#10b981'}`,
                                                                    background: 'transparent',
                                                                    color: user.is_active ? '#f59e0b' : '#10b981',
                                                                    cursor: isLoading ? 'not-allowed' : 'pointer',
                                                                }}
                                                            >
                                                                {isLoading === 'toggle' ? <RefreshCw size={10} className="spin" /> : user.is_active ? 'Deactivate' : 'Reactivate'}
                                                            </button>
                                                            <button
                                                                onClick={() => deleteUser(user)}
                                                                disabled={!!isLoading}
                                                                style={{
                                                                    padding: '5px 8px', borderRadius: 6, fontSize: 11,
                                                                    border: '1px solid rgba(239,68,68,0.3)',
                                                                    background: 'transparent', color: '#ef4444',
                                                                    cursor: isLoading ? 'not-allowed' : 'pointer',
                                                                }}
                                                            >
                                                                {isLoading === 'delete' ? <RefreshCw size={10} className="spin" /> : <Trash2 size={13} />}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
