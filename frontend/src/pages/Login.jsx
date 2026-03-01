/**
 * Login.jsx — Smart login/register page.
 * 
 * On load, calls /auth/status to check if platform is initialized:
 *   - If NO users exist → show "First-Time Setup" form (register new admin)
 *   - If users exist    → show sign-in form only
 * 
 * Subsequent users are created by admin in the Users management page.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff, RefreshCw, UserPlus, LogIn, Lock } from 'lucide-react'
import { login, register } from '../services/authService'
import apiClient from '../services/apiClient'

export default function Login() {
    const navigate = useNavigate()
    const [initialized, setInitialized] = useState(null)  // null=loading, true/false
    const [mode, setMode] = useState('login')  // 'login' | 'setup'
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [email, setEmail] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Check if platform has been initialized (any users exist)
    useEffect(() => {
        apiClient.get('/auth/status').then(res => {
            const isInit = res.data.initialized
            setInitialized(isInit)
            setMode(isInit ? 'login' : 'setup')
        }).catch(() => {
            setInitialized(true)  // Fallback to login if status check fails
            setMode('login')
        })
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            if (mode === 'setup') {
                // First-time setup: register admin + auto-login
                await register(username.trim().toLowerCase(), password, email || undefined)
                await login(username.trim().toLowerCase(), password)
                navigate('/')
            } else {
                await login(username.trim().toLowerCase(), password)
                navigate('/')
            }
        } catch (err) {
            setError(err.message || 'Authentication failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const isSetup = mode === 'setup'

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg)', padding: '2rem',
        }}>
            {/* Animated background glow */}
            <div style={{
                position: 'fixed', top: '20%', left: '30%', width: 600, height: 600,
                background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
                pointerEvents: 'none',
            }} />

            <div style={{
                width: '100%', maxWidth: 420,
                background: 'rgba(15,23,42,0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '1.5rem',
                padding: '2.5rem',
                boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)',
                backdropFilter: 'blur(20px)',
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: 64, height: 64,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.25rem',
                        border: '1px solid rgba(99,102,241,0.3)',
                        boxShadow: '0 0 30px rgba(99,102,241,0.2)',
                    }}>
                        <Shield size={30} color="#818cf8" />
                    </div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.5px' }}>
                        Cloud Audit Platform
                    </h1>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                        {initialized === null
                            ? 'Checking status…'
                            : isSetup
                                ? '👋 Welcome! Create your admin account to begin'
                                : 'Sign in to access your dashboard'}
                    </p>
                </div>

                {/* First-time setup notice */}
                {isSetup && initialized === false && (
                    <div style={{
                        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                        borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem',
                        fontSize: 13, color: '#a5b4fc', lineHeight: 1.5,
                    }}>
                        <strong style={{ color: '#818cf8' }}>First-time setup:</strong> This account will be the <strong>admin</strong>. Additional users are created in the admin panel after login.
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{
                        background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem',
                        color: '#fca5a5', fontSize: '0.875rem', display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                        <span style={{ marginTop: 1 }}>⚠️</span>{error}
                    </div>
                )}

                {initialized === null ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#475569' }}>
                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto' }} />
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {isSetup && (
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Email (optional)</label>
                                <input
                                    type="email" placeholder="admin@company.com"
                                    value={email} onChange={e => setEmail(e.target.value)}
                                    autoComplete="email"
                                    style={{
                                        width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        )}

                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Username</label>
                            <input
                                type="text" placeholder={isSetup ? "admin" : "Enter username"}
                                value={username} onChange={e => setUsername(e.target.value)}
                                autoComplete="username" required
                                style={{
                                    width: '100%', marginTop: 6, padding: '10px 14px', borderRadius: 8,
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Password</label>
                            <div style={{ position: 'relative', marginTop: 6 }}>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    placeholder={isSetup ? "Min 6 characters" : "••••••••"}
                                    value={password} onChange={e => setPassword(e.target.value)}
                                    autoComplete={isSetup ? "new-password" : "current-password"}
                                    required
                                    style={{
                                        width: '100%', padding: '10px 44px 10px 14px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                    }}
                                />
                                <button type="button" onClick={() => setShowPass(s => !s)} style={{
                                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0,
                                }}>
                                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                padding: '11px 0', borderRadius: 10, marginTop: 4,
                                background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none', color: '#fff', fontWeight: 700, fontSize: 15,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.35)',
                                transition: 'all 0.2s',
                            }}
                        >
                            {loading
                                ? <><RefreshCw size={15} className="spin" /> Please wait…</>
                                : isSetup
                                    ? <><UserPlus size={15} /> Create Admin Account</>
                                    : <><LogIn size={15} /> Sign In</>}
                        </button>
                    </form>
                )}

                {/* Footer */}
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                    {!isSetup && initialized && (
                        <div style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Lock size={11} />
                            Contact your admin to create an account
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
